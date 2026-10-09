/**
 * The menu pass, run after the crawl (scrapeSite and digDeeper): download the menu PDFs the crawl
 * found, read their text, and turn clear menus into offerings. No AI here.
 *
 * Caps: 20 MB and the first 4 pages per PDF, at most 12 PDFs per scrape, 2 at a time, in a 15 s
 * budget (the scrape route has 60 s; the crawl uses up to 30 s). PDFs left over stay "found" and
 * are read by the next "Dig deeper". Picture-only PDFs are marked "no_text" for the AI menu reader.
 */
import type { KnowledgeBase, MenuSource, Offering } from "@/types/knowledge";
import { addItem } from "../merge";
import { fetchBinary } from "../fetch";
import { ScrapeError } from "../errors";
import type { CrawlSession } from "../crawl";
import { organizeMenus } from "./organize";
import { menuTextQuality, parseMenuLines, type MenuItem } from "./parse";
import { isPdf, readPdfText } from "./pdf";

export const MENU_LIMITS = {
  maxPdfBytes: 20 * 1024 * 1024,
  maxPdfPages: 4,
  maxPdfsPerScrape: 12,
  budgetMs: 15_000,
  concurrency: 2,
  /** Text kept for messy PDFs, so AI can structure it later without downloading again */
  keepTextChars: 6_000,
};

export async function readMenus(session: CrawlSession): Promise<void> {
  const { kb } = session;
  const queue = (kb.crawl.menuSources ?? []).filter((s) => s.kind === "pdf" && s.status === "found").slice(0, MENU_LIMITS.maxPdfsPerScrape);
  if (queue.length) {
    session.log(`Reading ${queue.length} menu PDF${queue.length === 1 ? "" : "s"}`);
    const started = Date.now();
    const worker = async () => {
      while (queue.length && Date.now() - started < MENU_LIMITS.budgetMs) {
        await readPdfSource(session, queue.shift()!);
      }
    };
    await Promise.all(Array.from({ length: MENU_LIMITS.concurrency }, worker));
    const left = (kb.crawl.menuSources ?? []).filter((s) => s.kind === "pdf" && s.status === "found").length;
    if (left) session.log(`${left} menu PDF${left === 1 ? "" : "s"} left for "Dig deeper"`, "warn");
  }
  // Name hub menus, skip text copies of menus already read, dedupe within each brand
  Object.assign(kb, organizeMenus(kb));
}

async function readPdfSource(session: CrawlSession, source: MenuSource): Promise<void> {
  if (!session.isAllowed(source.url)) {
    Object.assign(source, { status: "blocked", note: "robots.txt doesn't allow reading this file." });
    return;
  }
  try {
    const file = await fetchBinary(source.url, { maxBytes: MENU_LIMITS.maxPdfBytes, timeoutMs: 10_000 });
    source.bytes = file.bytes.byteLength;
    if (!isPdf(file.bytes)) {
      Object.assign(source, { status: "failed", note: "The link didn't return a PDF." });
      return;
    }
    // "nabemenu (2).pdf" or Wix's "dn=Captain+6+-+Menu+-+2026.pdf": a clue to the brand (organize.ts)
    source.fileName = file.fileName;

    const pdf = await readPdfText(file.bytes, MENU_LIMITS.maxPdfPages);
    source.pages = pdf.pages;
    const text = pdf.text.join("\n");
    const items = parseMenuLines(text.split("\n"));
    const quality = menuTextQuality(text, items);
    source.status = quality;
    if (quality === "no_text") {
      source.note = "This menu is a picture. AI can read it.";
    } else if (quality === "messy") {
      source.text = text.slice(0, MENU_LIMITS.keepTextChars);
      source.note = "Text found, but not laid out clearly enough to sort without AI.";
    } else {
      source.readAs = "text";
      source.items = addMenuItems(session.kb, items, source, "pdf", "scraped");
    }
  } catch (err) {
    const tooLarge = err instanceof ScrapeError && err.code === "TOO_LARGE";
    Object.assign(source, {
      status: tooLarge ? "too_large" : "failed",
      note: tooLarge ? `${err.message} Upload a screenshot of it instead.` : err instanceof Error ? err.message.slice(0, 120) : "Couldn't read it.",
    });
  }
}

/** Add menu items as offerings tied to their source. Returns how many were new. */
export function addMenuItems(
  kb: KnowledgeBase,
  items: MenuItem[],
  source: Pick<MenuSource, "url" | "foundOn" | "group">,
  sourceKind: Offering["sourceKind"],
  confidence: "scraped" | "ai_live",
  evidence?: string[],
): number {
  const before = kb.offerings.length;
  for (const item of items) {
    const n = kb.offerings.length;
    addItem(kb.offerings, toOffering(item, source, sourceKind), source.url, (v) => `${v.group ?? ""}|${v.name}`.toLowerCase(), confidence);
    if (evidence && kb.offerings.length > n) kb.offerings[n].evidence = evidence;
  }
  return kb.offerings.length - before;
}

export function toOffering(item: MenuItem, source: Pick<MenuSource, "foundOn" | "group">, sourceKind: Offering["sourceKind"]): Offering {
  return {
    name: item.name,
    category: item.category,
    description: item.description,
    features: [],
    pricingType: item.price?.pricingType ?? "unknown",
    priceText: item.price?.priceText ?? null,
    priceAmount: item.price?.priceAmount ?? null,
    currency: item.price?.currency ?? null,
    group: source.group,
    foundOn: source.foundOn,
    sourceKind,
  };
}
