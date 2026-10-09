/**
 * Brand names on multi-brand sites (Phase 10): one place for how names are cleaned, compared and listed.
 *
 * The rule that matters most: brands are only ever matched by their FULL name. "Neko", "Neko Supremo",
 * "Neko Loco" and "Neko Hana" are four restaurants; "Sumo Sushi" and "Sushi Sumo Decatur" are two.
 * normName() makes "Sumo Hotpot & Sushi" equal "SUMO HOTPOT AND SUSHI", and nothing looser.
 */
import type { KnowledgeBase } from "@/types/knowledge";
import { titleCase } from "./parse";
import { locationFor } from "./group";
import { pageKey } from "../url";

/** "chojang" -> "Chojang"; leaves "McDonald's" or "SUSHI" alone. (A copy of extract/text.ts's, which loads cheerio; this file runs in the browser too.) */
const titleCaseIfLower = (text: string) => (text === text.toLowerCase() ? text.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : text);

/** Lowercase, "&" = "and", punctuation and "*" removed, spaces collapsed. Letters in any script are kept. */
export function normName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Words after a brand name that describe the format, not a different restaurant
const FORMAT_WORDS = /^(?:\s*(?:omakase|ayce|all you can eat|kbbq|korean bbq|bbq|hot ?pot|in las vegas|las vegas))+\s*$/i;
// "Sumo Sushi All You Can Eat", "Hwaro 2 Ayce Kbbq In Las Vegas", "Nabe Ayce Hot Pot": the brand is before "AYCE"
const AYCE_TAIL = /\s+(?:\|\s*)?(?:ayce|all you can eat)\b.*$/i;
const CITY_TAIL = /\s+(?:in\s+)?las vegas$/i;

/** A page title part -> a brand-like name: "HWARO 2 AYCE KBBQ IN LAS VEGAS" -> "Hwaro 2". */
export function cleanGroupName(name: string): string {
  const out = name.replace(AYCE_TAIL, "").replace(CITY_TAIL, "").trim();
  const name2 = out.length >= 2 ? out : name.trim();
  return titleCaseIfLower(titleCase(name2));
}

/**
 * Snap a name to a known brand when it IS that brand, or that brand followed only by format words:
 * "Neko Hana Omakase" -> "Neko Hana" (when "Neko Hana" is a known brand). "Sumo Hotpot And Sushi" stays,
 * because "And Sushi" isn't a format word. Never matches part of a brand name.
 */
export function snapToBrand(name: string, brands: string[]): string {
  const n = normName(name);
  // A shorter brand + format words wins over the long title itself (the title is always in the list too)
  const prefixed = brands
    .filter((b) => normName(b) && normName(b) !== n && n.startsWith(`${normName(b)} `) && FORMAT_WORDS.test(n.slice(normName(b).length)))
    .sort((a, b) => normName(b).length - normName(a).length);
  if (prefixed[0]) return prefixed[0];
  return brands.find((b) => normName(b) === n) ?? name;
}

/** The one brand whose full name equals this hint, or null (none, or more than one). */
export function matchBrand(hint: string | null | undefined, brands: string[]): string | null {
  if (!hint) return null;
  // Spaces don't count ("hwaro2-menu.pdf" is "Hwaro 2"), but every letter and digit of the full name must match
  const n = normName(hint).replace(/ /g, "");
  if (!n) return null;
  const hits = [...new Map(brands.filter((b) => normName(b).replace(/ /g, "") === n).map((b) => [normName(b), b])).values()];
  return hits.length === 1 ? hits[0] : null;
}

// Words in file names and link text that say nothing about which restaurant it is
const FILE_NOISE = /^(menu|menus|drinks?|drink menu|food|full|final|new|copy|download|view|open|pdf|here|click here|the|our|v\d+|\(\d+\))$/i;

/**
 * A brand hint from a file name, link text or Wix download name:
 * "nabemenu (2).pdf" -> "Nabe", "sumo-menu-2026.pdf" -> "Sumo", "Captain 6 - Menu - 2026.pdf" -> "Captain 6".
 * Hash-like names (Wix "e381d2_aab2...") and generic link text ("menu", "Drinks") give null.
 */
export function cleanFileHint(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s: string;
  try {
    s = decodeURIComponent(raw);
  } catch {
    s = raw;
  }
  s = s.replace(/\.pdf$/i, "").replace(/\(\d+\)/g, " ");
  if (/[a-f0-9]{12,}|^e?[a-f0-9]{6}_/i.test(s)) return null;
  const words = s
    .split(/[\s\-–_+|.]+/)
    // "nabemenu" -> "nabe", "sushidrinks" -> "sushi"
    .map((w) => w.replace(/^(.{2,}?)(menu|menus|drinks?)$/i, "$1"))
    .filter((w) => w && !FILE_NOISE.test(w) && !/^(19|20)\d{2}$/.test(w));
  const out = words.join(" ").trim();
  return out.length >= 2 && out.length <= 40 && /\p{L}/u.test(out) ? titleCaseIfLower(titleCase(out)) : null;
}

