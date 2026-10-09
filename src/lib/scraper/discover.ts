import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { PageCategory } from "@/types/knowledge";
import { fetchPage } from "./fetch";
import { cleanUrl, isSameSite, pageKey } from "./url";

export interface DiscoveredLink {
  url: string;
  category: PageCategory;
  /** Higher = crawl sooner */
  score: number;
  from: "nav" | "sitemap";
}

/**
 * Keyword rules, in priority order. A link's path and anchor text are matched
 * against these; the first match wins. Base score reflects how much knowledge
 * that kind of page usually holds.
 */
const CATEGORY_RULES: { category: PageCategory; score: number; pattern: RegExp }[] = [
  // Legal is checked first so "/terms-of-service" isn't mistaken for a services page.
  { category: "legal", score: 5, pattern: /\bprivacy|terms|legal|cookie|disclaimer|refund|tos\b/i },
  // Menus and price lists hold the offerings, the most useful data for restaurants and shops (Phase 10).
  { category: "menu", score: 95, pattern: /\bmenus?\b|\bfood\b|\bdrinks?\b|price[- ]?list|\bspecials\b|\bcatering\b/i },
  { category: "about", score: 100, pattern: /\babout|our[- ]story|who[- ]we[- ]are|company|history|mission/i },
  { category: "team", score: 90, pattern: /\bteam|staff|leadership|founders?|people|meet[- ]the/i },
  { category: "features", score: 80, pattern: /\bfeatures?|benefits|why[- ]us|why[- ]choose|how[- ]it[- ]works/i },
  { category: "services", score: 85, pattern: /\bservices?|solutions?|what[- ]we[- ]do|treatments?/i },
  { category: "pricing", score: 85, pattern: /\bpricing|prices?|plans?|packages?|rates/i },
  { category: "products", score: 80, pattern: /\bproducts?|shop|store|catalog|collections?/i },
  { category: "faq", score: 75, pattern: /\bfaqs?\b|frequently[- ]asked|questions|help[- ]center|knowledge[- ]?base/i },
  { category: "testimonials", score: 70, pattern: /\btestimonials?|reviews?|case[- ]stud|success[- ]stor|customers/i },
  { category: "contact", score: 65, pattern: /\bcontact|get[- ]in[- ]touch|reach[- ]us/i },
  { category: "locations", score: 60, pattern: /\blocations?|find[- ]us|areas?[- ]served|service[- ]areas?|stores/i },
  { category: "press", score: 45, pattern: /\bpress|news(room)?|media|in[- ]the[- ]news/i },
  { category: "careers", score: 8, pattern: /\bcareers?|jobs|hiring|join[- ]us/i },
  { category: "blog", score: 10, pattern: /\bblog|articles?|posts?\b/i },
];

// Links we never want to crawl.
const SKIP_PATH = /\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|mp3|docx?|xlsx?|css|js|xml|json)$|\/(wp-admin|wp-login|login|signin|sign-in|signup|register|cart|checkout|account|my-account|feed|cdn-cgi)(\/|$)/i;

// Sections that hold many individual posts. "/blog/new-server-location-tokyo" is a
// blog post even though its slug mentions "location".
const CONTENT_HUB = /^\/(blog|news|posts?|articles?|guides?|tutorials?|kb|knowledge-?base|docs|wiki|tag|tags|category|categories|author|press-releases|updates|stories|recipes|events)\//i;

export function categorize(url: string, text = ""): { category: PageCategory; score: number } {
  const path = new URL(url).pathname;
  if (path === "/" || path === "") return { category: "home", score: 0 };
  if (CONTENT_HUB.test(path)) return { category: "blog", score: 10 };
  // The URL path is the stronger signal, so check every rule against it before
  // falling back to the link text ("/faq" with text "About billing" is still an FAQ).
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(path)) return { category: rule.category, score: rule.score };
  }
  for (const rule of CATEGORY_RULES) {
    if (text && rule.pattern.test(text)) return { category: rule.category, score: rule.score - 5 };
  }
  return { category: "other", score: 5 };
}

/** Collect internal links from a page's anchors, ranked by category. */
export function discoverLinks($: CheerioAPI, pageUrl: string): DiscoveredLink[] {
  const found = new Map<string, DiscoveredLink>();
  $("a[href]").each((_, el) => {
    const url = cleanUrl($(el).attr("href") ?? "", pageUrl);
    if (!url || !isSameSite(url, pageUrl) || SKIP_PATH.test(new URL(url).pathname)) return;

    const text = $(el).text().replace(/\s+/g, " ").trim().slice(0, 80);
    const { category, score } = categorize(url, text);
    // Links in nav/header/footer are the site's own "important pages" list.
    const inNav = $(el).closest("nav, header, footer").length > 0;
    // Shallow paths are usually hub pages; deep paths are usually individual posts.
    const depth = new URL(url).pathname.split("/").filter(Boolean).length;
    const total = score + (inNav ? 10 : 0) - Math.max(0, depth - 1) * 8;

    const key = pageKey(url);
    const existing = found.get(key);
    if (!existing || existing.score < total) {
      found.set(key, { url, category, score: total, from: "nav" });
    }
  });
  return [...found.values()];
}

