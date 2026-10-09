/**
 * Organize menu items on multi-brand sites (Phase 10). Pure and safe to run again and again: after the
 * scrape's menu pass, and in the browser whenever "Read menus with AI" adds items (so a saved knowledge
 * base gets fixed on its next read too). Offerings are tied to their menu by Field.source === MenuSource.url.
 *
 * 0. Clean and snap group names: "Hwaro 2 Ayce Kbbq In Las Vegas" -> "Hwaro 2", "Neko Hana Omakase" -> "Neko Hana".
 * 1. A menu with no brand gets one, in this order:
 *    a. its file name, link text or page title equals one brand's FULL name ("nabemenu (2).pdf" -> "Nabe")
 *    b. most of its items (60%+, at least 5) are already on one brand's menu
 *    c. otherwise it's named after itself: "All You Can Eat Hotpot Menu (PDF)". Never an unnamed bucket.
 * 2. A text copy of a menu that AI already read from the picture is skipped; items only in the copy are kept.
 * 3. Within a brand, the same item from two menus is kept once (priced and described first), citing both.
 */
import type { Field, KnowledgeBase, MenuSource, Offering } from "@/types/knowledge";
import { brandNames, cleanFileHint, cleanGroupName, companyWords, isCompany, matchBrand, normName, samePage, snapToBrand } from "./brands";
import { linkOfferingLocations, locationFor } from "./group";
import { titleCase } from "./parse";

const OVERLAP = 0.6;
const MIN_ITEMS = 5;
/** Names this pass gives menus it couldn't tie to a brand; re-checked on every run */
const SELF_NAMED = /\s\((PDF|image)\)$/;

export function organizeMenus(input: KnowledgeBase): KnowledgeBase {
  if (!(input.crawl.menuSources ?? []).length) return input;
  // Work on copies: the input may be React state
  const kb: KnowledgeBase = {
    ...input,
    crawl: { ...input.crawl, menuSources: (input.crawl.menuSources ?? []).map((s) => ({ ...s })) },
    offerings: input.offerings.map((f) => (f.value ? { ...f, value: { ...f.value } } : f)),
  };
  const sources = kb.crawl.menuSources!;
  const itemsOf = (s: MenuSource) => kb.offerings.filter((f): f is Field<Offering> & { value: Offering } => !!f.value && f.source === s.url);
  const setGroup = (s: MenuSource, group: string) => {
    s.group = group;
    for (const f of itemsOf(s)) if (f.confidence !== "user_edited") f.value.group = group;
  };

  // 0. Clean and snap names
  const known = brandNames(kb);
  const tidy = (g: string) => (SELF_NAMED.test(g) ? g : snapToBrand(cleanGroupName(g), known));
  for (const s of sources) if (s.group) s.group = tidy(s.group);
  for (const f of kb.offerings) if (f.value?.group && f.confidence !== "user_edited") f.value.group = tidy(f.value.group);

  // 1. Menus without a brand (or self-named last time: a brand's menu may have been read since)
  const brands = brandNames(kb).filter((b) => !SELF_NAMED.test(b));
  for (const s of sources) {
    if (s.group && !SELF_NAMED.test(s.group)) continue;
    const byName =
      matchBrand(cleanFileHint(s.fileName), brands) ?? matchBrand(cleanFileHint(s.label), brands) ?? matchBrand(cleanGroupName(pageTitle(kb, s.foundOn) ?? ""), brands);
    const group = byName ?? overlapBrand(kb, s, itemsOf(s)) ?? selfName(kb, s);
    setGroup(s, group);
  }

  // 2. Text copies of menus already read from their picture
  for (const s of sources) {
    if (readAs(s) !== "text" || !s.group) continue;
    const mine = itemsOf(s);
    if (mine.length < MIN_ITEMS) continue;
    const fromPictures = new Set(
      kb.offerings
        .filter((f) => f.value?.group === s.group && f.source !== s.url && readAs(sources.find((x) => x.url === f.source)) === "picture")
        .map((f) => normName(f.value!.name)),
    );
    const dupes = mine.filter((f) => fromPictures.has(normName(f.value.name)));
    if (dupes.length / mine.length < OVERLAP) continue;
    const unique = mine.filter((f) => !fromPictures.has(normName(f.value.name)));
    // The item read from the picture stays, and now cites this copy too
    for (const d of dupes) {
      const kept = kb.offerings.find((f) => f.source !== s.url && f.value?.group === s.group && normName(f.value.name) === normName(d.value.name));
      if (kept) kept.evidence = [...new Set([...(kept.evidence ?? [`${label(kept, sources)}: ${kept.source}`]), `menu PDF text: ${s.url}`])];
    }
    kb.offerings = kb.offerings.filter((f) => !dupes.includes(f as (typeof dupes)[number]) || f.confidence === "user_edited");
    s.status = "duplicate";
    s.note =
      `Same menu as ${s.group} (${dupes.length} of ${mine.length} items), already read from its picture.` +
      (unique.length ? ` Kept ${unique.length} item${unique.length === 1 ? "" : "s"} only in this copy: ${unique.map((f) => f.value.name).join(", ")}.` : "");
  }

  // 3. One item per name within a brand
  kb.offerings = dedupe(kb.offerings, sources);

  // Addresses: from the page the menu was found on, else from the brand's other menus
  linkOfferingLocations(kb);
  for (const s of sources) {
    const location = locationFor(kb, s.foundOn);
    if (location) for (const f of itemsOf(s)) f.value.location ??= location;
  }
  const located = new Map<string, string>();
  for (const f of kb.offerings) if (f.value?.group && f.value.location) located.set(f.value.group, f.value.location);
  for (const f of kb.offerings) if (f.value?.group && !f.value.location && located.has(f.value.group)) f.value.location = located.get(f.value.group)!;

  for (const s of sources) s.items = itemsOf(s).length;
  return kb;
}

