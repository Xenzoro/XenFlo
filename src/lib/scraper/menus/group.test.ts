import { describe, expect, it } from "vitest";
import type { Address, Offering } from "@/types/knowledge";
import { emptyKnowledgeBase, field } from "@/lib/utils/knowledge";
import { groupOfferings, linkOfferingLocations } from "./group";

const SITE = "https://www.harborgroup.example";
const address = (formatted: string): Address => ({ street: null, city: null, region: null, postalCode: null, country: null, formatted });
const item = (name: string, group: string | null, category: string | null, priceAmount: number | null, foundOn: string | null = null): Offering => ({
  name,
  category,
  description: null,
  features: [],
  pricingType: priceAmount === null ? "unknown" : "fixed",
  priceText: priceAmount === null ? null : `$${priceAmount}`,
  priceAmount,
  currency: priceAmount === null ? null : "USD",
  group,
  foundOn,
  sourceKind: "pdf",
});

describe("groupOfferings", () => {
  const groups = groupOfferings([
    field(item("Salmon Nigiri", "Sakana", "Nigiri", 6), "pdf", "scraped"),
    field(item("Gift card", null, null, null), SITE, "scraped"),
    field(item("Dragon Roll", "Sakana", "Rolls", 14.5), "pdf", "scraped"),
    field(item("Tuna Nigiri", "Sakana", "Nigiri", 7), "pdf", "scraped"),
    field(item("Bulgogi", "Umami", "Grill", 22), "pdf", "scraped"),
  ]);

  it("groups by brand, then category, with counts and price ranges", () => {
    expect(groups.map((g) => [g.name, g.count, g.priceMin, g.priceMax])).toEqual([
      ["Sakana", 3, 6, 14.5],
      ["Umami", 1, 22, 22],
      [null, 1, null, null],
    ]);
    expect(groups[0].categories.map((c) => [c.name, c.items.map((i) => i.field.value?.name)])).toEqual([
      ["Nigiri", ["Salmon Nigiri", "Tuna Nigiri"]],
      ["Rolls", ["Dragon Roll"]],
    ]);
  });

  it("keeps each item's index for edits and removals", () => {
    expect(groups[0].categories[1].items[0].index).toBe(2);
  });
});

describe("linkOfferingLocations", () => {
  it("links a brand's menu to the address found on the same page", () => {
    const kb = emptyKnowledgeBase(SITE);
    kb.company.otherLocations.push(field(address("3949 Example Pkwy, Springfield, NV 89000"), `${SITE}/sakana`, "scraped"));
    kb.offerings.push(field(item("Dragon Roll", "Sakana", "Rolls", 14.5, `${SITE}/sakana/`), `${SITE}/files/sakana.pdf`, "scraped"));
    kb.offerings.push(field(item("Bulgogi", "Umami", "Grill", 22, `${SITE}/umami`), `${SITE}/files/umami.pdf`, "scraped"));
    linkOfferingLocations(kb);
    expect(kb.offerings[0].value?.location).toBe("3949 Example Pkwy, Springfield, NV 89000");
    expect(kb.offerings[1].value?.location).toBeUndefined();
  });
});
