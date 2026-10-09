import { describe, expect, it } from "vitest";
import type { MenuSource } from "@/types/knowledge";
import { emptyKnowledgeBase, field } from "@/lib/utils/knowledge";
import { dismissIn } from "./apply";
import { freshItems, itemsFromReader, pickMenuSources, readPrice } from "./menus";

const SITE = "https://www.harborgroup.example";
const src = (name: string, over: Partial<MenuSource>): MenuSource => ({
  url: `${SITE}/files/${name}`,
  kind: "pdf",
  foundOn: `${SITE}/${name}`,
  label: "menu",
  group: name,
  status: "no_text",
  items: 0,
  pages: 2,
  bytes: 1_000_000,
  ...over,
});

describe("pickMenuSources", () => {
  it("fills the 8-unit cap, brand pages and smaller PDFs first, and counts what's left", () => {
    const kb = emptyKnowledgeBase(SITE);
    kb.crawl.menuSources = [
      src("hub.pdf", { group: null, bytes: 100 }),
      src("big.pdf", { bytes: 9_000_000 }),
      src("a.pdf", { bytes: 500_000 }),
      src("b.pdf", { bytes: 600_000, pages: 6 }), // counts as 4 (first 4 pages)
      src("c.pdf", { bytes: 700_000 }),
      src("photo.jpg", { kind: "image", status: "found", area: 480 * 480, label: null }),
      src("done.pdf", { status: "read_ai" }),
      src("huge.pdf", { status: "too_large" }),
      src("messy.pdf", { status: "messy", text: "Appetizer Edamame Gyoza" }),
    ];
    const plan = pickMenuSources(kb);
    expect(plan.vision.map((v) => [v.source.group, v.units])).toEqual([
      ["a.pdf", 2],
      ["b.pdf", 4],
      ["c.pdf", 2],
    ]);
    expect(plan.vision.reduce((n, v) => n + v.units, 0)).toBe(8);
    expect(plan.text.map((t) => t.group)).toEqual(["messy.pdf"]);
    // big.pdf, the hub PDF and the photo wait for the next run; read, too-large ones are never picked
    expect(plan.skipped).toBe(3);
  });

  it("reads images named like a menu before bigger unnamed ones", () => {
    const kb = emptyKnowledgeBase(SITE);
    kb.crawl.menuSources = [
      src("hero.jpg", { kind: "image", status: "found", area: 4_000_000, label: null }),
      src("board.jpg", { kind: "image", status: "found", area: 1_000_000, label: "Drinks menu" }),
    ];
    expect(pickMenuSources(kb, 1).vision.map((v) => v.source.group)).toEqual(["board.jpg"]);
  });
});

describe("itemsFromReader", () => {
  const out = {
    isMenu: true,
    unreadable: null,
    items: [
      { name: "Tonkotsu Ramen", description: "Pork broth, soft egg", price: "$14.99", section: "Noodles" },
      { name: "House Lemonade", description: null, price: null, section: "Drinks" },
      { name: "Gyoza", description: null, price: "about five dollars", section: null },
      { name: "Truffle Udon", description: null, price: "$19.00", section: "Noodles" },
      { name: "Market Fish", description: null, price: "MP", section: null },
      { name: "tonkotsu ramen", description: null, price: "$14.99", section: null }, // duplicate
    ],
  };

  it("marks picture-menu items ai_live and never invents a price", () => {
    const items = itemsFromReader(out);
    expect(items.every((i) => i.confidence === "ai_live")).toBe(true);
    expect(items.map((i) => [i.item.name, i.item.price?.priceAmount ?? null])).toEqual([
      ["Tonkotsu Ramen", 14.99],
      ["House Lemonade", null],
      ["Gyoza", null], // "about five dollars" has no printed number: dropped
      ["Truffle Udon", 19],
      ["Market Fish", null],
    ]);
    expect(items[4].item.price?.priceText).toBe("Market price");
  });

  it("keeps messy-text items scraped only when every value is in the text, and drops prices that aren't", () => {
    const text = "NOODLES\nTonkotsu Ramen\nPork broth, soft egg\n$14.99\nDRINKS\nHouse Lemonade\nGyoza\nTruffle Udon\nMarket Fish MP";
    const items = itemsFromReader(out, text);
    const by = (n: string) => items.find((i) => i.item.name === n)!;
    expect(by("Tonkotsu Ramen").confidence).toBe("scraped");
    expect(by("House Lemonade").confidence).toBe("scraped");
    // "$19.00" isn't printed in the text: the price is dropped and the item is ai_live
    expect(by("Truffle Udon").item.price).toBeNull();
    expect(by("Truffle Udon").confidence).toBe("ai_live");
  });

  it("returns nothing when the model says it isn't a menu", () => {
    expect(itemsFromReader({ isMenu: false, items: out.items, unreadable: null })).toEqual([]);
  });
});

describe("readPrice", () => {
  it("copies prices and drops non-prices", () => {
    expect(readPrice("$12.99")?.priceAmount).toBe(12.99);
    expect(readPrice("Small $5 / Large $8")).toMatchObject({ priceText: "Small $5 / Large $8", priceAmount: 5 });
    expect(readPrice("ask your server")).toBeNull();
    expect(readPrice(null)).toBeNull();
  });
});

describe("dismissed menu items", () => {
  it("are not added again after Wrong? Remove", () => {
    let kb = emptyKnowledgeBase(SITE);
    kb.offerings.push(
      field({ name: "Dragon Roll", category: "Rolls", description: null, features: [], pricingType: "fixed", priceText: "$14", priceAmount: 14, currency: "USD", group: "Sakana" }, "pdf", "ai_live"),
    );
    kb = dismissIn(kb, "offerings", 0);
    expect(kb.offerings).toHaveLength(0);
    const read = itemsFromReader({ isMenu: true, unreadable: null, items: [{ name: "Dragon Roll", description: null, price: "$14", section: "Rolls" }, { name: "Rainbow Roll", description: null, price: "$15", section: "Rolls" }] });
    expect(freshItems(kb, "Sakana", read).map((i) => i.item.name)).toEqual(["Rainbow Roll"]);
    // Another brand's Dragon Roll is a different item
    expect(freshItems(kb, "Umami", read).map((i) => i.item.name)).toEqual(["Dragon Roll", "Rainbow Roll"]);
  });
});