/** How a menu's items were read. Records from before `readAs` existed: kept text means it was sorted as text. */
function readAs(s: MenuSource | undefined): "text" | "picture" | null {
  if (!s) return null;
  if (s.readAs) return s.readAs;
  if (s.text || s.status === "read") return "text";
  return s.status === "read_ai" ? "picture" : null;
}

/** The brand whose items make up most of this menu (60%+ of its items, at least 5), or null. */
function overlapBrand(kb: KnowledgeBase, s: MenuSource, mine: Field<Offering>[]): string | null {
  const names = new Set(mine.map((f) => normName(f.value!.name)));
  if (names.size < MIN_ITEMS) return null;
  const byGroup = new Map<string, Set<string>>();
  for (const f of kb.offerings) {
    const g = f.value?.group;
    if (!g || f.source === s.url || SELF_NAMED.test(g)) continue;
    if (!byGroup.has(g)) byGroup.set(g, new Set());
    byGroup.get(g)!.add(normName(f.value!.name));
  }
  let best: { group: string; ratio: number } | null = null;
  for (const [group, theirs] of byGroup) {
    const ratio = [...names].filter((n) => theirs.has(n)).length / names.size;
    if (ratio >= OVERLAP && (!best || ratio > best.ratio)) best = { group, ratio };
  }
  return best?.group ?? null;
}

/** "All You Can Eat Hotpot Menu (PDF)": the file's own name, else the page it was linked from. */
function selfName(kb: KnowledgeBase, s: MenuSource): string {
  const title = pageTitle(kb, s.foundOn);
  const part = title?.split(/\s+[|\-–—:·•]\s+/).map((p) => p.trim()).find((p) => p && !isCompany(p, companyWords(kb, s.foundOn)));
  const base = cleanFileHint(s.fileName) ?? (part ? titleCase(part) : null) ?? cleanFileHint(s.label) ?? "Menu";
  return `${/\bmenu$/i.test(base) ? base : `${base} Menu`} (${s.kind === "pdf" ? "PDF" : "image"})`;
}

function pageTitle(kb: KnowledgeBase, url: string): string | null {
  return kb.crawl.pages.find((p) => samePage(p.url, url))?.title ?? null;
}

/** Keep one item per brand + name: the owner's version, else priced + described first. Both sources are cited. */
function dedupe(offerings: Field<Offering>[], sources: MenuSource[]): Field<Offering>[] {
  const keep = new Map<string, Field<Offering>>();
  const out: Field<Offering>[] = [];
  const cite = (f: Field<Offering>) => f.evidence ?? (f.source ? [`${label(f, sources)}: ${f.source}`] : []);
  const score = (f: Field<Offering>) => (f.confidence === "user_edited" ? 10 : 0) + (f.value?.priceAmount != null || f.value?.priceText ? 2 : 0) + (f.value?.description ? 1 : 0);

  for (const f of offerings) {
    // Only menu items: page offerings without a brand (services, plans) are left exactly as they are
    if (!f.value?.group) {
      out.push(f);
      continue;
    }
    const key = `${normName(f.value.group)}|${normName(f.value.name)}`;
    const first = keep.get(key);
    if (!first) {
      keep.set(key, f);
      out.push(f);
      continue;
    }
    if (first.source === f.source && first.confidence === f.confidence && JSON.stringify(first.value) === JSON.stringify(f.value)) continue;
    const winner = score(f) > score(first) ? f : first;
    const evidence = [...new Set([...cite(first), ...cite(f)])];
    const merged = { ...winner, evidence };
    out[out.indexOf(first)] = merged;
    keep.set(key, merged);
  }
  return out;
}

function label(f: Field<Offering>, sources: MenuSource[]): string {
  const s = sources.find((x) => x.url === f.source);
  if (!s) return "page";
  return readAs(s) === "text" ? "menu PDF text" : s.kind === "pdf" ? "menu PDF" : "menu image";
}
