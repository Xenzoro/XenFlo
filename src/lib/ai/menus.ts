/**
 * Pure rules for "Read menus with AI" (Phase 10); the network side is in read-menus.ts.
 *
 * pickMenuSources: which menus one run reads, within the cap of 8 pages/images.
 * itemsFromReader: the model's answer -> menu items, with the confidence rules:
 *   - read from a picture (image or picture-only PDF): ai_live, with the file as evidence
 *   - structured from messy PDF text: scraped only if every name and price is in that text word for word,
 *     otherwise ai_live; a price that isn't in the text is dropped, never kept
 *   - a "price" with no digits (other than "Market price") is dropped: prices are never invented
 */
import type { Confidence, KnowledgeBase, MenuSource } from "@/types/knowledge";
import type { MenuItem, ParsedPrice } from "@/lib/scraper/menus/parse";
import { normalizeCents, parsePrice } from "@/lib/scraper/menus/parse";
import { MENU_LIMITS } from "./config";
import { valueKey } from "./field-tiers";
import type { MenuOutput } from "./schemas";

export interface MenuPlan {
  /** Picture menus to read with vision, each with the pages/images it uses */
  vision: { source: MenuSource; units: number }[];
  /** Menus with messy text to structure (no images) */
  text: MenuSource[];
  /** Readable menus left for the next run */
  skipped: number;
}

/** Statuses AI can still do something with */
const PICTURE: MenuSource["status"][] = ["no_text", "found"];

/**
 * Brand pages before hub pages, then smaller PDFs; then images, ones named like a menu first, biggest first.
 * A PDF uses one unit per page (first 4 pages). A source that doesn't fit the units left is skipped for now.
 */
export function pickMenuSources(kb: KnowledgeBase, cap = MENU_LIMITS.units, textCalls = MENU_LIMITS.textCalls): MenuPlan {
  const sources = kb.crawl.menuSources ?? [];
  const pdfs = sources
    .filter((s) => s.kind === "pdf" && PICTURE.includes(s.status))
    .sort((a, b) => Number(!a.group) - Number(!b.group) || (a.bytes ?? Infinity) - (b.bytes ?? Infinity));
  const images = sources
    .filter((s) => s.kind === "image" && s.status === "found")
    .sort((a, b) => Number(!isNamedMenu(a)) - Number(!isNamedMenu(b)) || (b.area ?? 0) - (a.area ?? 0));
  const messy = sources.filter((s) => s.status === "messy" && s.text);

  const vision: MenuPlan["vision"] = [];
  let used = 0;
  let skipped = 0;
  for (const source of [...pdfs, ...images]) {
    const units = source.kind === "pdf" ? Math.min(source.pages ?? 2, MENU_LIMITS.pagesPerPdf) : 1;
    if (used + units > cap) {
      skipped++;
      continue;
    }
    vision.push({ source, units });
    used += units;
  }
  const text = messy.slice(0, textCalls);
  return { vision, text, skipped: skipped + messy.length - text.length };
}

const isNamedMenu = (s: MenuSource) => /menu|price/i.test(`${s.label ?? ""} ${s.url.split("/").pop()}`);

export interface ReadItem {
  item: MenuItem;
  confidence: Extract<Confidence, "scraped" | "ai_live">;
}

/** Lowercase, straight quotes, single spaces: "verbatim" shouldn't fail on line breaks or curly quotes. */
const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/**
 * Turn the model's answer into menu items. `sourceText` is set for messy-text menus (verbatim check);
 * picture menus have nothing to check against, so their items are always ai_live.
 */
export function itemsFromReader(out: MenuOutput, sourceText?: string | null): ReadItem[] {
  if (!out.isMenu) return [];
  const text = sourceText ? norm(sourceText) : null;
  const seen = new Set<string>();
  const result: ReadItem[] = [];

  for (const raw of out.items) {
    const name = raw.name.replace(/^[*★•·\s]+|[*★•·\s]+$/g, "").trim();
    if (name.length < 2 || name.length > 80 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    let verbatim = text !== null && text.includes(norm(name));
    let price = readPrice(raw.price);
    if (price && text !== null) {
      // Every number in the price must be printed in the text, or the price is dropped
      const numbers = price.priceText?.match(/\d+(?:[.,]\d+)?/g) ?? [];
      const inText = numbers.every((n) => text.includes(n));
      if (!inText) price = null;
      verbatim &&= inText;
    }
    const description = raw.description?.trim() || null;
    const category = raw.section?.trim() || null;
    if (text !== null) {
      if (description && !text.includes(norm(description))) verbatim = false;
      if (category && !text.includes(norm(category))) verbatim = false;
    }
    result.push({ item: { name, description, category, price }, confidence: verbatim ? "scraped" : "ai_live" });
  }
  return result;
}

/**
 * The model's price string -> a price, or null. Prices are copied, never invented:
 * "$12.99" and "12" parse; "Small $5 / Large $8" keeps its text with the first amount;
 * anything without a digit (other than "Market price"/"MP") is dropped.
 */
export function readPrice(raw: string | null): ParsedPrice | null {
  const text = raw ? normalizeCents(raw.trim()) : null;
  if (!text) return null;
  const parsed = parsePrice(text);
  if (parsed) return parsed;
  const first = text.match(/\$?\s?(\d{1,4}(?:[.,]\d{2})?)/);
  if (!first || text.length > 40) return null;
  return { pricingType: "unknown", priceText: text, priceAmount: Number(first[1].replace(",", ".")), currency: /\$/.test(text) ? "USD" : null };
}

/** Same identity the owner's "Wrong? Remove" records for an offering (apply.ts). */
export function offeringKey(name: string, group: string | null | undefined): string {
  return valueKey(`${group ?? ""}|${name}`);
}

/**
 * Drop items the owner removed before ("Wrong? Remove"). Items already in the knowledge base are NOT dropped:
 * organizeMenus merges duplicates within a brand, keeping the priced and described one and citing both menus.
 */
export function freshItems<T extends { item: MenuItem }>(kb: KnowledgeBase, group: string | null, items: T[]): T[] {
  const dismissed = new Set((kb.dismissed ?? []).filter((d) => d.path === "offerings").map((d) => d.key));
  return items.filter((i) => !dismissed.has(offeringKey(i.item.name, group)));
}
