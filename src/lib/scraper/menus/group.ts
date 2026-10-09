/**
 * Brand and location grouping for offerings (Phase 10). On a multi-brand site each restaurant's
 * page holds its address and its menu link, so the page ties the two together:
 * "/sakana" -> "Sakana Sushi" menu items and "3949 S Maryland Pkwy".
 */
import type { Field, KnowledgeBase, Offering } from "@/types/knowledge";
import { pageKey } from "../url";

/** The address found on a page (other locations first, then the main address), one line. */
export function locationFor(kb: KnowledgeBase, pageUrl: string | null | undefined): string | null {
  if (!pageUrl) return null;
  const key = pageKey(pageUrl);
  const other = kb.company.otherLocations.find((f) => f.source && f.value && pageKey(f.source) === key);
  if (other?.value) return other.value.formatted;
  const main = kb.company.mainAddress;
  return main.value && main.source && pageKey(main.source) === key ? main.value.formatted : null;
}

/** Fill `location` on grouped offerings from the page their menu was found on. */
export function linkOfferingLocations(kb: KnowledgeBase): void {
  for (const f of kb.offerings) {
    const o = f.value;
    if (!o?.group || o.location) continue;
    const location = locationFor(kb, o.foundOn ?? f.source);
    if (location) o.location = location;
  }
}

export interface OfferingRef {
  field: Field<Offering>;
  /** Position in kb.offerings, for edits and "Wrong? Remove" */
  index: number;
}

export interface OfferingGroup {
  /** Brand or location name; null for items that belong to the whole business */
  name: string | null;
  location: string | null;
  categories: { name: string | null; items: OfferingRef[] }[];
  count: number;
  /** Lowest and highest listed price, when any item has one */
  priceMin: number | null;
  priceMax: number | null;
}

/** Group offerings by brand/location, then by category, keeping first-seen order. Groupless items come last. */
export function groupOfferings(offerings: Field<Offering>[]): OfferingGroup[] {
  const groups = new Map<string, OfferingGroup>();
  offerings.forEach((field, index) => {
    const o = field.value;
    if (!o) return;
    const key = (o.group ?? "").toLowerCase();
    let g = groups.get(key);
    if (!g) {
      g = { name: o.group ?? null, location: null, categories: [], count: 0, priceMin: null, priceMax: null };
      groups.set(key, g);
    }
    g.location ??= o.location ?? null;
    let c = g.categories.find((x) => (x.name ?? "").toLowerCase() === (o.category ?? "").toLowerCase());
    if (!c) {
      c = { name: o.category, items: [] };
      g.categories.push(c);
    }
    c.items.push({ field, index });
    g.count++;
    if (o.priceAmount !== null && o.priceAmount > 0) {
      g.priceMin = g.priceMin === null ? o.priceAmount : Math.min(g.priceMin, o.priceAmount);
      g.priceMax = g.priceMax === null ? o.priceAmount : Math.max(g.priceMax, o.priceAmount);
    }
  });
  const all = [...groups.values()];
  return [...all.filter((g) => g.name), ...all.filter((g) => !g.name)];
}
