/**
 * Preview-mode understanding without AI: a small keyword map for industry, plus CTA patterns
 * for channels, funnels and business model. Same 2-evidence rule as live AI; results are
 * marked "inferred" with the evidence that triggered them.
 */
import type { KnowledgeBase } from "@/types/knowledge";
import type { Suggestion } from "@/types/enrichment";
import type { Evidence, EvidenceItem } from "./evidence";

interface Industry {
  pattern: RegExp;
  industry: string;
  grouping: string;
}

// Order matters only for ties; every match with 2+ evidence items is used.
export const KEYWORDS: Industry[] = [
  { pattern: /\bsushi\b/i, industry: "Restaurants", grouping: "Sushi" },
  { pattern: /\b(kbbq|k-?bbq|korean (bbq|barbecue))\b/i, industry: "Restaurants", grouping: "Korean BBQ" },
  { pattern: /\bhot ?pot\b/i, industry: "Restaurants", grouping: "Hot pot" },
  { pattern: /\bramen\b/i, industry: "Restaurants", grouping: "Ramen" },
  { pattern: /\b(all you can eat|ayce)\b/i, industry: "Restaurants", grouping: "All-you-can-eat" },
  { pattern: /\b(boba|bubble tea|milk tea)\b/i, industry: "Food and drink", grouping: "Boba and tea" },
  { pattern: /\b(cafe|café|coffee)\b/i, industry: "Food and drink", grouping: "Cafe" },
  { pattern: /\brestaurants?\b/i, industry: "Restaurants", grouping: "Restaurant" },
  { pattern: /\b(hvac|air condition(ing|er)|heating and cooling|furnace)\b/i, industry: "Home services", grouping: "HVAC" },
  { pattern: /\bplumb(ing|er)\b/i, industry: "Home services", grouping: "Plumbing" },
  { pattern: /\b(minecraft server|game server|server hosting)\b/i, industry: "Game server hosting", grouping: "Game server hosting" },
  { pattern: /\b(web hosting|vps)\b/i, industry: "Web hosting", grouping: "Web hosting" },
  { pattern: /\b(hair salon|salon|barber)\b/i, industry: "Beauty and personal care", grouping: "Salon" },
  { pattern: /\b(dental|dentist|orthodont)/i, industry: "Healthcare", grouping: "Dental" },
  { pattern: /\b(grooming|groomer|pet care)\b/i, industry: "Pet services", grouping: "Pet grooming" },
];

// CTA text -> how customers buy (channel) and what the site pushes them to do (funnel)
const CTA_RULES: { pattern: RegExp; channel: string; funnel: string }[] = [
  { pattern: /order (online|now)|online order/i, channel: "Online ordering", funnel: "Visit site → order online" },
  { pattern: /book (now|online|a|an)|schedule|reserv/i, channel: "Online booking", funnel: "Visit site → book online" },
  { pattern: /apply now|join our team|careers/i, channel: "Hiring", funnel: "Careers page → apply" },
  { pattern: /get a quote|free (quote|estimate)|request a quote/i, channel: "Quote request", funnel: "Request a quote → follow-up" },
  { pattern: /\b(shop|buy|add to cart)\b/i, channel: "Ecommerce", funnel: "Browse → buy online" },
  { pattern: /get started|start (your|a) |sign up|free trial/i, channel: "Online sign-up", funnel: "Get started → sign up" },
  // "call" alone matches "LAST CALL" in opening hours; only real call-to-action wording counts
  { pattern: /\bcall (us|now|today|for|to)\b|\bcall any ?time\b|\bcall\s*\(?\d{3}/i, channel: "Phone", funnel: "Call → book a visit" },
];
// Phone is only trusted from CTA buttons, never from page headings
const CTA_ONLY = new Set(["Phone"]);

const label = (i: EvidenceItem) => `${i.page ? `${i.page}: ` : ""}${i.text.length > 90 ? `${i.text.slice(0, 90)}…` : i.text}`;

export function heuristicSuggestions(kb: KnowledgeBase, e: Evidence): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (path: string, lbl: string, value: string | string[], hits: EvidenceItem[]) =>
    out.push({ path, label: lbl, value, list: Array.isArray(value), confidence: "inferred", source: "heuristic", basedOn: hits.slice(0, 4).map(label) });

  // Industry: each keyword needs 2+ different evidence items
  const text = e.items.filter((i) => !i.kind.startsWith("tool_or_partner"));
  const matches = KEYWORDS.map((k) => ({ k, hits: text.filter((i) => k.pattern.test(i.text)) })).filter((m) => m.hits.length >= 2);
  if (matches.length) {
    // The industry with the most evidence overall
    const byIndustry = new Map<string, EvidenceItem[]>();
    for (const m of matches) byIndustry.set(m.k.industry, [...(byIndustry.get(m.k.industry) ?? []), ...m.hits]);
    const [industry, hits] = [...byIndustry.entries()].sort((a, b) => new Set(b[1]).size - new Set(a[1]).size)[0];
    add("company.industry", "Industry", industry, [...new Set(hits)]);
    const groupings = [...new Set(matches.filter((m) => m.k.industry === industry && m.k.grouping !== "Restaurant" && m.k.grouping !== industry).map((m) => m.k.grouping))];
    if (groupings.length) add("customers.industryGroupings", "Industry groupings", groupings, matches.flatMap((m) => m.hits));
  }

  // Channels and funnels from CTA text: a pattern needs 2 CTAs, or 1 CTA plus a matching page heading
  const ctas = e.items.filter((i) => i.kind === "cta");
  const pages = e.items.filter((i) => i.kind.startsWith("page:"));
  const channels: string[] = [];
  const funnels: string[] = [];
  const channelHits: EvidenceItem[] = [];
  for (const rule of CTA_RULES) {
    const hits = [...ctas.filter((c) => rule.pattern.test(c.text)), ...(CTA_ONLY.has(rule.channel) ? [] : pages.filter((p) => rule.pattern.test(p.text)))];
    if (new Set(hits).size < 2) continue;
    if (rule.channel === "Phone" && !kb.contact.phones.length) continue;
    channels.push(rule.channel);
    funnels.push(rule.funnel);
    channelHits.push(...hits);
  }
  // "Online ordering" adds nothing when the scraper already recorded "Online ordering (Clover)"
  const scraped = kb.customers.channels.map((c) => String(c.value ?? "").toLowerCase());
  const newChannels = channels.filter((c) => !scraped.some((have) => have.startsWith(c.toLowerCase())));
  if (newChannels.length) add("customers.channels", "Channels", newChannels, channelHits);
  if (channels.length) {
    add("customers.funnels", "Funnels", funnels, channelHits);
  }

  // Business model hints
  const hasLocation = !!kb.company.mainAddress.value || kb.company.otherLocations.length > 0;
  const localSales = channels.some((c) => c === "Online ordering" || c === "Online booking");
  // A local business that takes orders or bookings is "B2C, local" even if it also sells a monthly
  // membership (an HVAC maintenance plan); monthly plans without a location mean a subscription business.
  const monthly = e.items.filter((i) => /\/\s?mo\b|per month|monthly/i.test(i.text));
  if (localSales && hasLocation) {
    const loc = e.items.filter((i) => i.kind.endsWith("location"));
    add("company.businessModel", "Business model", "B2C, local", [...channelHits.slice(0, 2), ...loc.slice(0, 2)]);
  } else if (monthly.length >= 2 && !hasLocation) add("company.businessModel", "Business model", "Subscription", monthly);
  return out;
}
