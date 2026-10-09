import { describe, expect, it } from "vitest";
import type { Confidence, Offering } from "@/types/knowledge";
import { emptyKnowledgeBase, field } from "@/lib/utils/knowledge";
import { quotablePrice } from "@/lib/ai/evidence";
import { mergeMenuResult, reviewGroup, reviewProgress } from "./offerings";

const SITE = "https://www.harborgroup.example";
const item = (name: string, group: string, confidence: Confidence, priceText: string | null = "$12") =>
  field<Offering>({ name, category: "Rolls", description: null, features: [], pricingType: "fixed", priceText, priceAmount: 12, currency: "USD", group, sourceKind: "pdf", categoryConfidence: "ai_live" }, `${SITE}/m.pdf`, confidence);

describe("menu review", () => {
  it("marks one brand's AI items as reviewed by the owner, with a timestamp", () => {
    const kb = emptyKnowledgeBase(SITE);
    kb.offerings.push(item("Dragon Roll", "Kelp", "ai_live"), item("Gyoza", "Tide", "ai_live"), item("Edamame", "Kelp", "scraped"));
    expect(reviewProgress(kb.offerings)).toEqual({ reviewed: 0, total: 2 });
    const out = reviewGroup(kb, "Kelp");
    expect(out.offerings[0]).toMatchObject({ confidence: "user_edited", source: `${SITE}/m.pdf` });
    expect(out.offerings[0].reviewedAt).toBeTruthy();
    expect(out.offerings[0].value?.categoryConfidence).toBeUndefined();
    expect(out.offerings[1].confidence).toBe("ai_live"); // another brand: untouched
    expect(out.offerings[2].confidence).toBe("scraped"); // read from text: nothing to review
    expect(reviewProgress(out.offerings)).toEqual({ reviewed: 1, total: 2 });
  });

  it("keeps unreviewed AI prices out of AI prompts", () => {
    expect(quotablePrice(item("Dragon Roll", "Kelp", "ai_live"))).toBeNull();
    expect(quotablePrice(item("Edamame", "Kelp", "scraped"))).toBe("$12");
    const kb = reviewGroup({ ...emptyKnowledgeBase(SITE), offerings: [item("Dragon Roll", "Kelp", "ai_live")] }, "Kelp");
    expect(quotablePrice(kb.offerings[0])).toBe("$12");
  });

  it("replaces a re-read menu's items but keeps the owner's edits", () => {
    const kb = emptyKnowledgeBase(SITE);
    kb.crawl.menuSources = [{ url: `${SITE}/m.pdf`, kind: "pdf", foundOn: `${SITE}/kelp`, label: "menu", group: "Kelp", status: "read_ai", items: 2, readAs: "picture" }];
    kb.offerings.push(item("Old Reading", "Kelp", "ai_live"), item("My Edit", "Kelp", "user_edited"));
    const out = mergeMenuResult(kb, {
      mode: "live",
      offerings: [item("Omakase AYCE", "Kelp", "ai_live", "$58.95")],
      sources: kb.crawl.menuSources,
      replaces: [`${SITE}/m.pdf`],
      read: 1,
      remaining: 0,
      cachedCount: 0,
      notes: [],
      remainingToday: null,
    });
    expect(out.offerings.map((f) => f.value?.name)).toEqual(["My Edit", "Omakase AYCE"]);
  });
});
