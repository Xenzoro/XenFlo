import type { CrawledPage, CrawlLogEntry, KnowledgeBase, PageCategory } from "@/types/knowledge";
import { emptyKnowledgeBase } from "@/lib/utils/knowledge";
import { ScrapeError } from "./errors";
import { fetchPage, isHtml } from "./fetch";
import { loadRobots } from "./robots";
import { discoverFromSitemaps, discoverLinks, pickCrawlOrder, rankLinks } from "./discover";
import { extractPage } from "./extract";
import { scoreCompleteness } from "./score";
import { normalizeUrl } from "./url";

export { ScrapeError } from "./errors";

export interface ScrapeOptions {
  /** Pages to crawl including the homepage (hard max 30) */
  maxPages?: number;
  /** Overall time budget in ms; no new pages start after this */
  timeBudgetMs?: number;
  concurrency?: number;
  /** Polite pause between requests per worker, in ms */
  delayMs?: number;
  /** Called with each progress step (for a live progress UI later) */
  onProgress?: (entry: CrawlLogEntry) => void;
}

const HARD_MAX_PAGES = 30;
const MIN_WORDS = 30; // below this the homepage is probably a JS-only shell

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Crawl a website and build a (partial) knowledge base from it.
 * Steps: normalize URL -> robots.txt -> homepage -> discover links -> crawl priority pages -> score.
 */
export async function scrapeSite(input: string, options: ScrapeOptions = {}): Promise<KnowledgeBase> {
  const {
    maxPages = 8,
    timeBudgetMs = 25_000,
    concurrency = 2,
    delayMs = 300,
    onProgress,
  } = options;
  const pageCap = Math.min(maxPages, HARD_MAX_PAGES);
  const started = Date.now();

  const startUrl = normalizeUrl(input);
  const kb = emptyKnowledgeBase(startUrl);
  const log = (message: string, level: CrawlLogEntry["level"] = "info") => {
    const entry = { at: new Date().toISOString(), level, message };
    kb.crawl.log.push(entry);
    onProgress?.(entry);
  };

  // 1. robots.txt
  log("Checking robots.txt");
  const robots = await loadRobots(startUrl);
  if (!robots.isAllowed(startUrl)) {
    kb.crawl.robotsAllowed = false;
    log("robots.txt does not allow automated access", "error");
    throw new ScrapeError("BLOCKED_ROBOTS", "This site's robots.txt doesn't allow automated access.");
  }
  // Respect a Crawl-delay if the site sets one (capped so the demo stays usable).
  const politeDelay = Math.max(delayMs, Math.min((robots.crawlDelay ?? 0) * 1000, 3_000));

  // 2. Homepage. A failure here fails the whole scrape.
  log(`Fetching homepage ${startUrl}`);
  const home = await fetchPage(startUrl);
  if (!isHtml(home.contentType)) {
    throw new ScrapeError("NO_CONTENT", "That address didn't return a web page.");
  }
  const homeUrl = home.url; // after redirects (e.g. http -> https, bare -> www)
  kb.url = homeUrl;
  kb.company.website.value = homeUrl;
  const homeResult = extractPage(home.body, homeUrl, "home", kb);
  kb.crawl.pages.push(pageRecord(homeUrl, "home", home.status, homeResult.title, home.durationMs, null));
  if (homeResult.wordCount < MIN_WORDS) {
    log(`Homepage has very little readable text (${homeResult.wordCount} words)`, "warn");
  }

  // 3. Discover pages from the homepage links and the sitemap.
  log("Discovering pages");
  const navLinks = discoverLinks(homeResult.$, homeUrl);
  const sitemapLinks = await discoverFromSitemaps(homeUrl, robots.sitemaps);
  const ranked = rankLinks(navLinks, sitemapLinks).filter((l) => robots.isAllowed(l.url));
  log(`Found ${navLinks.length} linked pages and ${sitemapLinks.length} sitemap entries`);

  const visited = new Set([startUrl, homeUrl]);
  const queue = pickCrawlOrder(ranked, visited).slice(0, pageCap - 1);
  const total = queue.length;

  // 4. Crawl with a small worker pool.
  let done = 0;
  const worker = async () => {
    while (queue.length) {
      if (Date.now() - started > timeBudgetMs) {
        log("Time budget reached; stopping crawl", "warn");
        return;
      }
      const link = queue.shift()!;
      if (visited.has(link.url)) continue;
      visited.add(link.url);
      log(`Crawling ${++done} of ${total}: ${new URL(link.url).pathname}`);
      try {
        const page = await fetchPage(link.url);
        if (!isHtml(page.contentType)) continue;
        visited.add(page.url);
        const result = extractPage(page.body, page.url, link.category, kb);
        kb.crawl.pages.push(pageRecord(page.url, link.category, page.status, result.title, page.durationMs, null));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        const status = err instanceof ScrapeError ? (err.status ?? null) : null;
        kb.crawl.pages.push(pageRecord(link.url, link.category, status, null, 0, message));
        log(`Failed ${link.url}: ${message}`, "warn");
      }
      await sleep(politeDelay);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  // 5. Wrap up: remember uncrawled pages for "Dig deeper", then score.
  kb.crawl.pendingUrls = ranked.map((l) => l.url).filter((u) => !visited.has(u)).slice(0, 100);
  log("Extracting and scoring");
  kb.companyName = kb.company.name.value ?? new URL(homeUrl).hostname.replace(/^www\./, "");
  kb.completeness = scoreCompleteness(kb);

  const nothingFound =
    homeResult.wordCount < MIN_WORDS && !kb.company.name.value && !kb.company.overview.value && kb.crawl.pages.length <= 1;
  if (nothingFound) {
    throw new ScrapeError("NO_CONTENT", "We couldn't find readable content on this site.");
  }

  kb.crawl.finishedAt = new Date().toISOString();
  kb.crawl.durationMs = Date.now() - started;
  log(`Done: ${kb.crawl.pages.length} pages in ${(kb.crawl.durationMs / 1000).toFixed(1)}s, completeness ${kb.completeness.score}`);
  return kb;
}

function pageRecord(
  url: string,
  category: PageCategory,
  status: number | null,
  title: string | null,
  durationMs: number,
  error: string | null,
): CrawledPage {
  return { url, category, status, title, fetchedAt: new Date().toISOString(), durationMs, error };
}
