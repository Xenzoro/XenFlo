import { describe, expect, it } from "vitest";
import type { Suggestion } from "@/types/enrichment";
import { emptyKnowledgeBase, field } from "@/lib/utils/knowledge";
import { FIELD_TIERS, filterByTier, tierOf } from "./field-tiers";

const SECTIONS = ["company", "contact", "customers", "brand", "insights", "contentKit"] as const;

const suggest = (path: string, value: unknown, basedOn: string[] = ["overview"], list = Array.isArray(value)): Suggestion => ({
  path,
  label: path,
  value,
  list,
  confidence: "ai_live",
  source: "ai:test",
  basedOn,
});

describe("FIELD_TIERS", () => {
  it("covers every field in the knowledge base", () => {
    const kb = emptyKnowledgeBase("https://example.com/");
    const paths = [...SECTIONS.flatMap((s) => Object.keys(kb[s]).map((k) => `${s}.${k}`)), "people", "offerings"];
    const missing = paths.filter((p) => FIELD_TIERS[p] === undefined);
    expect(missing).toEqual([]);
  });

  it("normalizes list item paths", () => {
    expect(tierOf("offerings.3.category")).toBe(2);
    expect(tierOf("people.2.name")).toBe(3);
    expect(tierOf("insights.testimonials.0.author")).toBe(3);
    expect(tierOf("not.a.field")).toBe(3);
  });
});

describe("filterByTier", () => {
  it("drops every tier 3 suggestion, whatever the evidence", () => {
    const kb = emptyKnowledgeBase("https://example.com/");
    const out = filterByTier(
      [
        suggest("people", ["Jane Example"], ["Jane Example, Owner"]),
        suggest("people.0.title", "Owner", ["Jane Example, Owner"]),
        suggest("insights.testimonials.0.author", "Sam E.", ["- Sam E."]),
        suggest("company.legalName", "Example Cafe LLC", ["© Example Cafe LLC"]),
        suggest("company.legalEntityType", "LLC", ["© Example Cafe LLC"]),
        suggest("company.employeeCount", "11-50"),
        suggest("company.revenue", "$1M"),
        suggest("company.industry", "Restaurant"),
      ],
      kb,
    );
    expect(out.map((s) => s.path)).toEqual(["company.industry"]);
  });

  it("never replaces a tier 1 value, and fills an empty one only with a verbatim quote", () => {
    const kb = emptyKnowledgeBase("https://example.com/");
    kb.company.overview = field("We serve sushi.", "https://example.com/", "scraped");
    const out = filterByTier(
      [
        suggest("company.overview", "A better overview"),
        suggest("company.foundingStory", "Founded by friends", ["about: we were founded by friends in 2020"]),
        suggest("contact.emails", ["hi@example.com"], ["contact: hello@example.com"]),
      ],
      kb,
    );
    expect(out.map((s) => s.path)).toEqual(["company.foundingStory"]);
  });

  it("drops dismissed values and Not applicable fields", () => {
    const kb = emptyKnowledgeBase("https://example.com/");
    kb.dismissed = [{ path: "customers.channels", key: "drive-thru", at: "" }];
    kb.notApplicable = ["company.businessModel"];
    const out = filterByTier([suggest("customers.channels", ["Drive-thru", "Online ordering"]), suggest("company.businessModel", "B2C")], kb);
    expect(out).toHaveLength(1);
    expect(out[0].value).toEqual(["Online ordering"]);
  });
});
