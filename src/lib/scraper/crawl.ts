import type { CrawledPage, CrawlLogEntry, KnowledgeBase, PageCategory } from "@/types/knowledge";
import { ScrapeError } from "./errors";
import { fetchPage, isHtml } from "./fetch";
import { categorize, classifyContent, discoverLinks, mergeLink, type DiscoveredLink } from "./discover";
import { extractPage, pageHeadings, type PageEvidence } from "./extract";
import { countFacts, potentialPoints, scoreCompleteness } from "./score";
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
  /** Deep crawls only: links that fail this are never queued or crawled (focus.ts) */
  accept?: (link: DiscoveredLink) => boolean;
  /** What this crawl has learned from the pages it read (see rankScore) */
  learned: CrawlLearning;
}

/**
 * Yield-based ranking. Each crawled page records how many new facts it added; the waiting
 * links are re-ranked with what that teaches us:
 * - kinds of page already found (by URL or by content) wait behind kinds we haven't seen
 * - links found on a high-yield page, or next to it ("/menus/lunch" after a rich "/menus/dinner"), go sooner
 * - a kind of page whose last 3 pages added nothing goes last
 */
export interface CrawlLearning {
  found: Set<PageCategory>;
  /** pageKey()s of pages that added at least HIGH_YIELD facts */
  highYield: Set<string>;
  /** Parent paths of those pages ("/menus" for "/menus/dinner"), never "/" */
  highYieldParents: Set<string>;
  /** Zero-yield pages in a row, per category */
  zeroStreak: Map<PageCategory, number>;
  /** Categories that hit STALE_AFTER zero-yield pages in a row */
  stale: Set<PageCategory>;
}

export const HIGH_YIELD = 4;
export const STALE_AFTER = 3;
// One good page of these kinds is usually enough; other kinds (menus, services, locations,
// restaurants on a group site) are worth reading several of.
const SINGLE_PAGE: PageCategory[] = ["about", "team", "faq", "testimonials", "contact", "pricing"];

export function emptyLearning(): CrawlLearning {
  return { found: new Set(), highYield: new Set(), highYieldParents: new Set(), zeroStreak: new Map(), stale: new Set() };
}

const parentPath = (url: string) => {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return parts.length > 1 ? `/${parts.slice(0, -1).join("/")}` : null;
};

/** Boosts and penalties from what the crawl learned so far (0 before any page is read). */
export function learnedAdjustment(link: DiscoveredLink, learned: CrawlLearning): number {
  let adjust = 0;
  if (link.foundOn && learned.highYield.has(link.foundOn)) adjust += 15;
  const parent = parentPath(link.url);
  if (parent && learned.highYieldParents.has(parent)) adjust += 10;
  if (SINGLE_PAGE.includes(link.category) && learned.found.has(link.category)) adjust -= 25;
  if (learned.stale.has(link.category)) adjust -= 60;
  return adjust;
}

/** Overall rank of a waiting link: keyword score + points it could add + what we learned. */
export function rankScore(link: DiscoveredLink, session: CrawlSession, missing = scoreCompleteness(session.kb).missing): number {
  return link.score + potentialPoints(session.kb, link.url, link.category, missing) + learnedAdjustment(link, session.learned);
}

/** Record one page's yield (see CrawlLearning). Returns true when its category just went stale. */
export function recordYield(learned: CrawlLearning, url: string, category: PageCategory, newFacts: number): boolean {
  if (newFacts >= HIGH_YIELD) {
    learned.highYield.add(pageKey(url));
    const parent = parentPath(url);
    if (parent) learned.highYieldParents.add(parent);
  }
  const streak = newFacts > 0 ? 0 : (learned.zeroStreak.get(category) ?? 0) + 1;
  learned.zeroStreak.set(category, streak);
  if (streak >= STALE_AFTER && !learned.stale.has(category)) {
    learned.stale.add(category);
    return true;
  }
  if (streak === 0) learned.stale.delete(category);
  return false;
}

