import type { CrawledPage, CrawlLogEntry, KnowledgeBase, PageCategory } from "@/types/knowledge";
import { ScrapeError } from "./errors";
import { fetchPage, isHtml } from "./fetch";
import { categorize, discoverLinks, type DiscoveredLink } from "./discover";
import { extractPage, type PageEvidence } from "./extract";
import { potentialPoints, scoreCompleteness } from "./score";
import { cleanUrl, pageKey } from "./url";

/** Shared state for one crawl session (initial scrape or "dig deeper"). */
export interface CrawlSession {
  kb: KnowledgeBase;
  isAllowed: (url: string) => boolean;
  /** pageKey()s of pages already fetched */
  visited: Set<string>;
  /** Every link we know about but haven't crawled, keyed by pageKey */
  pool: Map<string, DiscoveredLink>;
  started: number;
  timeBudgetMs: number;
  delayMs: number;
  concurrency: number;
  log: (message: string, level?: CrawlLogEntry["level"]) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const outOfTime = (s: CrawlSession) => Date.now() - s.started > s.timeBudgetMs;

export function addToPool(session: CrawlSession, links: DiscoveredLink[]): void {
  for (const link of links) {
    const key = pageKey(link.url);
    if (session.visited.has(key) || !session.isAllowed(link.url)) continue;
    const existing = session.pool.get(key);
    if (!existing || existing.score < link.score) session.pool.set(key, link);
  }
}

/**
 * Crawl the given links (in order) with a small worker pool, until `maxTotalPages`
 * pages are in the knowledge base or the time budget runs out.
 * Links found on crawled pages are added to the pool for later passes.
 */
export async function crawlPages(session: CrawlSession, links: DiscoveredLink[], maxTotalPages: number): Promise<number> {
  const { kb } = session;
  const queue = links.filter((l) => !session.visited.has(pageKey(l.url)));
  let crawled = 0;
  // Pages being fetched right now. Counted against the cap so two workers
  // can't both take the last slot.
  let inFlight = 0;

  const worker = async () => {
    while (queue.length && kb.crawl.pages.length + inFlight < maxTotalPages) {
      if (outOfTime(session)) return;
      const link = queue.shift()!;
      const key = pageKey(link.url);
      if (session.visited.has(key)) continue;
      session.visited.add(key);
      session.pool.delete(key);
      session.log(`Crawling ${kb.crawl.pages.length + inFlight + 1} of ${maxTotalPages}: ${new URL(link.url).pathname}`);

      inFlight++;
      try {
        const page = await fetchPage(link.url);
        const finalUrl = cleanUrl(page.url, page.url) ?? link.url;
        // A redirect can land on a page we already have (e.g. /pricing -> /pricing/).
        if (pageKey(finalUrl) !== key && session.visited.has(pageKey(finalUrl))) continue;
        session.visited.add(pageKey(finalUrl));
        if (!isHtml(page.contentType)) continue;

        const result = extractPage(page.body, finalUrl, link.category, kb);
        kb.crawl.pages.push(pageRecord(finalUrl, link.category, page.status, result.title, page.durationMs, null, result.evidence));
        addToPool(session, discoverLinks(result.$, finalUrl));
        crawled++;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        const status = err instanceof ScrapeError ? (err.status ?? null) : null;
        kb.crawl.pages.push(pageRecord(link.url, link.category, status, null, 0, message));
        session.log(`Failed ${link.url}: ${message}`, "warn");
      } finally {
        inFlight--;
      }
      await sleep(session.delayMs);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, session.concurrency) }, worker));
  return crawled;
}

/**
 * Adaptive pass: look at which important fields are still missing, crawl the
 * known pages most likely to fill them, re-check, and repeat. Stops when no
 * page in the pool targets a missing field, or at the page cap / time budget.
 */
export async function crawlForMissing(session: CrawlSession, maxTotalPages: number): Promise<void> {
  const { kb } = session;
  while (kb.crawl.pages.length < maxTotalPages && !outOfTime(session)) {
    const missing = scoreCompleteness(kb).missing;
    const targets = [...session.pool.values()]
      .map((link) => ({ link, points: potentialPoints(kb, link.url, link.category, missing) || unknownPagePoints(link, missing) }))
      .filter((t) => t.points > 0)
      .sort((a, b) => b.points - a.points || b.link.score - a.link.score);
    if (!targets.length) {
      session.log("No remaining pages look likely to fill the missing fields");
      return;
    }

    const labels = missing.filter((m) => targets.some((t) => potentialPoints(kb, t.link.url, t.link.category, [m]) > 0));
    session.log(
      labels.length
        ? `Looking for: ${labels.map((m) => m.split(".").pop()).join(", ")}`
        : "Checking other pages for missing info",
    );
    // Crawl a small batch, then re-check what's missing before choosing more.
    const batch = targets.slice(0, session.concurrency * 2).map((t) => t.link);
    // Every link in the batch is marked visited and leaves the pool, so this loop always ends.
    await crawlPages(session, batch, maxTotalPages);
  }
}

// Legal pages worth reading for the business's legal name, best first (matched on the path, not the
// link text, so "/blog/minecraft-survival-illegal-blocks" doesn't count)
const LEGAL_PATHS = [/(?:^|[/-])privacy/i, /(?:^|[/-])terms/i, /(?:^|[/-])legal/i];

/**
 * Legal name or entity type still missing and no privacy / terms page crawled: read one, even
 * past the page cap (it still counts as a crawled page, and never goes past `hardMax`).
 * The pool only holds robots-allowed internal links, and fetchPage applies the usual SSRF checks.
 */
export async function crawlLegalPage(session: CrawlSession, hardMax: number): Promise<void> {
  const { kb } = session;
  if (kb.company.legalName.value !== null && kb.company.legalEntityType.value !== null) return;
  if (kb.crawl.pages.some((p) => p.category === "legal") || kb.crawl.pages.length >= hardMax || outOfTime(session)) return;
  const rank = (url: string) => LEGAL_PATHS.findIndex((re) => re.test(new URL(url).pathname));
  const link = [...session.pool.values()]
    .filter((l) => l.category === "legal" && rank(l.url) >= 0)
    .sort((a, b) => rank(a.url) - rank(b.url))[0];
  if (!link) return;
  session.log("Checking the legal page for the business's legal name");
  await crawlPages(session, [link], kb.crawl.pages.length + 1);
}

/**
 * Pages we can't categorize ("/sakana", "/umami" on a multi-brand site) might hold
 * anything, so shallow ones from the site's own nav get a small score: crawled only
 * after every clearly-targeted page.
 */
function unknownPagePoints(link: DiscoveredLink, missing: string[]): number {
  if (link.category !== "other" || link.from !== "nav" || missing.length < 3) return 0;
  const depth = new URL(link.url).pathname.split("/").filter(Boolean).length;
  return depth <= 1 ? 1 : 0;
}

/** Rebuild a link from a saved URL (used by "dig deeper"). */
export function linkFromUrl(url: string): DiscoveredLink {
  const { category, score } = categorize(url);
  return { url, category, score, from: "nav" };
}

export function pageRecord(
  url: string,
  category: PageCategory,
  status: number | null,
  title: string | null,
  durationMs: number,
  error: string | null,
  evidence?: PageEvidence,
): CrawledPage {
  return { url, category, status, title, fetchedAt: new Date().toISOString(), durationMs, error, ...evidence };
}