/** The site's company name and host, so "DRAGON FACTORY" in a title isn't taken for a brand. */
export function companyWords(kb: KnowledgeBase, url: string): string[] {
  const name = (kb.company.name.value ?? kb.companyName ?? "").toLowerCase();
  const host = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
  return [name, host].filter(Boolean);
}

/** "DRAGON FACTORY" vs company "Dragon Factory Las Vegas" or host "dragonfactories" */
export function isCompany(part: string, company: string[]): boolean {
  const p = part.toLowerCase();
  const squashed = p.replace(/[^a-z0-9]/g, "");
  return company.some((c) => c.includes(p) || p.includes(c) || (squashed.length >= 5 && c.replace(/[^a-z0-9]/g, "").startsWith(squashed.slice(0, 10))));
}

// Page titles that describe a section or a list of brands, not one brand
const NOT_A_GROUP = /^(home|all you can eat|ayce|our |menus?\b|full menu|locations?|order|apply|careers?|jobs|contact|about|gallery|events?|catering|reservations?|specials|services|pricing)/i;

/** "SAKANA SUSHI | DRAGON FACTORY" -> "Sakana Sushi"; hub pages and the company's own name -> null. */
export function groupFromTitle(title: string | null | undefined, company: string[]): string | null {
  if (!title) return null;
  const parts = title.split(/\s+[|\-–—:·•]\s+/).map((p) => p.trim()).filter(Boolean);
  const pick = parts.find((p) => !isCompany(p, company)) ?? null;
  if (!pick || pick.length > 50 || NOT_A_GROUP.test(pick) || /\d{3,}/.test(pick)) return null;
  return cleanGroupName(pick);
}

export interface Brand {
  name: string;
  /** The brand's own page, when it has one */
  page: string | null;
  location: string | null;
}

/**
 * Every brand of a multi-brand business, from:
 * - brand pages: a page whose title names a brand and that lists its own address
 * - menu sources' groups
 * - brand names the owner kept (read from logos by AI, scraped, or typed); file-name guesses don't count
 * Deduped by full normalized name. Returns [] for single-brand sites (fewer than 2 brands).
 */
export function listBrands(kb: KnowledgeBase): Brand[] {
  const brands = new Map<string, Brand>();
  const add = (name: string | null | undefined, page: string | null) => {
    if (!name) return;
    const key = normName(name);
    if (!key) return;
    const existing = brands.get(key);
    if (existing) {
      existing.page ??= page;
      existing.location ??= locationFor(kb, page);
    } else brands.set(key, { name, page, location: locationFor(kb, page) });
  };
  const known = brandNames(kb);
  for (const p of kb.crawl.pages) {
    if (p.category === "home" || p.error) continue;
    const g = groupFromTitle(p.title, companyWords(kb, p.url));
    if (g && locationFor(kb, p.url)) add(snapToBrand(g, known), p.url);
  }
  for (const s of kb.crawl.menuSources ?? []) if (s.group && !/\((PDF|image)\)$/.test(s.group)) add(s.group, s.foundOn);
  for (const f of kb.company.alternateNames) {
    if (f.value && f.confidence !== "inferred" && f.confidence !== "ai_mock") add(f.value, null);
  }
  const list = [...brands.values()];
  return list.length >= 2 ? list : [];
}

/**
 * Names to snap and match against: brand page titles, menu groups, every alternate name
 * (including file-name clues, which only ever match exactly) and each brand page's own logo alt text.
 */
export function brandNames(kb: KnowledgeBase): string[] {
  const names = new Set<string>();
  for (const f of kb.company.alternateNames) if (f.value) names.add(f.value);
  for (const p of kb.crawl.pages) {
    if (p.category === "home") continue;
    const g = groupFromTitle(p.title, companyWords(kb, p.url));
    if (g) names.add(g);
    // The brand page's own logo: "/neko-hana-omakase" shows the "Neko Hana" logo
    if (g) for (const alt of p.imageAlts ?? []) if (normName(g).startsWith(`${normName(alt)} `)) names.add(alt);
  }
  for (const s of kb.crawl.menuSources ?? []) if (s.group) names.add(s.group);
  return [...names];
}

/** Same page, ignoring trailing slashes and www. */
export const samePage = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && pageKey(a) === pageKey(b);
