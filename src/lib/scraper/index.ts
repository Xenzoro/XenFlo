import * as cheerio from "cheerio";
import type { CrawlLogEntry, KnowledgeBase } from "@/types/knowledge";
import { emptyKnowledgeBase } from "@/lib/utils/knowledge";
import { ScrapeError } from "./errors";
import { fetchPage, isHtml } from "./fetch";
import { loadRobots } from "./robots";
import { discoverFromSitemaps, discoverLinks, pickCrawlOrder, priorityLinks } from "./discover";
import { extractPage } from "./extract";
import { scoreCompleteness } from "./score";
import { collectCss } from "./styles";
import { addToPool, crawlForMissing, crawlPages, linkFromUrl, outOfTime, pageRecord, type CrawlSession } from "./crawl";
import { cleanUrl, isSameDomain, normalizeUrl, pageKey } from "./url";
import { readMenus } from "./menus";

export { ScrapeError } from "./errors";

export interface ScrapeOptions {
  /** Pages to crawl including the homepage (capped at HARD_MAX_PAGES) */
  maxPages?: number;
  /** Overall time budget in ms; no new pages start after this */
  timeBudgetMs?: number;
  concurrency?: number;
  /** Polite pause between requests per worker, in ms */
  delayMs?: number;
  /** Called with each progress step (for a live progress UI later) */
  onProgress?: (entry: CrawlLogEntry) => void;
  /**
   * The user confirmed they own the business or have the owner's permission.
   * Lets a scrape continue when robots.txt restricts bots or AI crawlers.
   */
  ownerConsent?: boolean;
}

export const DEFAULT_MAX_PAGES = 15;
export const HARD_MAX_PAGES = 30;
const MIN_WORDS = 30; // below this the homepage is probably a JS-only shell

/**
 * Crawl a website and build a knowledge base from it.
 * 1. robots.txt  2. homepage + its CSS  3. discover links (nav + sitemap)
 * 4. priority pages (best page per category)  5. adaptive pages for missing fields  6. score
 */
export async function scrapeSite(input: string, options: ScrapeOptions = {}): Promise<KnowledgeBase> {
  const startUrl = normalizeUrl(input);
  const kb = emptyKnowledgeBase(startUrl);
  const maxPages = Math.min(options.maxPages ?? DEFAULT_MAX_PAGES, HARD_MAX_PAGES);
  const log = makeLogger(kb, options.onProgress);

  log("Checking robots.txt");
  const robots = await loadRobots(startUrl);
  const blocked = !robots.isAllowed(startUrl);
  const aiRestricted = robots.aiRestricted.length > 0;

  // robots.txt limits us: stop and ask, unless the owner already said yes.
  if (blocked && !options.ownerConsent) {
    kb.crawl.robotsAllowed = false;
    log("robots.txt does not allow automated access", "error");
    throw new ScrapeError("BLOCKED_ROBOTS", "This site's robots.txt doesn't allow automated access.");
  }
  if (aiRestricted && !options.ownerConsent) {
    log(`robots.txt restricts AI crawlers (${robots.aiRestricted.join(", ")})`, "error");
    throw new ScrapeError(
      "ROBOTS_AI_RESTRICTED",
      `This site's robots.txt asks AI crawlers not to read it (${robots.aiRestricted.slice(0, 4).join(", ")}).`,
    );
  }
  let isAllowed = robots.isAllowed;
  if ((blocked || aiRestricted) && options.ownerConsent) {
    // Record who allowed it and when; the crawl stays polite (honest User-Agent, crawl delay kept)
    kb.consent = { confirmed: true, timestamp: new Date().toISOString(), method: "checkbox_scrape" };
    kb.crawl.robotsAllowed = !blocked;
    log("robots.txt limits bots; continuing with the owner's permission", "warn");
    if (blocked) isAllowed = () => true;
  }
  const session = newSession(kb, isAllowed, robots.crawlDelay, options, log);

  // Homepage. A failure here fails the whole scrape.
  log(`Fetching homepage ${startUrl}`);
  const home = await fetchPage(startUrl);
  if (!isHtml(home.contentType)) throw new ScrapeError("NO_CONTENT", "That address didn't return a web page.");
  const homeUrl = cleanUrl(home.url, home.url) ?? startUrl; // after redirects (http -> https, bare -> www)
  kb.url = homeUrl;
  kb.company.website.value = homeUrl;
  session.visited.add(pageKey(startUrl));
  session.visited.add(pageKey(homeUrl));

  log("Reading styles for fonts and colors");
  const css = await collectCss(cheerio.load(home.body), homeUrl, isAllowed);
  const homeResult = extractPage(home.body, homeUrl, "home", kb, css);
  kb.crawl.pages.push(pageRecord(homeUrl, "home", home.status, homeResult.title, home.durationMs, null, homeResult.evidence));
  if (homeResult.wordCount < MIN_WORDS) log(`Homepage has very little readable text (${homeResult.wordCount} words)`, "warn");

  log("Discovering pages");
  const navLinks = discoverLinks(homeResult.$, homeUrl);
  const sitemapLinks = await discoverFromSitemaps(homeUrl, robots.sitemaps);
  addToPool(session, [...navLinks, ...sitemapLinks]);
  log(`Found ${navLinks.length} linked pages and ${sitemapLinks.length} sitemap entries`);

  // Priority pages: one of each useful kind (about, pricing, faq, contact...).
  const priority = priorityLinks([...session.pool.values()].sort((a, b) => b.score - a.score), session.visited);
  log(`Crawling ${priority.length} priority pages`);
  await crawlPages(session, priority, maxPages);

  // Adaptive pages: only those likely to fill fields that are still empty.
  await crawlForMissing(session, maxPages);
  // Menu PDFs found on the way (has its own time budget)
  await readMenus(session);

  return finish(session, () => {
    const nothingFound =
      homeResult.wordCount < MIN_WORDS && !kb.company.name.value && !kb.company.overview.value && kb.crawl.pages.length <= 1;
    if (nothingFound) throw new ScrapeError("NO_CONTENT", "We couldn't find readable content on this site.");
  });
}

