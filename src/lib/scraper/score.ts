import type { Completeness, Field, KnowledgeBase } from "@/types/knowledge";

/*
  Knowledge Health score. Each important field has a weight (weights add to 100).
  A field counts as filled when it has a value (scalars) or at least one item (lists).
  The UI's "Next to do" cards use `missing` plus these weights ("+5").
*/

type Check = { path: string; weight: number; filled: (kb: KnowledgeBase) => boolean };

const has = (f: Field<unknown>) => f.value !== null;
const any = (list: unknown[]) => list.length > 0;

export const SCORE_CHECKS: Check[] = [
  { path: "company.name", weight: 8, filled: (kb) => has(kb.company.name) },
  { path: "company.overview", weight: 8, filled: (kb) => has(kb.company.overview) },
  { path: "company.industry", weight: 5, filled: (kb) => has(kb.company.industry) },
  { path: "company.yearFounded", weight: 5, filled: (kb) => has(kb.company.yearFounded) },
  { path: "company.legalEntityType", weight: 3, filled: (kb) => has(kb.company.legalEntityType) },
  { path: "company.mainAddress", weight: 5, filled: (kb) => has(kb.company.mainAddress) },
  { path: "company.pitch", weight: 5, filled: (kb) => has(kb.company.pitch) },
  { path: "company.foundingStory", weight: 4, filled: (kb) => has(kb.company.foundingStory) },
  { path: "contact.emails", weight: 5, filled: (kb) => any(kb.contact.emails) },
  { path: "contact.phones", weight: 4, filled: (kb) => any(kb.contact.phones) },
  { path: "customers.targetBuyers", weight: 5, filled: (kb) => any(kb.customers.targetBuyers) },
  { path: "customers.idealPersona", weight: 4, filled: (kb) => has(kb.customers.idealPersona) },
  { path: "brand.logos", weight: 5, filled: (kb) => any(kb.brand.logos) },
  { path: "brand.colors", weight: 4, filled: (kb) => any(kb.brand.colors) },
  { path: "brand.fonts", weight: 3, filled: (kb) => any(kb.brand.fonts) },
  { path: "brand.socialLinks", weight: 5, filled: (kb) => any(kb.brand.socialLinks) },
  { path: "brand.writingStyle", weight: 3, filled: (kb) => has(kb.brand.writingStyle) },
  { path: "people", weight: 4, filled: (kb) => any(kb.people) },
  { path: "offerings", weight: 8, filled: (kb) => any(kb.offerings) },
  { path: "insights.testimonials", weight: 4, filled: (kb) => any(kb.insights.testimonials) },
  { path: "insights.faqs", weight: 4, filled: (kb) => any(kb.insights.faqs) },
];

export function scoreCompleteness(kb: KnowledgeBase): Completeness {
  let score = 0;
  const missing: string[] = [];
  for (const check of SCORE_CHECKS) {
    if (check.filled(kb)) score += check.weight;
    else missing.push(check.path);
  }
  return { score: Math.min(100, score), missing };
}