// Where sitemaps usually live when robots.txt doesn't say (WordPress/Yoast/Rank Math/Wix).
const SITEMAP_GUESSES = ["/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml", "/sitemap-index.xml", "/page-sitemap.xml"];

/**
 * Read sitemap URLs, following sitemap index files.
 * Sitemap-only links rank a bit lower than links the site shows in its nav.
 */
export async function discoverFromSitemaps(
  siteUrl: string,
  robotsSitemaps: string[],
  { maxFetches = 5, maxUrls = 300 } = {},
): Promise<DiscoveredLink[]> {
  const results = new Map<string, DiscoveredLink>();
  const queue = robotsSitemaps.length ? [...robotsSitemaps] : [];
  const guesses = SITEMAP_GUESSES.map((path) => new URL(path, siteUrl).toString());
  let fetches = 0;
  let foundAny = false;

  while (fetches < maxFetches && results.size < maxUrls) {
    // Use robots.txt sitemaps (and their children) first; only guess while nothing has worked.
    const next = queue.shift() ?? (!foundAny ? guesses.shift() : undefined);
    if (!next) break;
    fetches++;
    try {
      const res = await fetchPage(next, { timeoutMs: 6_000, accept: "application/xml,text/xml" });
      if (!/<(urlset|sitemapindex)[\s>]/i.test(res.body.slice(0, 2_000))) continue; // an HTML 404 page, not XML
      foundAny = true;
      const $ = cheerio.load(res.body, { xml: true });

      // A sitemap index lists other sitemaps. Page sitemaps hold the evergreen pages
      // we want; post/product/tag sitemaps are mostly blog posts and SKUs.
      const children = $("sitemapindex > sitemap > loc").map((_, el) => $(el).text().trim()).get();
      const rank = (u: string) => (/page/i.test(u) ? 0 : /post|product|tag|category|author|blog/i.test(u) ? 2 : 1);
      queue.push(...children.sort((a, b) => rank(a) - rank(b)));

      $("urlset > url > loc").each((_, el) => {
        const url = cleanUrl($(el).text().trim(), siteUrl);
        if (!url || !isSameSite(url, siteUrl) || SKIP_PATH.test(new URL(url).pathname)) return;
        if (results.has(pageKey(url)) || results.size >= maxUrls) return;
        const { category, score } = categorize(url);
        const depth = new URL(url).pathname.split("/").filter(Boolean).length;
        results.set(pageKey(url), { url, category, score: score - 5 - Math.max(0, depth - 1) * 8, from: "sitemap" });
      });
    } catch {
      // Missing or unreadable sitemap: try the next location.
    }
  }
  return [...results.values()];
}

/** Merge link lists (keeping the best score per URL), sorted best first. */
export function rankLinks(...lists: DiscoveredLink[][]): DiscoveredLink[] {
  const merged = new Map<string, DiscoveredLink>();
  for (const link of lists.flat()) {
    const key = pageKey(link.url);
    const existing = merged.get(key);
    if (!existing || existing.score < link.score) merged.set(key, link);
  }
  return [...merged.values()].sort((a, b) => b.score - a.score);
}

// Pages that rarely add knowledge: only crawled after every more useful page.
const LOW_VALUE: PageCategory[] = ["legal", "careers", "press", "blog", "other"];

/**
 * Pick which pages to crawl: first the best page from each useful category (so we get
 * breadth: about + pricing + faq, not five blog posts), then the rest by score,
 * with legal/careers/press/blog pages last.
 * `visited` holds pageKey()s of pages already crawled.
 */
/** The best page from each useful category: the "priority pages" of a crawl. */
export function priorityLinks(links: DiscoveredLink[], visited: Set<string>): DiscoveredLink[] {
  return pickCrawlOrder(links, visited).filter((l, i, all) => all.findIndex((x) => x.category === l.category) === i && !LOW_VALUE.includes(l.category));
}

export function pickCrawlOrder(links: DiscoveredLink[], visited: Set<string>): DiscoveredLink[] {
  const candidates = links.filter((l) => !visited.has(pageKey(l.url)) && l.category !== "home");
  const firstPerCategory: DiscoveredLink[] = [];
  const seenCategories = new Set<PageCategory>();
  for (const link of candidates) {
    if (LOW_VALUE.includes(link.category) || seenCategories.has(link.category)) continue;
    seenCategories.add(link.category);
    firstPerCategory.push(link);
  }
  const picked = new Set(firstPerCategory);
  const rest = candidates.filter((l) => !picked.has(l));
  const useful = rest.filter((l) => !LOW_VALUE.includes(l.category));
  const low = rest.filter((l) => LOW_VALUE.includes(l.category));
  return [...firstPerCategory, ...useful, ...low];
}
