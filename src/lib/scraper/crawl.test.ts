import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyKnowledgeBase } from "@/lib/utils/knowledge";
import { ScrapeError } from "./errors";

/*
  Crawl ranking on a fictional bakery. fetchPage serves pages from `site` (anything else is a
  404), so robots.txt and sitemaps are simply missing unless a test adds them.
*/
const SITE = "https://www.harborbakery.example";
let site: Record<string, string> = {};

vi.mock("./fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./fetch")>()),
  fetchPage: async (url: string) => {
    const path = new URL(url).pathname;
    const body = site[path];
    if (body === undefined) throw new ScrapeError("HTTP_ERROR", "Not found", 404);
    const contentType = path.endsWith(".xml") ? "application/xml" : "text/html";
    return { url, status: 200, contentType, body, durationMs: 1 };
  },
}));

const { scrapeSite } = await import("./index");
const { classifyContent, categorize } = await import("./discover");
const { emptyLearning, rankScore, recordYield, STALE_AFTER } = await import("./crawl");
type CrawlSession = import("./crawl").CrawlSession;

const page = (title: string, body: string) => `<html><head><title>${title} | Harbor Bakery</title></head><body>${body}</body></html>`;
const home = (nav: string[], body = "", footer: string[] = []) =>
  `<html><head><title>Harbor Bakery</title></head><body>
    <nav>${nav.map((p) => `<a href="${p}">${p.slice(1)}</a>`).join("")}</nav>
    <main><h1>Harbor Bakery</h1><p>Fresh bread and cakes every morning in a small harbor town by the sea.</p>${body}</main>
    <footer>${footer.map((p) => `<a href="${p}">${p.slice(1)}</a>`).join("")}</footer>
  </body></html>`;
const paths = (urls: { url: string }[]) => urls.map((p) => new URL(p.url).pathname);
const run = (concurrency = 2) => scrapeSite(SITE, { delayMs: 0, concurrency });

beforeEach(() => {
  site = {};
});

describe("classifyContent", () => {
  it("reads the kind of page from its headings", () => {
    expect(classifyContent("Our Journey", ["Founded in 1998 by the Ortiz family", "Our mission"])).toBe("about");
    expect(classifyContent(null, ["Frequently asked questions", "Ordering", "Delivery"])).toBe("faq");
    expect(classifyContent("Kind words", ["What our customers say", "Reviews from the neighborhood"])).toBe("testimonials");
  });

  it("returns null for weak or mixed headings", () => {
    expect(classifyContent("Gallery", ["Summer 2024", "Cakes"])).toBeNull();
    expect(classifyContent(null, ["Some photos", "Our mission"])).toBeNull(); // one h2 match is not enough
    expect(classifyContent(null, ["Welcome", "Our team", "Meet the bakers", "Frequently asked questions", "FAQ"])).toBeNull(); // a tie
  });
});

