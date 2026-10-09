/**
 * The "Read menus with AI" runner with OpenAI, the database and downloads mocked:
 * no network, no quota used. Checks caching, the quota, evidence and the "run again" note.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuSource } from "@/types/knowledge";
import { emptyKnowledgeBase, field } from "@/lib/utils/knowledge";

const cache = new Map<string, unknown>();
const state = { quota: true, calls: 0 };

vi.mock("@/lib/db/ai", () => ({
  getCachedEnrichment: async (k: string) => cache.get(k) ?? null,
  putCachedEnrichment: async (k: string, v: unknown) => void cache.set(k, v),
  takeAiQuota: async () => state.quota,
  aiQuotaRemaining: async () => 5,
}));
vi.mock("./openai", () => ({
  callOpenAi: async () => {
    state.calls++;
    return {
      data: { isMenu: true, unreadable: null, items: [{ name: "Dragon Roll", description: null, price: "$14.50", section: "Rolls" }, { name: "Miso Soup", description: null, price: null, section: "Soups" }] },
      usage: { input: 2500, output: 300 },
    };
  },
}));
// A picture PDF: downloads fine, has no text
vi.mock("@/lib/scraper/fetch", () => ({
  fetchBinary: async (url: string) => ({ url, contentType: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.7 fake"), version: null }),
}));
vi.mock("@/lib/scraper/menus/pdf", () => ({
  isPdf: () => true,
  readPdfText: async () => ({ pages: 2, text: ["", ""] }),
}));

const { readMenusWithAi } = await import("./read-menus");

const SITE = "https://www.harborgroup.example";
const pdf = (name: string): MenuSource => ({ url: `${SITE}/files/${name}.pdf`, kind: "pdf", foundOn: `${SITE}/${name}`, label: "menu", group: name, status: "no_text", items: 0, pages: 2, bytes: 1000 });

function kbWith(names: string[]) {
  const kb = emptyKnowledgeBase(SITE);
  kb.crawl.menuSources = names.map(pdf);
  return kb;
}

describe("readMenusWithAi", () => {
  beforeEach(() => {
    cache.clear();
    state.quota = true;
    state.calls = 0;
  });

  it("reads up to 8 pages, adds ai_live items with the file as evidence, and says what's left", async () => {
    const kb = kbWith(["sakana", "umami", "kogi", "hwaro", "nabe"]); // 5 PDFs x 2 pages = 10 units
    kb.company.otherLocations.push(field({ street: null, city: null, region: null, postalCode: null, country: null, formatted: "1 Example Way" }, `${SITE}/sakana`, "scraped"));
    const r = await readMenusWithAi(kb);
    expect(state.calls).toBe(4);
    expect(r.read).toBe(4);
    expect(r.remaining).toBe(1);
    expect(r.offerings).toHaveLength(8);
    const roll = r.offerings.find((f) => f.value?.group === "sakana" && f.value.name === "Dragon Roll")!;
    expect(roll.confidence).toBe("ai_live");
    expect(roll.evidence?.[0]).toBe(`menu PDF: ${SITE}/files/sakana.pdf`);
    expect(roll.value).toMatchObject({ priceAmount: 14.5, category: "Rolls", categoryConfidence: "ai_live", location: "1 Example Way", sourceKind: "pdf" });
    expect(r.offerings.find((f) => f.value?.name === "Miso Soup")?.value?.priceAmount).toBeNull();
    expect(r.sources.every((s) => s.status === "read_ai" && s.items === 2)).toBe(true);
    expect(r.notes.join(" ")).toMatch(/1 more menu found\. Run again/);
  });

  it("serves a second run from the cache without new calls or quota", async () => {
    const kb = kbWith(["sakana"]);
    await readMenusWithAi(kb);
    state.quota = false; // no quota left: cached menus still come back
    state.calls = 0;
    const again = await readMenusWithAi(kb);
    expect(state.calls).toBe(0);
    expect(again.cachedCount).toBe(1);
    expect(again.offerings).toHaveLength(2);
  });

  it("reads nothing new when the daily quota is used up", async () => {
    state.quota = false;
    const r = await readMenusWithAi(kbWith(["sakana"]));
    expect(state.calls).toBe(0);
    expect(r.mode).toBe("unavailable");
    expect(r.offerings).toHaveLength(0);
    expect(r.notes[0]).toMatch(/limit/);
  });

  it("doesn't add items the owner removed", async () => {
    const kb = kbWith(["sakana"]);
    kb.dismissed.push({ path: "offerings", key: "sakana|dragon roll", at: "2026-10-09T00:00:00Z" });
    const r = await readMenusWithAi(kb);
    expect(r.offerings.map((f) => f.value?.name)).toEqual(["Miso Soup"]);
  });

  it("cachedOnly brings back menus already read, with no call and no quota", async () => {
    const kb = kbWith(["sakana", "umami"]);
    await readMenusWithAi(kbWith(["sakana"]));
    state.calls = 0;
    state.quota = false;
    const r = await readMenusWithAi(kb, { cachedOnly: true });
    expect(state.calls).toBe(0);
    expect(r.read).toBe(1);
    expect(r.offerings.every((f) => f.value?.group === "sakana")).toBe(true);
  });

  it("re-reads only the chosen menu, ignoring older answers when fresh", async () => {
    const kb = kbWith(["sakana", "umami"]);
    await readMenusWithAi(kb);
    state.calls = 0;
    const done = { ...kb, crawl: { ...kb.crawl, menuSources: kb.crawl.menuSources!.map((s) => ({ ...s, status: "read_ai" as const, readAs: "picture" as const })) } };
    const r = await readMenusWithAi(done, { only: [`${SITE}/files/umami.pdf`], fresh: true });
    // Same prompt version is still cached; "fresh" only skips answers from older versions
    expect(state.calls).toBe(0);
    expect(r.read).toBe(1);
    expect(r.replaces).toEqual([`${SITE}/files/umami.pdf`]);
  });

  it("names a menu that couldn't be read again, and replaces nothing", async () => {
    const kb = kbWith(["sakana"]);
    const done = { ...kb, crawl: { ...kb.crawl, menuSources: kb.crawl.menuSources!.map((s) => ({ ...s, status: "read_ai" as const, readAs: "picture" as const })) } };
    state.quota = false;
    const r = await readMenusWithAi(done, { only: [`${SITE}/files/sakana.pdf`], fresh: true });
    expect(state.calls).toBe(0);
    expect(r.mode).toBe("unavailable");
    expect(r.replaces).toEqual([]);
    expect(r.notes).toContain("sakana wasn't read again: today's live AI limit is used up. Its current items are unchanged.");
  });
});

