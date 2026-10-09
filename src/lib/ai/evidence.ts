/**
 * What the model reads to understand the business: knowledge base facts plus what each crawled
 * page says about itself (title, meta description, headings, image alt text), most useful first,
 * trimmed to a fixed token budget.
 *
 * Every item has a short id ("p3", "cta2"). The model cites ids or short quotes as evidence, and
 * enrich.ts checks that each citation really exists in this input before trusting it.
 */
import type { KnowledgeBase } from "@/types/knowledge";

export interface EvidenceItem {
  id: string;
  /** What kind of thing this is, so the model can weigh it ("page", "cta", "testimonial"...) */
  kind: string;
  /** Page path it came from, when there is one */
  page?: string;
  text: string;
}

export interface Evidence {
  items: EvidenceItem[];
  /** Offerings with an index, for per-offering category suggestions */
  offerings: { index: number; name: string; category: string | null; priceText: string | null }[];
  /** What to do about offering categories (see categoryTask) */
  offeringCategoryTask: "fill_missing" | "review_shared" | "none";
  /** True when the crawl recorded page headings (records scraped before Phase 9 don't have them) */
  hasPageEvidence: boolean;
  /** Estimated tokens of the JSON sent to the model */
  tokens: number;
}

const vals = <T>(list: { value: T | null }[]): T[] => list.flatMap((f) => (f.value === null ? [] : [f.value]));
const cut = (s: string | null | undefined, max: number) => (s ? (s.length > max ? `${s.slice(0, max)}…` : s) : "");
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);
const pathOf = (url: string | null | undefined) => {
  try {
    return url ? new URL(url).pathname || "/" : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Offering categories: fill them when some are missing; when every offering shares one scraped
 * category (Apex: everything is "Minecraft Server Hosting"), ask for a per-offering review.
 */
function categoryTask(kb: KnowledgeBase): Evidence["offeringCategoryTask"] {
  const offerings = vals(kb.offerings);
  if (offerings.length === 0) return "none";
  if (offerings.some((o) => !o.category)) return "fill_missing";
  const shared = new Set(offerings.map((o) => o.category?.toLowerCase()));
  return offerings.length >= 3 && shared.size === 1 ? "review_shared" : "none";
}

export function buildEvidence(kb: KnowledgeBase, budgetTokens: number): Evidence {
  const c = kb.company;
  // Groups in priority order; within a group, items keep page order.
  const groups: EvidenceItem[][] = [];
  const group = (prefix: string, rows: Omit<EvidenceItem, "id">[]) =>
    groups.push(rows.filter((r) => r.text.trim()).map((r, i) => ({ id: `${prefix}${i + 1}`, ...r })));

  // 1. The business in its own words
  group("f", [
    { kind: "company_name", text: kb.companyName },
    { kind: "overview", page: pathOf(c.overview.source), text: cut(c.overview.value, 1200) },
    { kind: "founding_story", page: pathOf(c.foundingStory.source), text: cut(c.foundingStory.value, 1200) },
    { kind: "industry_from_site_data", text: c.industry.value ?? "" },
    ...(c.yearFounded.value ? [{ kind: "year_founded", text: String(c.yearFounded.value) }] : []),
  ]);
  // 2. Every crawled page: title, meta description, headings
  group(
    "p",
    kb.crawl.pages
      .filter((p) => !p.error)
      .map((p) => ({
        kind: `page:${p.category}`,
        page: pathOf(p.url),
        text: [p.title, p.metaDescription && `meta: ${cut(p.metaDescription, 240)}`, p.headings?.length ? `headings: ${p.headings.join(" | ")}` : ""]
          .filter(Boolean)
          .join(" — "),
      })),
  );
  // 3. Brands, locations and what they sell
  group("b", vals(c.alternateNames).map((n) => ({ kind: "brand_or_sub_brand", text: n })));
  group("l", [
    ...(c.mainAddress.value ? [{ kind: "main_location", text: `${c.mainAddress.value.city ?? ""}, ${c.mainAddress.value.region ?? ""}` }] : []),
    ...kb.company.otherLocations.flatMap((f) => (f.value ? [{ kind: "other_location", page: pathOf(f.source), text: `${f.value.city ?? ""}, ${f.value.region ?? ""}` }] : [])),
    ...vals(c.serviceLocations).map((s) => ({ kind: "service_area", text: s })),
  ]);
  group(
    "o",
    kb.offerings.slice(0, 40).flatMap((f) => (f.value ? [{ kind: "offering", page: pathOf(f.source), text: [f.value.name, f.value.category && `(${f.value.category})`, f.value.priceText].filter(Boolean).join(" ") }] : [])),
  );
  // 4. What visitors are asked to do, and where it goes
  group(
    "cta",
    kb.customers.ctas.flatMap((f) => (f.value ? [{ kind: "cta", page: pathOf(f.source), text: `"${f.value.text}"${f.value.url ? ` → ${f.value.url}` : ""}` }] : [])),
  );
  // 5. Customers' words (no names: people are never guessed) and their questions
  group("t", vals(kb.insights.testimonials).map((t) => ({ kind: "testimonial_text", text: cut(t.quote, 300) })));
  group("q", vals(kb.insights.faqs).map((f) => ({ kind: "faq", text: `${f.question} ${cut(f.answer, 200)}` })));
  // 6. Everything else
  group("d", vals(kb.insights.differentiators).map((d) => ({ kind: "differentiator", text: d })));
  group("s", vals(kb.insights.trustSignals).map((t) => ({ kind: `trust:${t.kind}`, text: cut(t.text, 160) })));
  group("pr", vals(kb.insights.promotions).map((p) => ({ kind: "promotion", text: cut(p, 160) })));
  group(
    "i",
    [...new Set(kb.crawl.pages.flatMap((p) => p.imageAlts ?? []))].map((a) => ({ kind: "image_alt_or_logo_file", text: a })),
  );
  group("x", vals(kb.customers.suppliersPartners).map((s) => ({ kind: `tool_or_partner:${s.category}`, text: s.name })));

  const offerings = kb.offerings.slice(0, 40).flatMap((f, index) => (f.value ? [{ index, name: f.value.name, category: f.value.category, priceText: f.value.priceText }] : []));
  const task = categoryTask(kb);

  // Fill the budget group by group, item by item: highest value first.
  const fixed = estimateTokens(JSON.stringify({ offerings, offeringCategoryTask: task })) + 200;
  const items: EvidenceItem[] = [];
  let used = fixed;
  for (const g of groups) {
    for (const item of g) {
      const cost = estimateTokens(JSON.stringify(item));
      if (used + cost > budgetTokens) continue; // skip this one, a smaller later item may still fit
      items.push(item);
      used += cost;
    }
  }
  return {
    items,
    offerings,
    offeringCategoryTask: task,
    hasPageEvidence: kb.crawl.pages.some((p) => (p.headings?.length ?? 0) > 0 || !!p.metaDescription),
    tokens: used,
  };
}

/** The JSON the model receives. */
export function evidencePayload(e: Evidence): string {
  return JSON.stringify({ evidence: e.items, offerings: e.offerings, offeringCategoryTask: e.offeringCategoryTask });
}

/**
 * Resolve a model citation to something the owner can read, or null if it isn't real.
 * A citation is an item id ("p3") or a short quote that appears in the input.
 */
export function resolveCitation(citation: string, e: Evidence, inputLower: string): string | null {
  const c = citation.trim().replace(/^\[|\]$/g, "");
  const item = e.items.find((i) => i.id === c);
  if (item) return `${item.page ? `${item.page}: ` : ""}${cut(item.text, 90)}`;
  const quote = c.replace(/^["“']|["”']$/g, "").trim();
  if (quote.length >= 3 && inputLower.includes(quote.toLowerCase())) return `“${cut(quote, 90)}”`;
  return null;
}
