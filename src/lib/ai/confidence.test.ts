import { describe, expect, it } from "vitest";
import { emptyKnowledgeBase, field } from "@/lib/utils/knowledge";
import { buildEvidence, evidencePayload } from "./evidence";
import { checkAnswer } from "./confidence";

// A fictional restaurant group: overview + two restaurant pages
const kb = emptyKnowledgeBase("https://example.com/");
kb.companyName = "Example Eats";
kb.company.overview = field("Example Eats runs all you can eat sushi and hot pot restaurants across Springfield.", "https://example.com/", "scraped");
kb.crawl.pages = [
  { url: "https://example.com/sushi-place", category: "other", status: 200, title: "Sushi Place Springfield", fetchedAt: "", durationMs: 1, error: null, headings: ["AYCE Sushi", "Hours"] },
  { url: "https://example.com/hot-pot-house", category: "other", status: 200, title: "Hot Pot House", fetchedAt: "", durationMs: 1, error: null, headings: ["All you can eat hot pot"] },
];
const e = buildEvidence(kb, 8000);
const input = evidencePayload(e).toLowerCase();
const id = (text: string) => e.items.find((i) => i.text.includes(text))!.id;

describe("checkAnswer (facts)", () => {
  it("passes high with 2 real evidence items", () => {
    const v = checkAnswer("company.industry", { confidence: "high", evidence: [id("runs all you can eat"), id("Sushi Place")], reason: null }, ["Restaurants"], e, input);
    expect(v.ok).toBe(true);
    expect(v.evidence).toHaveLength(2);
  });

  it("drops high with only 1 evidence item and no quote of the value", () => {
    const v = checkAnswer("company.industry", { confidence: "high", evidence: [id("Sushi Place")], reason: null }, ["Restaurants"], e, input);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/one piece/);
  });

  it("passes high with 1 direct quote that contains the value", () => {
    const v = checkAnswer("customers.industryGroupings", { confidence: "high", evidence: ["\"all you can eat hot pot\""], reason: null }, ["hot pot"], e, input);
    expect(v.ok).toBe(true);
  });

  it("ignores made-up citations", () => {
    const v = checkAnswer("company.industry", { confidence: "high", evidence: ["p99", "\"award-winning steakhouse\""], reason: null }, ["Steakhouse"], e, input);
    expect(v.ok).toBe(false);
    expect(v.evidence).toEqual([]);
  });

  it("never passes medium or low", () => {
    for (const confidence of ["medium", "low"] as const) {
      const v = checkAnswer("customers.channels", { confidence, evidence: [id("Sushi Place"), id("Hot Pot House")], reason: "Only implied." }, ["Dine-in"], e, input);
      expect(v.ok).toBe(false);
      expect(v.reason).toBe("Only implied.");
    }
  });
});

describe("checkAnswer (generated fields)", () => {
  it("passes a grounded pitch with 1 real evidence item", () => {
    const v = checkAnswer("company.pitch", { confidence: "high", evidence: [id("runs all you can eat")], reason: null }, ["All-you-can-eat sushi and hot pot in Springfield."], e, input);
    expect(v.ok).toBe(true);
  });

  it("drops a generated field with no real evidence", () => {
    const v = checkAnswer("contentKit.hashtags", { confidence: "high", evidence: ["p99"], reason: null }, ["#ExampleEats"], e, input);
    expect(v.ok).toBe(false);
  });
});
