import { afterEach, describe, expect, it } from "vitest";
import type { PageCategory } from "@/types/knowledge";
import { emptyKnowledgeBase, field } from "@/lib/utils/knowledge";
import { isFocusLink } from "./focus";
import { categorize } from "./discover";
import { maxCrawlPages } from "./index";

const SITE = "https://www.harborgroup.example";
const kb = emptyKnowledgeBase(SITE);
const link = (path: string, category?: PageCategory) => {
  const url = `${SITE}${path}`;
  return { url, category: category ?? categorize(url).category };
};

describe("isFocusLink (crawls past 30 pages)", () => {
  it.each(["/menu", "/locations/henderson", "/services", "/pricing", "/about-us", "/contact"])("keeps %s", (path) => {
    expect(isFocusLink(link(path), kb)).toBe(true);
  });

  it("keeps a shallow page with no keyword (a restaurant on a group site)", () => {
    expect(isFocusLink(link("/sakana"), kb)).toBe(true);
    expect(isFocusLink(link("/sakana/gallery/2"), kb)).toBe(false);
  });

  it.each(["/blog/new-patio", "/tag/sushi", "/category/events", "/news/grand-opening", "/careers", "/menu/page/3", "/2024/05/summer-specials", "/menu?utm_source=fb", "/locations?page=2"])(
    "skips %s",
    (path) => {
      expect(isFocusLink(link(path), kb)).toBe(false);
    },
  );

  it("keeps a legal page only while the legal name is unknown", () => {
    expect(isFocusLink(link("/privacy-policy"), kb)).toBe(true);
    const known = emptyKnowledgeBase(SITE);
    known.company.legalName = field("Harbor Group LLC", SITE, "scraped");
    known.company.legalEntityType = field("LLC", SITE, "scraped");
    expect(isFocusLink(link("/privacy-policy"), known)).toBe(false);
  });
});

describe("maxCrawlPages", () => {
  const original = process.env.MAX_CRAWL_PAGES;
  afterEach(() => {
    if (original === undefined) delete process.env.MAX_CRAWL_PAGES;
    else process.env.MAX_CRAWL_PAGES = original;
  });

  it("defaults to 200", () => {
    delete process.env.MAX_CRAWL_PAGES;
    expect(maxCrawlPages()).toBe(200);
    process.env.MAX_CRAWL_PAGES = "lots";
    expect(maxCrawlPages()).toBe(200);
  });

  it("reads the env var, kept within 15 to 500", () => {
    process.env.MAX_CRAWL_PAGES = "50";
    expect(maxCrawlPages()).toBe(50);
    process.env.MAX_CRAWL_PAGES = "3";
    expect(maxCrawlPages()).toBe(15);
    process.env.MAX_CRAWL_PAGES = "9999";
    expect(maxCrawlPages()).toBe(500);
  });
});
