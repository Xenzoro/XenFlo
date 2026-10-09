import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { PageCategory } from "@/types/knowledge";
import { fetchPage } from "./fetch";
import { cleanUrl, isSameSite } from "./url";

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
  { category: "legal", score: 15, pattern: /\bprivacy|terms|legal|cookie|disclaimer|refund|tos\b/i },
  { category: "about", score: 100, pattern: /\babout|our[- ]story|who[- ]we[- ]are|company|history|mission/i },
  { category: "team", score: 90, pattern: /\bteam|staff|leadership|founders?|people|meet[- ]the/i },
  { category: "services", score: 85, pattern: /\bservices?|solutions?|what[- ]we[- ]do|treatments?|menu/i },
  { category: "pricing", score: 85, pattern: /\bpricing|prices?|plans?|packages?|rates/i },
  { category: "products", score: 80, pattern: /\bproducts?|shop|store|catalog|collections?/i },
  { category: "faq", score: 75, pattern: /\bfaqs?\b|frequently[- ]asked|questions|help[- ]center|knowledge[- ]?base/i },
  { category: "testimonials", score: 70, pattern: /\btestimonials?|reviews?|case[- ]stud|success[- ]stor|customers/i },
  { category: "contact", score: 65, pattern: /\bcontact|get[- ]in[- ]touch|reach[- ]us/i },
  { category: "locations", score: 60, pattern: /\blocations?|find[- ]us|areas?[- ]served|service[- ]areas?|stores/i },
  { category: "press", score: 45, pattern: /\bpress|news(room)?|media|in[- ]the[- ]news/i },
  { category: "careers", score: 35, pattern: /\bcareers?|jobs|hiring|join[- ]us/i },
  { category: "blog", score: 10, pattern: /\bblog|articles?|posts?\b/i },
];

// Links we never want to crawl.
const SKIP_PATH = /\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|mp3|docx?|xlsx?|css|js|xml|json)$|\/(wp-admin|wp-login|login|signin|sign-in|signup|register|cart|checkout|account|my-account|feed|cdn-cgi)(\/|$)/i;

export function categorize(url: string, text = ""): { category: PageCategory; score: number } {
  const path = new URL(url).pathname;
  if (path === "/" || path === "") return { category: "home", score: 0 };
  for (const rule of CATEGORY_RULES) {
    // Path matches count more than anchor text matches.
    if (rule.pattern.test(path)) return { category: rule.category, score: rule.score };
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

    const existing = found.get(url);
    if (!existing || existing.score < total) {
      found.set(url, { url, category, score: total, from: "nav" });
    }
  });
  return [...found.values()];
}

/**
 * Read sitemap URLs (following one level of sitemap index files).
 * Sitemap-only links rank a bit lower than links the site shows in its nav.
 */
export async function discoverFromSitemaps(
  siteUrl: string,
  sitemapUrls: string[],
  { maxSitemaps = 3, maxUrls = 300 } = {},
): Promise<DiscoveredLink[]> {
  const queue = sitemapUrls.length ? [...sitemapUrls] : [new URL("/sitemap.xml", siteUrl).toString()];
  const results = new Map<string, DiscoveredLink>();
  let fetched = 0;

  while (queue.length && fetched < maxSitemaps && results.size < maxUrls) {
    const sitemapUrl = queue.shift()!;
    fetched++;
    try {
      const res = await fetchPage(sitemapUrl, { timeoutMs: 6_000, accept: "application/xml,text/xml" });
      const $ = cheerio.load(res.body, { xml: true });

      // A sitemap index lists other sitemaps; a urlset lists pages.
      $("sitemapindex > sitemap > loc").each((_, el) => {
        queue.push($(el).text().trim());
      });
      $("urlset > url > loc").each((_, el) => {
        const url = cleanUrl($(el).text().trim(), siteUrl);
        if (!url || !isSameSite(url, siteUrl) || SKIP_PATH.test(new URL(url).pathname)) return;
        if (results.has(url) || results.size >= maxUrls) return;
        const { category, score } = categorize(url);
        const depth = new URL(url).pathname.split("/").filter(Boolean).length;
        results.set(url, { url, category, score: score - 5 - Math.max(0, depth - 1) * 8, from: "sitemap" });
      });
    } catch {
      // No sitemap or unreadable: that's fine, nav links are the main source.
    }
  }
  return [...results.values()];
}

/** Merge link lists (keeping the best score per URL), sorted best first. */
export function rankLinks(...lists: DiscoveredLink[][]): DiscoveredLink[] {
  const merged = new Map<string, DiscoveredLink>();
  for (const link of lists.flat()) {
    const existing = merged.get(link.url);
    if (!existing || existing.score < link.score) merged.set(link.url, link);
  }
  return [...merged.values()].sort((a, b) => b.score - a.score);
}

/**
 * Pick which pages to crawl: first the best page from each category (so we get
 * breadth: about + pricing + faq, not five blog posts), then the rest by score.
 */
export function pickCrawlOrder(links: DiscoveredLink[], skip: Set<string>): DiscoveredLink[] {
  const candidates = links.filter((l) => !skip.has(l.url) && l.category !== "home");
  const firstPerCategory: DiscoveredLink[] = [];
  const seenCategories = new Set<PageCategory>();
  for (const link of candidates) {
    if (link.category === "other" || link.category === "blog") continue;
    if (!seenCategories.has(link.category)) {
      seenCategories.add(link.category);
      firstPerCategory.push(link);
    }
  }
  const picked = new Set(firstPerCategory.map((l) => l.url));
  return [...firstPerCategory, ...candidates.filter((l) => !picked.has(l.url))];
}
