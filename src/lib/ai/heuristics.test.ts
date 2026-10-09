import { describe, expect, it } from "vitest";
import type { KnowledgeBase } from "@/types/knowledge";
import { emptyKnowledgeBase, field } from "@/lib/utils/knowledge";
import { buildEvidence } from "./evidence";
import { heuristicSuggestions } from "./heuristics";

const page = (path: string, title: string, headings: string[] = []) => ({
  url: `https://example.com${path}`,
  category: "other" as const,
  status: 200,
  title,
  fetchedAt: "",
  durationMs: 1,
  error: null,
  headings,
});

function run(kb: KnowledgeBase) {
  const out = heuristicSuggestions(kb, buildEvidence(kb, 8000));
  return Object.fromEntries(out.map((s) => [s.path, s]));
}

describe("heuristicSuggestions", () => {
  it("restaurant group: industry, groupings, channels and a local B2C model", () => {
    const kb = emptyKnowledgeBase("https://example.com/");
    kb.company.overview = field("Example Eats runs all you can eat sushi and kbbq restaurants in Springfield.", "https://example.com/", "scraped");
    kb.crawl.pages = [page("/sushi-place", "Sushi Place", ["AYCE Sushi"]), page("/grill-house", "Grill House", ["Korean BBQ", "Order online"])];
    kb.customers.ctas = [field({ text: "order online", url: "https://order.example.com" }, "https://example.com/", "scraped")];
    kb.company.otherLocations = [field({ street: "1 Example Ave", city: "Springfield", region: "NV", postalCode: "89000", country: "US", formatted: "1 Example Ave, Springfield, NV 89000" }, "https://example.com/sushi-place", "scraped")];
    const s = run(kb);
    expect(s["company.industry"]?.value).toBe("Restaurants");
    expect(s["customers.industryGroupings"]?.value).toEqual(expect.arrayContaining(["Sushi", "Korean BBQ"]));
    expect(s["customers.channels"]?.value).toEqual(["Online ordering"]);
    expect(s["company.businessModel"]?.value).toBe("B2C, local");
    expect(s["company.industry"]?.confidence).toBe("inferred");
    expect(s["company.industry"]?.basedOn.length).toBeGreaterThanOrEqual(2);
  });

  it("needs 2 pieces of evidence: one mention of plumbing isn't enough", () => {
    const kb = emptyKnowledgeBase("https://example.com/");
    kb.company.overview = field("We fix things around the house, including plumbing.", "https://example.com/", "scraped");
    expect(run(kb)["company.industry"]).toBeUndefined();
  });

  it("hosting with monthly plans: subscription model", () => {
    const kb = emptyKnowledgeBase("https://example.com/");
    kb.company.overview = field("Fast Minecraft server hosting with 24/7 support.", "https://example.com/", "scraped");
    kb.crawl.pages = [page("/pricing", "Minecraft Server Hosting Plans")];
    kb.offerings = [
      field({ name: "2 GB", category: null, description: null, features: [], pricingType: "subscription", priceText: "$5/mo", priceAmount: 5, currency: "USD" }, "https://example.com/pricing", "scraped"),
      field({ name: "4 GB", category: null, description: null, features: [], pricingType: "subscription", priceText: "$9/mo", priceAmount: 9, currency: "USD" }, "https://example.com/pricing", "scraped"),
    ];
    const s = run(kb);
    expect(s["company.industry"]?.value).toBe("Game server hosting");
    expect(s["company.businessModel"]?.value).toBe("Subscription");
  });
});
