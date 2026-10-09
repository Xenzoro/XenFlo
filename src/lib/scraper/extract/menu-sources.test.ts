import { describe, expect, it } from "vitest";
import { emptyKnowledgeBase } from "@/lib/utils/knowledge";
import { extractPage } from "./index";
import { categorize } from "../discover";
import { groupFromFileName } from "./menu-sources";

// Fictional restaurant group, two brands and a hub page.
const SITE = "https://www.harborgroup.example";

const brandPage = (title: string, pdf: string) => `<html><head><title>${title} | Harbor Group</title></head><body>
  <h1>${title}</h1>
  <p>123 Example St, Springfield, NV 89000</p>
  <a href="${pdf}">menu</a>
  <a href="/files/terms.pdf">Terms</a>
  <a href="https://www.clover.com/online-ordering/harbor-noodle">ORDER ONLINE</a>
  <a href="https://www.doordash.com/store/harbor-noodle">Delivery</a>
</body></html>`;

const HTML_MENU = `<html><head><title>Menu | Harbor Noodle Bar</title></head><body>
  <nav><a href="/">Home</a><a href="/menu">Menu</a></nav>
  <h2>Noodles</h2>
  <ul>
    <li><span>Tonkotsu Ramen</span> <span>$14.99</span></li>
    <li><span>Spicy Miso Ramen</span> <span>$15.50</span></li>
  </ul>
  <h2>Drinks</h2>
  <table>
    <tr><td>Thai Iced Tea</td><td>$4.50</td></tr>
    <tr><td>House Lemonade</td><td>$3.95</td></tr>
  </table>
  <img src="/images/menu-board.jpg" width="1200" height="900" alt="Our menu board">
  <img src="/images/logo.png" width="800" height="800" alt="logo">
</body></html>`;

describe("menu discovery", () => {
  it("ranks menu pages above services and pricing", () => {
    expect(categorize(`${SITE}/menu`).category).toBe("menu");
    expect(categorize(`${SITE}/drinks`).category).toBe("menu");
    expect(categorize(`${SITE}/menu`).score).toBeGreaterThan(categorize(`${SITE}/services`).score);
    // "/terms-of-service" is still legal, not a menu or service
    expect(categorize(`${SITE}/terms-of-service`).category).toBe("legal");
  });

  it("records menu PDFs (not other PDFs) with the brand the page is about", () => {
    const kb = emptyKnowledgeBase(SITE);
    kb.company.name.value = "Harbor Group";
    extractPage(brandPage("HARBOR NOODLE BAR", "/files/harbor-noodle-menu.pdf"), `${SITE}/harbor-noodle`, "other", kb);
    const sources = kb.crawl.menuSources ?? [];
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ kind: "pdf", group: "Harbor Noodle Bar", status: "found", foundOn: `${SITE}/harbor-noodle` });
  });

  it("records third-party ordering links as channels with the platform name", () => {
    const kb = emptyKnowledgeBase(SITE);
    extractPage(brandPage("HARBOR NOODLE BAR", "/m.pdf"), `${SITE}/harbor-noodle`, "other", kb);
    const channels = kb.customers.channels.map((c) => [c.value, c.confidence, c.source]);
    expect(channels).toContainEqual(["Online ordering (Clover)", "scraped", "https://www.clover.com/online-ordering/harbor-noodle"]);
    expect(channels).toContainEqual(["Delivery (DoorDash)", "scraped", "https://www.doordash.com/store/harbor-noodle"]);
  });

  it("keeps the brand page when a hub links the same PDF", () => {
    const kb = emptyKnowledgeBase(SITE);
    kb.company.name.value = "Harbor Group";
    const hub = `<html><head><title>ALL YOU CAN EAT SUSHI | Harbor Group</title></head><body><a href="/files/sakana.pdf">menu</a></body></html>`;
    extractPage(hub, `${SITE}/ayce-sushi`, "other", kb);
    expect(kb.crawl.menuSources?.[0].group).toBeNull();
    extractPage(brandPage("SAKANA", "/files/sakana.pdf"), `${SITE}/sakana`, "other", kb);
    expect(kb.crawl.menuSources).toHaveLength(1);
    expect(kb.crawl.menuSources?.[0]).toMatchObject({ group: "Sakana", foundOn: `${SITE}/sakana` });
  });

  it("names a hub PDF from Wix's download name", () => {
    expect(groupFromFileName("Captain 6 - Menu - 2026.pdf")).toBe("Captain 6");
    expect(groupFromFileName("menu.pdf")).toBeNull();
  });
});

describe("HTML menu pages", () => {
  const kb = emptyKnowledgeBase(SITE);
  extractPage(HTML_MENU, `${SITE}/menu`, "menu", kb);
  const offerings = kb.offerings.map((f) => f.value!);

  it("reads list and table menus with their sections and prices", () => {
    expect(offerings.map((o) => [o.name, o.category, o.priceAmount])).toEqual([
      ["Tonkotsu Ramen", "Noodles", 14.99],
      ["Spicy Miso Ramen", "Noodles", 15.5],
      ["Thai Iced Tea", "Drinks", 4.5],
      ["House Lemonade", "Drinks", 3.95],
    ]);
    expect(kb.offerings.every((f) => f.confidence === "scraped" && f.source === `${SITE}/menu`)).toBe(true);
    expect(offerings[0].sourceKind).toBe("page");
  });

  it("doesn't take section headings as items", () => {
    expect(offerings.some((o) => /^(noodles|drinks)$/i.test(o.name))).toBe(false);
  });

  it("records big menu images but not logos", () => {
    const images = (kb.crawl.menuSources ?? []).filter((s) => s.kind === "image");
    expect(images.map((i) => i.url)).toEqual([`${SITE}/images/menu-board.jpg`]);
    expect(images[0].area).toBe(1200 * 900);
  });
});
