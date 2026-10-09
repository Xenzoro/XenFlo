/**
 * Every knowledge base field in one of three tiers. This is the rule AI enrichment follows,
 * enforced in code (filterByTier), not only in the prompt.
 *
 * 1 Read:     stated facts the scraper extracts. AI never overwrites them; it may only fill an
 *             empty one when the value appears word for word in the evidence.
 * 2 Inferred: not written as a label but obvious to a person reading the site (industry,
 *             business model, channels...), plus generated fields grounded in it (pitch, style,
 *             Content Kit). AI fills these, with evidence, at high confidence only.
 * 3 Never:    people and private business facts. Stays empty unless the site states it; any
 *             AI suggestion for these paths is dropped.
 *
 * Paths are dot paths into KnowledgeBase. Items inside lists use "*": "offerings.*.category".
 */
import type { KnowledgeBase } from "@/types/knowledge";
import type { Suggestion } from "@/types/enrichment";
import { getAt } from "@/lib/utils/path";

export type Tier = 1 | 2 | 3;

export const FIELD_TIERS: Record<string, Tier> = {
  // Company
  "company.name": 1,
  "company.overview": 1,
  "company.website": 1,
  "company.industry": 2,
  "company.businessModel": 2,
  "company.companyRole": 2,
  "company.yearFounded": 1,
  "company.legalEntityType": 3,
  "company.legalName": 3,
  "company.employeeCount": 3,
  "company.revenue": 3,
  "company.mainAddress": 1,
  "company.otherLocations": 1,
  "company.serviceLocations": 2,
  "company.alternateNames": 1,
  "company.pitch": 2,
  "company.foundingStory": 1,
  // Contact
  "contact.emails": 1,
  "contact.phones": 1,
  "contact.contactPageUrl": 1,
  // Customers
  "customers.targetBuyers": 2,
  "customers.customerNeeds": 2,
  "customers.idealPersona": 2,
  "customers.industryGroupings": 2,
  "customers.industryOutlook": 2,
  "customers.channels": 2,
  "customers.funnels": 2,
  "customers.ctas": 1,
  "customers.suppliersPartners": 1,
  // Brand
  "brand.writingStyle": 2,
  "brand.artStyle": 2,
  "brand.fonts": 1,
  "brand.colors": 1,
  "brand.logos": 1,
  "brand.socialLinks": 1,
  // People: names, titles, roles, bios, photos and gender are never guessed
  people: 3,
  "people.*": 3,
  // Offerings: name, price and features are read; the category may be inferred
  offerings: 1,
  "offerings.*.category": 2,
  // Insights
  "insights.testimonials": 1,
  "insights.testimonials.*.author": 3,
  "insights.testimonials.*.authorTitle": 3,
  "insights.testimonials.*.company": 3,
  "insights.faqs": 1,
  "insights.differentiators": 1,
  "insights.trustSignals": 1,
  "insights.contentThemes": 2,
  "insights.promotions": 1,
  "insights.pressMentions": 1,
  "insights.communityValues": 2,
  "insights.legalLinks": 1,
  "insights.positioningSignals": 2,
  "insights.seasonalMessaging": 2,
  // Content Kit: generated from tier 1 and 2 facts
  "contentKit.contentPillars": 2,
  "contentKit.socialHooks": 2,
  "contentKit.hashtags": 2,
  "contentKit.emailSubjects": 2,
  "contentKit.blogIdeas": 2,
  "contentKit.voiceGuide": 2,
};

/**
 * Tier 2 fields that are written rather than looked up. They need evidence that grounds them
 * (at least one real input item), not the 2-independent-items bar used for facts like industry.
 */
export const GENERATED_FIELDS = new Set([
  "company.pitch",
  "brand.writingStyle",
  "brand.artStyle",
  "customers.idealPersona",
  "contentKit.contentPillars",
  "contentKit.socialHooks",
  "contentKit.hashtags",
  "contentKit.emailSubjects",
  "contentKit.blogIdeas",
  "contentKit.voiceGuide",
]);

/** "offerings.3.category" -> "offerings.*.category". Unknown paths count as tier 3 (safest). */
export function tierOf(path: string): Tier {
  const generic = path.replace(/\.\d+(?=\.|$)/g, ".*");
  if (FIELD_TIERS[generic] !== undefined) return FIELD_TIERS[generic];
  // "people.2.name" -> "people.*"
  const parts = generic.split(".");
  for (let i = parts.length - 1; i > 0; i--) {
    const prefix = [...parts.slice(0, i), "*"].join(".");
    if (FIELD_TIERS[prefix] !== undefined) return FIELD_TIERS[prefix];
  }
  return 3;
}

/** Normalized form of a value, for dismissal matching. */
export function valueKey(value: unknown): string {
  return (typeof value === "string" ? value : JSON.stringify(value)).trim().toLowerCase();
}

const isEmptyAt = (kb: KnowledgeBase, path: string) => {
  const at = getAt(kb, path) as { value: unknown } | unknown[] | undefined;
  return Array.isArray(at) ? at.length === 0 : !at || (at as { value: unknown }).value == null;
};

/**
 * The code-level guard for every AI and heuristic suggestion:
 * - tier 3: always dropped
 * - tier 1: only when the field is empty AND some evidence quote contains the value
 * - anything the owner removed ("Wrong? Remove") or marked Not applicable: dropped
 * List suggestions are filtered item by item.
 */
export function filterByTier(suggestions: Suggestion[], kb: KnowledgeBase): Suggestion[] {
  const dismissed = new Set((kb.dismissed ?? []).map((d) => `${d.path}|${d.key}`));
  const na = new Set(kb.notApplicable ?? []);
  return suggestions.flatMap((s) => {
    const tier = tierOf(s.path);
    if (tier === 3 || na.has(s.path)) return [];
    if (tier === 1) {
      const quoted = (v: unknown) => s.basedOn.some((e) => e.toLowerCase().includes(valueKey(v)));
      if (!isEmptyAt(kb, s.path) || !(s.list ? (s.value as unknown[]).every(quoted) : quoted(s.value))) return [];
    }
    if (!s.list) return dismissed.has(`${s.path}|${valueKey(s.value)}`) ? [] : [s];
    const kept = (s.value as unknown[]).filter((v) => !dismissed.has(`${s.path}|${valueKey(v)}`));
    return kept.length ? [{ ...s, value: kept }] : [];
  });
}