describe("crawl ranking", () => {
  it("reads a nav link with an unusual name and classifies it by its headings", async () => {
    site = {
      "/": home(["/our-journey", "/cakes"]),
      "/our-journey": page(
        "Our Journey",
        `<h1>Our Journey</h1><h2>Founded in 1998 by the Ortiz family</h2><h2>Our mission</h2>
         <p>Harbor Bakery was founded in 1998 by the Ortiz family, who baked their first loaves in a tiny kitchen by the docks.</p>`,
      ),
      "/cakes": page("Cakes", "<h1>Cakes</h1><p>Birthday and wedding cakes made to order.</p>"),
    };
    const kb = await run();
    const journey = kb.crawl.pages.find((p) => p.url.endsWith("/our-journey"));
    expect(journey?.category).toBe("about");
    expect(kb.company.yearFounded.value).toBe(1998);
    expect(kb.company.yearFounded.source).toBe(`${SITE}/our-journey`);
  });

  it("puts nav and footer links ahead of deep blog posts", async () => {
    // Two levels deep with no keyword: the old ranking never read these
    const nav = ["/visit", "/cakes", "/bakery/sourdough", "/bakery/rye"];
    const footer = ["/gallery", "/hello"];
    const posts = Array.from({ length: 20 }, (_, i) => `/blog/post-${i + 1}`);
    site = {
      "/": home(nav, posts.map((p) => `<a href="${p}">Read ${p}</a>`).join(""), footer),
      "/sitemap.xml": `<?xml version="1.0"?><urlset>${posts.map((p) => `<url><loc>${SITE}${p}</loc></url>`).join("")}</urlset>`,
    };
    for (const p of [...nav, ...footer]) site[p] = page(p.slice(1), `<h1>${p.slice(1)}</h1><p>Something about ${p.slice(1)}.</p>`);
    for (const p of posts) site[p] = page(p, `<h1>${p}</h1><p>A post.</p>`);

    const crawled = paths(await run().then((kb) => kb.crawl.pages));
    for (const p of [...nav, ...footer]) expect(crawled).toContain(p);
    const firstPost = crawled.findIndex((p) => p.startsWith("/blog/"));
    const lastMenu = Math.max(...[...nav, ...footer].map((p) => crawled.indexOf(p)));
    if (firstPost >= 0) expect(firstPost).toBeGreaterThan(lastMenu);
  });

  it(`moves a category back after ${STALE_AFTER} zero-yield pages in a row`, () => {
    const kb = emptyKnowledgeBase(SITE);
    const session = { kb, learned: emptyLearning() } as unknown as CrawlSession;
    const link = (path: string) => ({ url: `${SITE}${path}`, ...categorize(`${SITE}${path}`), from: "nav" as const });
    const services = link("/services/cupcakes");
    const locations = link("/locations");
    expect(rankScore(services, session)).toBeGreaterThan(rankScore(locations, session));

    for (let i = 1; i <= STALE_AFTER; i++) recordYield(session.learned, `${SITE}/services/item-${i}`, "services", 0);
    expect(session.learned.stale.has("services")).toBe(true);
    expect(rankScore(services, session)).toBeLessThan(rankScore(locations, session));

    // One useful page makes the category normal again
    recordYield(session.learned, `${SITE}/services/catering`, "services", 5);
    expect(session.learned.stale.has("services")).toBe(false);
  });

  it("reads other pages before more of a zero-yield category", async () => {
    const items = Array.from({ length: 8 }, (_, i) => `/services/plan-${i + 1}`);
    site = {
      "/": home(["/services"]),
      "/services": page("Services", `<h1>Services</h1>${items.map((p) => `<a href="${p}">Plan</a>`).join("")}<a href="/hello">Say hi</a>`),
      "/hello": page("Hello", "<h1>Hello</h1><p>Write to us at hello@harborbakery.example or call (702) 555-0142.</p>"),
    };
    for (const p of items) site[p] = page("Coming soon", "<h1>Coming soon</h1>");

    const kb = await run(1);
    const crawled = paths(kb.crawl.pages);
    const servicePages = crawled.filter((p) => p.startsWith("/services/"));
    expect(kb.crawl.pages.filter((p) => p.url.includes("/services/plan-")).slice(0, STALE_AFTER).every((p) => p.newFacts === 0)).toBe(true);
    expect(crawled).toContain("/hello");
    // Without yield ranking /hello (no keyword) would wait behind all 8 plans
    expect(crawled.indexOf("/hello")).toBeLessThan(crawled.indexOf(servicePages[4] ?? "/missing") >>> 0);
  });

  it("reads one page of each kind before the navigation menu", async () => {
    const services = Array.from({ length: 20 }, (_, i) => `/services/cake-${i + 1}`);
    site = {
      "/": home(services, `<a href="/contact">Contact</a>`),
      "/contact": page("Contact", "<h1>Contact</h1><p>Call (702) 555-0142.</p>"),
    };
    for (const p of services) site[p] = page("Cake", `<h1>Cake</h1><p>A cake called ${p}.</p>`);

    const crawled = paths((await run()).crawl.pages);
    // home, the best services page, then contact: before the other 19 menu links
    expect(crawled.indexOf("/contact")).toBeGreaterThan(0);
    expect(crawled.indexOf("/contact")).toBeLessThanOrEqual(2);
  });

  it("ranks a large navigation menu by keywords instead of reading it first", async () => {
    const menu = Array.from({ length: 30 }, (_, i) => `/bakery/item-${i + 1}`);
    site = { "/": home(menu) };
    for (const p of menu) site[p] = page("Item", `<h1>Item</h1><p>Item ${p}.</p>`);

    const kb = await run();
    expect(kb.crawl.log.some((l) => l.message.startsWith("Large navigation menu (30 links)"))).toBe(true);
    // Two levels deep with no keyword: only nav-first would have read them
    expect(paths(kb.crawl.pages).filter((p) => p.startsWith("/bakery/"))).toEqual([]);
  });

  it("stays on the start location's pages", async () => {
    site = {
      "/location/harbor-town": home(["/location/harbor-town/catering", "/location/bay-city/cakes", "/locations"]),
      "/location/harbor-town/catering": page("Catering", "<h1>Catering</h1><p>Party trays in Harbor Town.</p>"),
      "/location/bay-city/cakes": page("Bay City cakes", "<h1>Cakes</h1><p>Call our Bay City shop at (415) 555-0199.</p>"),
      "/locations": page("Locations", "<h1>Our locations</h1><p>Harbor Town and Bay City.</p>"),
    };
    const kb = await scrapeSite(`${SITE}/location/harbor-town`, { delayMs: 0 });
    const crawled = paths(kb.crawl.pages);
    expect(crawled).toContain("/location/harbor-town/catering");
    expect(crawled).toContain("/locations");
    expect(crawled).not.toContain("/location/bay-city/cakes");
    expect(kb.crawl.pendingUrls.some((u) => u.includes("/bay-city/"))).toBe(false);
    expect(kb.contact.phones.map((p) => p.value)).not.toContain("(415) 555-0199");
  });
});