/**
 * "Dig deeper": continue a previous crawl from its saved pending links, targeting
 * missing fields first, then the best remaining pages, up to HARD_MAX_PAGES total.
 */
export async function digDeeper(previous: KnowledgeBase, options: ScrapeOptions = {}): Promise<KnowledgeBase> {
  const kb: KnowledgeBase = structuredClone(previous);
  const log = makeLogger(kb, options.onProgress);
  const maxPages = Math.min(options.maxPages ?? HARD_MAX_PAGES, HARD_MAX_PAGES);

  if (kb.crawl.pages.length >= maxPages) {
    log(`Already crawled ${kb.crawl.pages.length} pages (the maximum)`, "warn");
    return kb;
  }
  if (!kb.crawl.pendingUrls.length) {
    log("No more pages left to crawl", "warn");
    return kb;
  }

  log("Digging deeper: checking robots.txt");
  const robots = await loadRobots(kb.url);
  // Same rules as scrapeSite: a restricted site needs the owner's consent, which a
  // consented scrape carries in kb.consent
  const consented = kb.consent?.method === "checkbox_scrape" || !!options.ownerConsent;
  if (!consented && !robots.isAllowed(kb.url)) {
    throw new ScrapeError("BLOCKED_ROBOTS", "This site's robots.txt doesn't allow automated access.");
  }
  if (!consented && robots.aiRestricted.length) {
    throw new ScrapeError("ROBOTS_AI_RESTRICTED", "This site's robots.txt asks AI crawlers not to read it.");
  }
  const isAllowed = consented && !robots.isAllowed(kb.url) ? () => true : robots.isAllowed;
  const session = newSession(kb, isAllowed, robots.crawlDelay, options, log);
  for (const page of kb.crawl.pages) session.visited.add(pageKey(page.url));
  // pendingUrls come back from the browser, so only trust ones on this company's own domain.
  addToPool(session, kb.crawl.pendingUrls.filter((u) => isSameDomain(u, kb.url)).map(linkFromUrl));
  kb.crawl.finishedAt = null;

  await crawlForMissing(session, maxPages);
  if (kb.crawl.pages.length < maxPages && !outOfTime(session)) {
    log("Crawling the best remaining pages");
    await crawlPages(session, pickCrawlOrder([...session.pool.values()].sort((a, b) => b.score - a.score), session.visited), maxPages);
  }
  await readMenus(session);
  return finish(session);
}

function newSession(
  kb: KnowledgeBase,
  isAllowed: (url: string) => boolean,
  crawlDelay: number | null,
  options: ScrapeOptions,
  log: CrawlSession["log"],
): CrawlSession {
  const delayMs = options.delayMs ?? 300;
  return {
    kb,
    isAllowed,
    visited: new Set(),
    pool: new Map(),
    started: Date.now(),
    timeBudgetMs: options.timeBudgetMs ?? 30_000,
    // Respect a Crawl-delay from robots.txt (capped so the demo stays usable).
    delayMs: Math.max(delayMs, Math.min((crawlDelay ?? 0) * 1000, 3_000)),
    concurrency: options.concurrency ?? 2,
    log,
  };
}

function makeLogger(kb: KnowledgeBase, onProgress?: ScrapeOptions["onProgress"]): CrawlSession["log"] {
  return (message, level = "info") => {
    const entry = { at: new Date().toISOString(), level, message };
    kb.crawl.log.push(entry);
    onProgress?.(entry);
  };
}

/** Save leftover links for "Dig deeper", score, and stamp timings. */
function finish(session: CrawlSession, check?: () => void): KnowledgeBase {
  const { kb } = session;
  if (outOfTime(session)) session.log("Time budget reached; stopping crawl", "warn");
  kb.crawl.pendingUrls = [...session.pool.values()]
    .sort((a, b) => b.score - a.score)
    .map((l) => l.url)
    .slice(0, 150);
  session.log("Extracting and scoring");
  kb.companyName = kb.company.name.value ?? new URL(kb.url).hostname.replace(/^www\./, "");
  kb.completeness = scoreCompleteness(kb);
  check?.();

  const now = new Date();
  kb.updatedAt = now.toISOString();
  kb.crawl.finishedAt = now.toISOString();
  kb.crawl.durationMs += Date.now() - session.started;
  session.log(
    `Done: ${kb.crawl.pages.length} pages total, ${kb.crawl.pendingUrls.length} more available, completeness ${kb.completeness.score}`,
  );
  return kb;
}
