import type { Completeness, Field, KnowledgeBase, PageCategory } from "@/types/knowledge";

/*
  Knowledge Health score. Each important field has a weight (weights add to 100).
  A field counts as filled when it has a value (scalars) or at least one item (lists).
  The UI's "Next to do" cards use `missing` plus these weights ("+5").
*/

type Check = { path: string; weight: number; filled: (kb: KnowledgeBase) => boolean };

const has = (f: Field<unknown>) => f.value !== null;
const any = (list: unknown[]) => list.length > 0;

// Weights add up to 100.
export const SCORE_CHECKS: Check[] = [
  { path: "company.name", weight: 8, filled: (kb) => has(kb.company.name) },
  { path: "company.overview", weight: 7, filled: (kb) => has(kb.company.overview) },
  { path: "company.industry", weight: 5, filled: (kb) => has(kb.company.industry) },
  { path: "company.yearFounded", weight: 5, filled: (kb) => has(kb.company.yearFounded) },
  { path: "company.legalEntityType", weight: 2, filled: (kb) => has(kb.company.legalEntityType) },
  { path: "company.mainAddress", weight: 5, filled: (kb) => has(kb.company.mainAddress) },
  { path: "company.pitch", weight: 4, filled: (kb) => has(kb.company.pitch) },
  { path: "company.foundingStory", weight: 4, filled: (kb) => has(kb.company.foundingStory) },
  { path: "contact.emails", weight: 5, filled: (kb) => any(kb.contact.emails) },
  { path: "contact.phones", weight: 4, filled: (kb) => any(kb.contact.phones) },
  { path: "customers.targetBuyers", weight: 5, filled: (kb) => any(kb.customers.targetBuyers) },
  { path: "customers.idealPersona", weight: 4, filled: (kb) => has(kb.customers.idealPersona) },
  { path: "customers.ctas", weight: 2, filled: (kb) => any(kb.customers.ctas) },
  { path: "brand.logos", weight: 5, filled: (kb) => any(kb.brand.logos) },
  { path: "brand.colors", weight: 4, filled: (kb) => any(kb.brand.colors) },
  { path: "brand.fonts", weight: 3, filled: (kb) => any(kb.brand.fonts) },
  { path: "brand.socialLinks", weight: 4, filled: (kb) => any(kb.brand.socialLinks) },
  { path: "brand.writingStyle", weight: 3, filled: (kb) => has(kb.brand.writingStyle) },
  { path: "people", weight: 4, filled: (kb) => kb.people.some((p) => p.value?.type === "team") },
  { path: "offerings", weight: 7, filled: (kb) => any(kb.offerings) },
  { path: "insights.testimonials", weight: 4, filled: (kb) => any(kb.insights.testimonials) },
  { path: "insights.faqs", weight: 4, filled: (kb) => any(kb.insights.faqs) },
  { path: "insights.trustSignals", weight: 2, filled: (kb) => any(kb.insights.trustSignals) },
];

/**
 * Where a missing field is most likely to be found: page categories plus path keywords.
 * Drives the adaptive crawl ("still missing testimonials -> crawl /reviews next").
 * Fields filled by AI later (pitch, persona, writing style) have no hints.
 */
export const FIELD_HINTS: Record<string, { categories: PageCategory[]; keywords?: RegExp }> = {
  "company.yearFounded": { categories: ["about"], keywords: /history|story/i },
  "company.foundingStory": { categories: ["about"], keywords: /history|story|founder/i },
  "company.mainAddress": { categories: ["contact", "locations"], keywords: /visit|directions|hours/i },
  "contact.emails": { categories: ["contact"], keywords: /support|help/i },
  "contact.phones": { categories: ["contact", "locations"], keywords: /support|call/i },
  people: { categories: ["team", "about"], keywords: /founder|leadership|staff|meet/i },
  offerings: { categories: ["pricing", "services", "products", "features"], keywords: /menu|plans?|packages?/i },
  "insights.testimonials": { categories: ["testimonials"], keywords: /reviews?|stories|case/i },
  "insights.faqs": { categories: ["faq"], keywords: /help|questions|support/i },
  "insights.trustSignals": { categories: ["testimonials", "about"], keywords: /awards?|certif/i },
  "customers.targetBuyers": { categories: ["services", "about"], keywords: /who[- ]we[- ]serve|industries|customers/i },
};

export function scoreCompleteness(kb: KnowledgeBase): Completeness {
  let score = 0;
  const missing: string[] = [];
  // "Not applicable" fields (marked by the owner, e.g. no head office) count as complete
  const na = new Set(kb.notApplicable ?? []);
  for (const check of SCORE_CHECKS) {
    if (check.filled(kb) || na.has(check.path)) score += check.weight;
    else missing.push(check.path);
  }
  return { score: Math.min(100, score), missing };
}

/** How many completeness points a page might add, based on what's still missing. */
export function potentialPoints(kb: KnowledgeBase, url: string, category: PageCategory, missing = scoreCompleteness(kb).missing): number {
  // Individual posts rarely hold company facts, even when the slug mentions "history".
  if (category === "blog") return 0;
  const path = new URL(url).pathname;
  let points = 0;
  for (const field of missing) {
    const hint = FIELD_HINTS[field];
    if (!hint) continue;
    if (hint.categories.includes(category) || hint.keywords?.test(path)) {
      points += SCORE_CHECKS.find((c) => c.path === field)?.weight ?? 0;
    }
  }
  return points;
}
