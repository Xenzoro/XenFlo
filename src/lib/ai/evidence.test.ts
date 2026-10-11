import { describe, expect, it } from "vitest";
import { emptyKnowledgeBase, field } from "@/lib/utils/knowledge";
import type { Offering } from "@/types/knowledge";
import { buildEvidence, MAX_CATEGORY_FILL } from "./evidence";

const offering = (name: string, category: string | null): Offering => ({
  name,
  category,
  description: null,
  features: [],
  pricingType: "unknown",
  priceText: null,
  priceAmount: null,
  currency: null,
});

const withOfferings = (list: Offering[]) => {
  const kb = emptyKnowledgeBase("https://example.com/");
  kb.offerings = list.map((o) => field(o, "https://example.com/menu", "scraped"));
  return kb;
};

describe("buildEvidence offering categories", () => {
  // Dragon after "Read menus with AI": hundreds of categorized items, a few gaps far down the list
  const many = [
    ...Array.from({ length: 100 }, (_, i) => offering(`Roll ${i}`, "Sushi")),
    ...Array.from({ length: 20 }, (_, i) => offering(`Mystery ${i}`, null)),
  ];

  it("sends only uncategorized offerings for fill_missing, capped", () => {
    const e = buildEvidence(withOfferings(many), 16000);
    expect(e.offeringCategoryTask).toBe("fill_missing");
    expect(e.offerings).toHaveLength(MAX_CATEGORY_FILL);
    expect(e.offerings.every((o) => o.category === null)).toBe(true);
    // Real list indexes, so a suggestion lands on the right offering
    expect(e.offerings[0]).toMatchObject({ index: 100, name: "Mystery 0" });
  });

  it("lists the offerings to categorize first in the evidence, so they can be cited by id", () => {
    const e = buildEvidence(withOfferings(many), 16000);
    const shown = e.items.filter((i) => i.kind === "offering");
    expect(shown).toHaveLength(40);
    expect(shown[0].text).toBe("Mystery 0");
  });

  it("keeps the first 40 for review_shared", () => {
    const e = buildEvidence(withOfferings(Array.from({ length: 50 }, (_, i) => offering(`Plan ${i}`, "Minecraft Server Hosting"))), 16000);
    expect(e.offeringCategoryTask).toBe("review_shared");
    expect(e.offerings).toHaveLength(40);
    expect(e.offerings[0].index).toBe(0);
  });

  it("has no task without offerings", () => {
    const e = buildEvidence(withOfferings([]), 16000);
    expect(e.offeringCategoryTask).toBe("none");
    expect(e.offerings).toEqual([]);
  });
});
