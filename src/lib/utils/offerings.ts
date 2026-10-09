/** Small offering helpers shared by the Offerings, Overview and Sources tabs (Phase 10). */
import type { Field, KnowledgeBase, MenuSource, Offering } from "@/types/knowledge";
import type { MenuReadResult } from "@/types/enrichment";

// Businesses where what you sell IS the knowledge: food, drink and shops
const OFFERINGS_FIRST = /restaurant|food|cafe|café|coffee|tea|boba|bakery|bar\b|pub|brewery|pizza|sushi|bbq|grill|diner|deli|catering|dessert|ice cream|retail|shop|store|boutique|florist|grocery/i;

/**
 * Offerings are the core of this business: menus were found, or the industry is food, drink or retail.
 * Then the Offerings tab comes right after Overview and shows the menu view.
 */
export function offeringsFirst(kb: KnowledgeBase): boolean {
  if ((kb.crawl.menuSources ?? []).length > 0) return true;
  const industry = [kb.company.industry.value, ...kb.customers.industryGroupings.map((g) => g.value)].filter(Boolean).join(" ");
  return OFFERINGS_FIRST.test(industry);
}

/** "from Sakana Sushi menu PDF", "read from menu image", "from /menu" */
export function offeringSourceLabel(f: Field<Offering>): string | null {
  const o = f.value;
  if (!o || f.confidence === "user_edited") return null;
  const brand = o.group ? `${o.group} ` : "";
  if (o.sourceKind === "pdf") return f.confidence === "ai_live" ? `read from ${brand}menu PDF` : `from ${brand}menu PDF`;
  if (o.sourceKind === "image") return "read from menu image";
  if (o.sourceKind === "upload") return "from your upload";
  try {
    return f.source ? `from ${new URL(f.source).pathname}` : null;
  } catch {
    return null;
  }
}

export const MENU_STATUS_LABEL: Record<MenuSource["status"], string> = {
  found: "Not read yet",
  read: "Read",
  no_text: "Picture menu",
  messy: "Needs sorting",
  read_ai: "Read by AI",
  too_large: "Too large",
  blocked: "Blocked by robots.txt",
  failed: "Couldn't read",
};

/** Menus AI can still read (pictures, messy text, PDFs the scraper didn't reach). */
export const waitingForAi = (s: MenuSource) => s.status === "no_text" || s.status === "messy" || s.status === "found";

/**
 * Merge a "Read menus with AI" result: add new items (skipping any already there by brand + name)
 * and replace the menu sources it touched.
 */
export function mergeMenuResult(kb: KnowledgeBase, result: MenuReadResult): KnowledgeBase {
  const key = (o: Offering) => `${o.group ?? ""}|${o.name}`.toLowerCase();
  const have = new Set(kb.offerings.flatMap((f) => (f.value ? [key(f.value)] : [])));
  const added = result.offerings.filter((f) => f.value && !have.has(key(f.value)));
  const updated = new Map(result.sources.map((s) => [s.url, s]));
  return {
    ...kb,
    offerings: [...kb.offerings, ...added],
    crawl: { ...kb.crawl, menuSources: (kb.crawl.menuSources ?? []).map((s) => updated.get(s.url) ?? s) },
  };
}
