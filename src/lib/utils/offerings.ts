/** Small offering helpers shared by the Offerings, Overview and Sources tabs (Phase 10). */
import type { Field, KnowledgeBase, MenuSource, Offering } from "@/types/knowledge";
import type { MenuReadResult } from "@/types/enrichment";
import { organizeMenus } from "@/lib/scraper/menus/organize";

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
  duplicate: "Same as another menu",
};

/** Menus AI can still read (pictures, messy text, PDFs the scraper didn't reach). */
export const waitingForAi = (s: MenuSource) => s.status === "no_text" || s.status === "messy" || s.status === "found";

/**
 * Merge a "Read menus with AI" result: add the new items, replace the menu sources it touched, then
 * organize (name hub menus, skip text copies, keep one item per brand + name; see menus/organize.ts).
 */
export function mergeMenuResult(kb: KnowledgeBase, result: MenuReadResult): KnowledgeBase {
  const updated = new Map(result.sources.map((s) => [s.url, s]));
  const replaced = new Set(result.replaces ?? []);
  // A menu read again: its old items go (the owner's edits stay), the new reading comes in
  const kept = kb.offerings.filter((f) => !(f.source && replaced.has(f.source) && f.confidence !== "user_edited"));
  return organizeMenus({
    ...kb,
    offerings: [...kept, ...result.offerings],
    crawl: { ...kb.crawl, menuSources: (kb.crawl.menuSources ?? []).map((s) => updated.get(s.url) ?? s) },
  });
}

/** AI-read items the owner hasn't checked yet. Their prices must not be quoted in AI writing (see evidence.ts). */
export const needsReview = (f: Field<Offering>) => !!f.value && (f.confidence === "ai_live" || f.confidence === "ai_mock");

/**
 * "Mark as reviewed": every unchecked AI item in this brand's menu becomes the owner's (user_edited), stamped
 * with reviewedAt so it shows "Reviewed". Source and evidence are kept, so it's still clear where it came from.
 */
export function reviewGroup(kb: KnowledgeBase, group: string | null): KnowledgeBase {
  const at = new Date().toISOString();
  const offerings = kb.offerings.map((f) => {
    if (!needsReview(f) || (f.value!.group ?? null) !== group) return f;
    const { categoryConfidence: _c, categoryEvidence: _e, ...value } = f.value!;
    void _c;
    void _e;
    return { ...f, value, confidence: "user_edited" as const, updatedAt: at, reviewedAt: at };
  });
  return { ...kb, offerings };
}

/** "X of Y menus reviewed": brands that have AI-read items, and how many of them have none left unchecked. */
export function reviewProgress(offerings: Field<Offering>[]): { reviewed: number; total: number } {
  const groups = new Map<string, boolean>();
  for (const f of offerings) {
    if (!f.value || !(needsReview(f) || f.reviewedAt)) continue;
    const key = f.value.group ?? "";
    groups.set(key, (groups.get(key) ?? true) && !needsReview(f));
  }
  return { reviewed: [...groups.values()].filter(Boolean).length, total: groups.size };
}
