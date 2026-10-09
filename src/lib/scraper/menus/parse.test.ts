import { describe, expect, it } from "vitest";
import { menuTextQuality, parseMenuLines, parsePrice } from "./parse";

describe("parsePrice", () => {
  it("reads dollar, decimal and whole prices", () => {
    expect(parsePrice("$12.99")).toMatchObject({ priceAmount: 12.99, priceText: "$12.99", pricingType: "fixed", currency: "USD" });
    expect(parsePrice("12.99")).toMatchObject({ priceAmount: 12.99 });
    expect(parsePrice("12")).toMatchObject({ priceAmount: 12 });
    expect(parsePrice("$ 8")).toMatchObject({ priceAmount: 8 });
  });

  it("keeps units and ranges as printed", () => {
    expect(parsePrice("$9.95/person")).toMatchObject({ priceAmount: 9.95, priceText: "$9.95/person" });
    expect(parsePrice("$10 - $15")).toMatchObject({ priceAmount: 10, pricingType: "range" });
  });

  it("never guesses a market price", () => {
    expect(parsePrice("Market price")).toEqual({ pricingType: "unknown", priceText: "Market price", priceAmount: null, currency: null });
    expect(parsePrice("MP")).toMatchObject({ priceText: "Market price", priceAmount: null });
  });

  it("rejects text that isn't a price", () => {
    expect(parsePrice("California Roll")).toBeNull();
    expect(parsePrice("Open 11am")).toBeNull();
    expect(parsePrice("")).toBeNull();
  });
});

// Fictional menu, as text comes out of a PDF: headings, dotted leaders, prices on their own lines.
const HARBOR_NOODLE_BAR = `
Harbor Noodle Bar
Fresh noodles since last Tuesday.
APPETIZERS
Pork Gyoza ..... $6.50
Pan-fried dumplings, ginger soy
Edamame 5
Crispy Tofu
$7.25
NOODLES
Tonkotsu Ramen $14.99
Pork broth, chashu, soft egg, scallion
Spicy Miso Ramen 15.50
Market Catch Udon MP
DRINKS
Thai Iced Tea $4.50
House Lemonade
`.split("\n");

describe("parseMenuLines", () => {
  const items = parseMenuLines(HARBOR_NOODLE_BAR);
  const byName = (n: string) => items.find((i) => i.name === n);

  it("finds items under their headings", () => {
    expect(items.map((i) => i.name)).toEqual([
      "Pork Gyoza",
      "Edamame",
      "Crispy Tofu",
      "Tonkotsu Ramen",
      "Spicy Miso Ramen",
      "Market Catch Udon",
      "Thai Iced Tea",
      "House Lemonade",
    ]);
    expect(byName("Pork Gyoza")?.category).toBe("Appetizers");
    expect(byName("Tonkotsu Ramen")?.category).toBe("Noodles");
    expect(byName("Thai Iced Tea")?.category).toBe("Drinks");
  });

  it("reads prices from the same line or the line below", () => {
    expect(byName("Pork Gyoza")?.price?.priceAmount).toBe(6.5);
    expect(byName("Edamame")?.price?.priceAmount).toBe(5);
    expect(byName("Crispy Tofu")?.price?.priceAmount).toBe(7.25);
    expect(byName("Spicy Miso Ramen")?.price?.priceAmount).toBe(15.5);
  });

  it("attaches descriptions", () => {
    expect(byName("Pork Gyoza")?.description).toBe("Pan-fried dumplings, ginger soy");
    expect(byName("Tonkotsu Ramen")?.description).toBe("Pork broth, chashu, soft egg, scallion");
  });

  it("never invents a price", () => {
    expect(byName("House Lemonade")?.price).toBeNull();
    expect(byName("Market Catch Udon")?.price).toMatchObject({ priceText: "Market price", priceAmount: null });
  });

  it("skips intro text before the first heading", () => {
    expect(byName("Harbor Noodle Bar")).toBeUndefined();
  });

  it("can keep only priced items (web pages)", () => {
    const priced = parseMenuLines(HARBOR_NOODLE_BAR, { requirePrice: true });
    expect(priced.some((i) => i.name === "House Lemonade")).toBe(false);
    expect(priced).toHaveLength(7);
  });

  it("doesn't read step or table numbers as prices", () => {
    const out = parseMenuLines(["Hot Pot", "STEP 2", "Beef Broth 4", "Combo 3"]);
    expect(out.find((i) => i.name === "STEP 2")?.price ?? null).toBeNull();
    expect(out.find((i) => i.name === "Combo 3")?.price ?? null).toBeNull();
    expect(out.find((i) => i.name === "Beef Broth")?.price?.priceAmount).toBe(4);
  });

  it("treats an ALL CAPS name with its price below as an item", () => {
    const out = parseMenuLines(["ROLLS", "CALIFORNIA ROLL", "$8.95", "DRAGON ROLL", "$13.95"]);
    expect(out.map((i) => [i.name, i.category, i.price?.priceAmount])).toEqual([
      ["California Roll", "Rolls", 8.95],
      ["Dragon Roll", "Rolls", 13.95],
    ]);
  });
});

describe("menuTextQuality", () => {
  it("calls a clear priced list read", () => {
    const text = HARBOR_NOODLE_BAR.join("\n");
    expect(menuTextQuality(text, parseMenuLines(HARBOR_NOODLE_BAR))).toBe("read");
  });

  it("calls an unpriced list messy and empty text no_text", () => {
    const lines = ["Appetizer", "Steamed Rice", "Edamame", "Gyoza", "Takoyaki", "Egg roll", "Salad", "Seaweed Salad", "House Salad"];
    expect(menuTextQuality(lines.join("\n") + " plenty of words here to read", parseMenuLines(lines))).toBe("messy");
    expect(menuTextQuality("  ", [])).toBe("no_text");
    expect(menuTextQuality("@#$ %^& *() ++ == ~~ 0x1 9a8b 7c6d", [])).toBe("no_text");
  });
});