/**
 * The part of a page title that's about this page: segments shared with the homepage title
 * (usually the site name, "Harbor Bakery Company") would otherwise classify every page.
 */
function ownTitle(title: string | null, homeTitle: string | null | undefined): string | null {
  if (!title) return null;
  const split = (t: string) => t.split(/\s[|\u2013\u2014:\u00b7-]\s/).map((x) => x.trim().toLowerCase());
  const shared = new Set(homeTitle ? split(homeTitle) : []);
  const own = split(title).filter((seg) => seg && !shared.has(seg));
  return own.length ? own.join(" ") : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const outOfTime = (s: CrawlSession) => Date.now() - s.started > s.timeBudgetMs;

export function addToPool(session: CrawlSession, links: DiscoveredLink[]): void {
  for (const link of links) {
    const key = pageKey(link.url);
    if (session.visited.has(key) || !session.isAllowed(link.url) || session.accept?.(link) === false) continue;
    session.pool.set(key, mergeLink(session.pool.get(key), link));
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
      // A focus filter set mid-crawl (past FOCUS_AFTER pages) also applies to links already queued
      if (session.visited.has(key)) continue;
      if (session.accept?.(link) === false) {
        session.pool.delete(key); // so crawlForMissing never picks it again
        continue;
      }
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

        // What kind of page is it really? "/our-journey" with "Founded in 1998" headings is an about page.
        const { title, headings } = pageHeadings(page.body);
        const fromContent = classifyContent(ownTitle(title, kb.crawl.pages[0]?.title), headings);
        let category = link.category;
        if (fromContent && category === "other") {
          category = fromContent;
          session.log(`${new URL(finalUrl).pathname} looks like a${/^[aeiou]/.test(category) ? "n" : ""} ${category} page`);
        }
        session.learned.found.add(category);
        if (fromContent) session.learned.found.add(fromContent);

        // Extraction is synchronous, so the difference is this page's own yield even with 2 workers
        const before = countFacts(kb);
        const result = extractPage(page.body, finalUrl, category, kb);
        const newFacts = countFacts(kb) - before;
        kb.crawl.pages.push({ ...pageRecord(finalUrl, category, page.status, result.title, page.durationMs, null, result.evidence), newFacts });
        if (recordYield(session.learned, finalUrl, category, newFacts)) {
          session.log(`Moving other ${category} pages back: the last ${STALE_AFTER} added nothing new`);
        }
        const finalKey = pageKey(finalUrl);
        addToPool(session, discoverLinks(result.$, finalUrl).map((l) => ({ ...l, foundOn: finalKey })));
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
 * First pass: the priority pages and every page in the site's own menu, re-ranked with
 * rankScore after each small batch so what the first pages taught us (found categories,
 * high and zero yield) decides the order of the rest.
 */
export async function crawlRanked(session: CrawlSession, candidates: DiscoveredLink[], maxTotalPages: number): Promise<void> {
  const { kb } = session;
  const keys = new Set(candidates.map((l) => pageKey(l.url)));
  while (kb.crawl.pages.length < maxTotalPages && !outOfTime(session)) {
    const missing = scoreCompleteness(kb).missing;
    // Read from the pool so a link's merged copy (best score, inMenu, foundOn) is used
    const waiting = [...keys].filter((k) => !session.visited.has(k) && session.pool.has(k)).map((k) => session.pool.get(k)!);
    if (!waiting.length) return;
    const batch = waiting
      .map((link) => ({ link, rank: rankScore(link, session, missing) }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, Math.max(1, session.concurrency))
      .map((t) => t.link);
    for (const link of batch) keys.delete(pageKey(link.url)); // so the loop always ends
    await crawlPages(session, batch, maxTotalPages);
  }
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
      // Pages likely to fill missing fields first, adjusted by what earlier pages yielded
      .map((t) => ({ ...t, rank: t.points + learnedAdjustment(t.link, session.learned) }))
      .sort((a, b) => b.rank - a.rank || b.link.score - a.link.score);
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
