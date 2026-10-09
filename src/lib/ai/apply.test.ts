import { describe, expect, it } from "vitest";
import type { Suggestion } from "@/types/enrichment";
import { emptyKnowledgeBase, field } from "@/lib/utils/knowledge";
import { setAt } from "@/lib/utils/path";
import { isAi } from "@/lib/utils/fields";
import { applySuggestionsTo, dismissIn } from "./apply";
import { guard } from "./enrich";

const s = (path: string, value: unknown, extra: Partial<Suggestion> = {}): Suggestion => ({
  path,
  label: path,
  value,
  list: Array.isArray(value),
  confidence: "ai_live",
  source: "ai:test",
  basedOn: ["/: Example Eats runs sushi restaurants", "/menu: Sushi menu"],
  ...extra,
});

describe("accept, edit, remove", () => {
  it("keeps AI confidence and evidence when applied", () => {
    const kb = applySuggestionsTo(emptyKnowledgeBase("https://example.com/"), [s("company.industry", "Restaurants"), s("customers.channels", ["Online ordering"])]);
    expect(kb.company.industry).toMatchObject({ value: "Restaurants", confidence: "ai_live", evidence: expect.any(Array) });
    expect(kb.customers.channels[0]).toMatchObject({ value: "Online ordering", confidence: "ai_live" });
    expect(isAi(kb.company.industry.confidence)).toBe(true);
  });

  it("an owner edit makes it user_edited: the AI badge goes away and AI won't replace it", () => {
    let kb = applySuggestionsTo(emptyKnowledgeBase("https://example.com/"), [s("company.industry", "Restaurants")]);
    // What KnowledgeContext.setField does when the owner types a value
    kb = setAt(kb, "company.industry", field("Sushi restaurants", "user", "user_edited"));
    expect(isAi(kb.company.industry.confidence)).toBe(false);
    expect(guard(kb, [s("company.industry", "Restaurants")])).toEqual([]);
  });

  it("Wrong? Remove clears it and stops the same suggestion coming back", () => {
    let kb = applySuggestionsTo(emptyKnowledgeBase("https://example.com/"), [s("company.industry", "Restaurants"), s("customers.channels", ["Online ordering", "Walk-in"])]);
    kb = dismissIn(kb, "company.industry");
    kb = dismissIn(kb, "customers.channels", 1);
    expect(kb.company.industry).toMatchObject({ value: null, confidence: "missing" });
    expect(kb.customers.channels.map((f) => f.value)).toEqual(["Online ordering"]);
    const again = guard(kb, [s("company.industry", "Restaurants"), s("customers.channels", ["Walk-in", "Phone"]), s("company.businessModel", "B2C, local")]);
    expect(again.map((x) => [x.path, x.value])).toEqual([
      ["customers.channels", ["Phone"]],
      ["company.businessModel", "B2C, local"],
    ]);
  });

  it("offering categories: applied to the category only, removable and remembered", () => {
    let kb = emptyKnowledgeBase("https://example.com/");
    kb.offerings = [field({ name: "Valheim", category: "Minecraft Server Hosting", description: null, features: [], pricingType: "unknown", priceText: null, priceAmount: null, currency: null }, "https://example.com/games", "scraped")];
    const cat = s("offerings.0.category", "Valheim server hosting", { offering: { index: 0, name: "Valheim" }, dismissKey: "valheim=>valheim server hosting" });
    kb = applySuggestionsTo(kb, [cat]);
    expect(kb.offerings[0]).toMatchObject({ confidence: "scraped", value: { category: "Valheim server hosting", categoryConfidence: "ai_live" } });
    kb = dismissIn(kb, "offerings.0.category");
    expect(kb.offerings[0].value?.category).toBeNull();
    expect(guard(kb, [cat])).toEqual([]);
  });
});
