import { describe, expect, it } from "vitest";
import type { Address, Confidence, CrawledPage, KnowledgeBase, MenuSource, Offering } from "@/types/knowledge";
import { emptyKnowledgeBase, field } from "@/lib/utils/knowledge";
import { organizeMenus } from "./organize";
import { listBrands, matchBrand, snapToBrand } from "./brands";
import { fileNameFrom } from "../fetch";

// A fictional restaurant group: brand pages with addresses, one hub page, menus as PDFs.
const SITE = "https://www.harborgroup.example";
const address = (formatted: string): Address => ({ street: null, city: null, region: null, postalCode: null, country: null, formatted });
const page = (path: string, title: string, imageAlts: string[] = []): CrawledPage => ({
  url: `${SITE}${path}`,
  category: "other",
  status: 200,
  title,
  fetchedAt: "",
  durationMs: 0,
  error: null,
  imageAlts,
});
const src = (file: string, over: Partial<MenuSource>): MenuSource => ({
  url: `${SITE}/files/${file}`,
  kind: "pdf",
  foundOn: `${SITE}/`,
  label: "menu",
  group: null,
  status: "read_ai",
  items: 0,
  readAs: "picture",
  ...over,
});
const item = (name: string, group: string | null, file: string, confidence: Confidence = "ai_live", over: Partial<Offering> = {}) =>
  field<Offering>({ name, category: null, description: null, features: [], pricingType: "unknown", priceText: null, priceAmount: null, currency: null, group, sourceKind: "pdf", ...over }, `${SITE}/files/${file}`, confidence);

function group(): KnowledgeBase {
  const kb = emptyKnowledgeBase(SITE);
  kb.company.name.value = "Harbor Group";
  kb.crawl.pages = [
    page("/kelp-hot-pot", "KELP AYCE HOT POT | HARBOR GROUP"),
    page("/neko-supremo", "NEKO SUPREMO | HARBOR GROUP"),
    page("/neko-loco", "NEKO LOCO SUSHI | HARBOR GROUP"),
    page("/neko-hana-omakase", "NEKO HANA OMAKASE | HARBOR GROUP", ["Harbor Group", "Neko Hana"]),
    page("/tide-hotpot", "TIDE HOTPOT AND SUSHI | HARBOR GROUP", ["Tide Hotpot"]),
    page("/ayce-hotpot", "ALL YOU CAN EAT HOTPOT | HARBOR GROUP"),
  ];
  for (const [path, a] of [["/kelp-hot-pot", "1 Kelp Way"], ["/neko-supremo", "2 Cat St #121"], ["/neko-loco", "2 Cat St #119"], ["/neko-hana-omakase", "2 Cat St #123B"], ["/tide-hotpot", "3 Tide Rd"]]) {
    kb.company.otherLocations.push(field(address(a), `${SITE}${path}`, "scraped"));
  }
  return kb;
}

const KELP = ["Angus Brisket", "Beef Belly", "Edamame", "Gyoza", "Takoyaki", "Seaweed Salad", "Pork Belly", "Egg Roll"];

describe("brand names", () => {
  it("never matches part of a name", () => {
    const brands = ["Neko", "Neko Supremo", "Neko Loco Sushi", "Neko Hana", "Sumo Sushi", "Sushi Sumo Decatur"];
    expect(matchBrand("Neko", brands)).toBe("Neko");
    expect(matchBrand("Neko Loco", brands)).toBeNull();
    expect(matchBrand("Sumo", brands)).toBeNull();
    expect(matchBrand("sumo SUSHI", brands)).toBe("Sumo Sushi");
    expect(matchBrand("nekosupremo", brands)).toBe("Neko Supremo");
  });

  it("snaps a title to a brand only when the rest is format words", () => {
    const brands = ["Neko Hana", "Tide Hotpot", "Omakase Sumo"];
    expect(snapToBrand("Neko Hana Omakase", brands)).toBe("Neko Hana");
    expect(snapToBrand("Tide Hotpot And Sushi", brands)).toBe("Tide Hotpot And Sushi");
    expect(snapToBrand("Neko Supremo", brands)).toBe("Neko Supremo");
  });

  it("reads the file's own name from Content-Disposition or Wix's dn=", () => {
    expect(fileNameFrom(`inline; filename="kelpmenu (2).pdf"; filename*=UTF-8''kelpmenu%20%282%29.pdf`, `${SITE}/a.pdf`)).toBe("kelpmenu (2).pdf");
    expect(fileNameFrom(`attachment; filename="Kelp Menu.pdf"`, `${SITE}/a.pdf`)).toBe("Kelp Menu.pdf");
    expect(fileNameFrom(null, `${SITE}/a.pdf?dn=Captain+6+-+Menu.pdf`)).toBe("Captain 6 - Menu.pdf");
    expect(fileNameFrom(null, `${SITE}/a.pdf`)).toBeNull();
  });

  it("lists every brand, with its address, and none for a single-brand site", () => {
    const names = listBrands(group()).map((b) => [b.name, b.location]);
    expect(names).toEqual([
      ["Kelp", "1 Kelp Way"],
      ["Neko Supremo", "2 Cat St #121"],
      ["Neko Loco Sushi", "2 Cat St #119"],
      ["Neko Hana", "2 Cat St #123B"],
      ["Tide Hotpot And Sushi", "3 Tide Rd"],
    ]);
    expect(listBrands(emptyKnowledgeBase(SITE))).toEqual([]);
  });
});

describe("organizeMenus", () => {
  it("names a hub PDF from its file name when it equals one brand's full name", () => {
    const kb = group();
    kb.crawl.menuSources = [src("kelp.pdf", { group: "Kelp Ayce Hot Pot", foundOn: `${SITE}/kelp-hot-pot` }), src("hub.pdf", { fileName: "kelpmenu (2).pdf", foundOn: `${SITE}/ayce-hotpot`, status: "no_text" })];
    const out = organizeMenus(kb);
    expect(out.crawl.menuSources?.map((s) => s.group)).toEqual(["Kelp", "Kelp"]);
  });

  it("uses overlap when the name doesn't say, and never leaves a menu unnamed", () => {
    const kb = group();
    kb.crawl.menuSources = [src("kelp.pdf", { group: "Kelp", foundOn: `${SITE}/kelp-hot-pot` }), src("hub.pdf", { foundOn: `${SITE}/ayce-hotpot` }), src("lone.pdf", { foundOn: `${SITE}/ayce-hotpot` })];
    kb.offerings.push(...KELP.map((n) => item(n, "Kelp", "kelp.pdf")));
    kb.offerings.push(...KELP.slice(0, 6).map((n) => item(n, null, "hub.pdf")), item("Lychee Soda", null, "hub.pdf"));
    kb.offerings.push(item("Mystery Roll", null, "lone.pdf"));
    const out = organizeMenus(kb);
    const g = (file: string) => out.crawl.menuSources!.find((s) => s.url.endsWith(file))!.group;
    expect(g("hub.pdf")).toBe("Kelp");
    expect(g("lone.pdf")).toBe("All You Can Eat Hotpot Menu (PDF)");
    expect(out.offerings.every((f) => f.value?.group)).toBe(true);
  });

  it("skips a text copy of a menu read from its picture, keeping items only in the copy", () => {
    const kb = group();
    kb.crawl.menuSources = [
      src("kelp.pdf", { group: "Kelp", foundOn: `${SITE}/kelp-hot-pot` }),
      src("hub.pdf", { fileName: "kelpmenu.pdf", foundOn: `${SITE}/ayce-hotpot`, readAs: "text" }),
    ];
    kb.offerings.push(...KELP.map((n) => item(n, "Kelp", "kelp.pdf")));
    kb.offerings.push(...KELP.map((n) => item(n, null, "hub.pdf", "scraped")), item("Premium Ribeye", null, "hub.pdf", "scraped"));
    const out = organizeMenus(kb);
    const kelp = out.offerings.filter((f) => f.value?.group === "Kelp");
    expect(kelp).toHaveLength(KELP.length + 1);
    expect(kelp.find((f) => f.value?.name === "Premium Ribeye")?.confidence).toBe("scraped");
    const hub = out.crawl.menuSources!.find((s) => s.url.endsWith("hub.pdf"))!;
    expect(hub.status).toBe("duplicate");
    expect(hub.note).toMatch(/Same menu as Kelp \(8 of 9 items\).*Premium Ribeye/);
    // The kept picture item cites the copy too
    expect(kelp.find((f) => f.value?.name === "Gyoza")?.evidence).toContain(`menu PDF text: ${SITE}/files/hub.pdf`);
  });

  it("keeps one item per brand and name, preferring price and description, citing both menus", () => {
    const kb = group();
    kb.crawl.menuSources = [src("a.pdf", { group: "Kelp", foundOn: `${SITE}/kelp-hot-pot` }), src("b.pdf", { group: "Kelp", foundOn: `${SITE}/kelp-hot-pot` })];
    kb.offerings.push(item("GYOZA", "Kelp", "a.pdf"));
    kb.offerings.push(item("Gyoza*", "Kelp", "b.pdf", "ai_live", { priceText: "$6.50", priceAmount: 6.5, description: "Pan-fried" }));
    kb.offerings.push(item("Gyoza", "Neko Supremo", "c.pdf")); // another restaurant's gyoza stays
    const out = organizeMenus(kb);
    const kelp = out.offerings.filter((f) => f.value?.group === "Kelp");
    expect(kelp).toHaveLength(1);
    expect(kelp[0].value?.priceAmount).toBe(6.5);
    expect(kelp[0].evidence).toEqual([`menu PDF: ${SITE}/files/a.pdf`, `menu PDF: ${SITE}/files/b.pdf`]);
    expect(out.offerings.filter((f) => f.value?.group === "Neko Supremo")).toHaveLength(1);
  });

  it("never removes the owner's edits", () => {
    const kb = group();
    kb.crawl.menuSources = [src("a.pdf", { group: "Kelp", foundOn: `${SITE}/kelp-hot-pot` })];
    kb.offerings.push(item("Gyoza", "Kelp", "a.pdf", "ai_live", { priceText: "$7", priceAmount: 7 }), item("Gyoza", "Kelp", "user", "user_edited"));
    const out = organizeMenus(kb);
    expect(out.offerings).toHaveLength(1);
    expect(out.offerings[0].confidence).toBe("user_edited");
  });

  it("names a brand by its own logo, and is safe to run twice", () => {
    const kb = group();
    kb.crawl.menuSources = [src("hana.pdf", { group: "Neko Hana Omakase", foundOn: `${SITE}/neko-hana-omakase` })];
    kb.offerings.push(item("Omakase AYCE", "Neko Hana Omakase", "hana.pdf", "ai_live", { priceText: "$58.95", priceAmount: 58.95 }));
    const once = organizeMenus(kb);
    expect(once.offerings[0].value?.group).toBe("Neko Hana");
    expect(once.offerings[0].value?.location).toBe("2 Cat St #123B");
    expect(organizeMenus(once)).toEqual(once);
  });

  it("leaves a site without menus untouched", () => {
    const kb = emptyKnowledgeBase(SITE);
    kb.offerings.push(item("Duct Cleaning", null, "page"));
    expect(organizeMenus(kb)).toBe(kb);
  });
});
