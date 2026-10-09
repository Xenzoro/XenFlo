/**
 * Address detection. Every address here is fictional ("Example Avenue", "Springfield",
 * ZIP 89000); the HTML shapes copy real sites we tested.
 */
import { describe, expect, it } from "vitest";
import type { KnowledgeBase, PageCategory } from "@/types/knowledge";
import { emptyKnowledgeBase } from "@/lib/utils/knowledge";
import { extractPage } from "./extract";
import { addressFromMapsUrl, findAddresses } from "./address";

const page = (body: string) => `<!doctype html><html><head><title>Example Cafe</title></head><body>${body}</body></html>`;

function scrape(body: string, opts: { url?: string; startUrl?: string; category?: PageCategory; kb?: KnowledgeBase } = {}) {
  const startUrl = opts.startUrl ?? "https://example.com/";
  const kb = opts.kb ?? emptyKnowledgeBase(startUrl);
  kb.url = startUrl;
  extractPage(page(body), opts.url ?? startUrl, opts.category ?? "home", kb);
  return kb;
}

describe("findAddresses", () => {
  it.each([
    ["one line", ["123 Example Avenue, Springfield, NV 89000"], "123 Example Avenue"],
    ["no comma before state", ["123 Example Avenue, Springfield NV 89000"], "123 Example Avenue"],
    ["#unit without comma", ["123 Example Ave #105, Springfield, NV 89000"], "123 Example Ave #105"],
    ["Ste", ["123 Example Ave, Ste 100, Springfield, NV 89000"], "123 Example Ave Ste 100"],
    ["Ste.", ["123 Example Ave Ste. 100, Springfield, NV 89000"], "123 Example Ave Ste. 100"],
    ["Suite", ["123 Example Ave, Suite 100, Springfield, NV 89000"], "123 Example Ave Suite 100"],
    ["Unit", ["123 Example Ave Unit 4B, Springfield, NV 89000"], "123 Example Ave Unit 4B"],
    ["split over two lines, no commas", ["123 Example Ave #105", "Springfield NV 89000"], "123 Example Ave #105"],
    ["trailing comma at the break", ["123 Example Ave., Suite 1,", "Springfield, NV 89000"], "123 Example Ave. Suite 1"],
  ])("%s", (_, lines, street) => {
    const [a] = findAddresses(lines);
    expect(a).toMatchObject({ street, city: "Springfield", region: "NV", postalCode: "89000" });
  });

  it("treats suite spellings as the same place but different suites as different places", () => {
    const found = findAddresses([
      "123 Example Ave, Suite 1, Springfield, NV 89000",
      "123 Example Avenue Ste 1, Springfield NV 89000",
      "123 Example Ave #2, Springfield, NV 89000",
    ]);
    expect(found.map((a) => a.street)).toEqual(["123 Example Ave Suite 1", "123 Example Ave #2"]);
  });

  it("ignores text without a state and ZIP", () => {
    expect(findAddresses(["Open 7 days a week", "Call (702) 555-0100", "123 Example Avenue"])).toEqual([]);
  });

  it("doesn't glue opening hours onto the street", () => {
    const [a] = findAddresses(["LAST CALL: 11:30 PM", "456 Sample Blvd #12, Springfield, NV 89000"]);
    expect(a.street).toBe("456 Sample Blvd #12");
  });
});

describe("addressFromMapsUrl", () => {
  it("reads a Google Maps embed q=", () => {
    expect(addressFromMapsUrl("https://www.google.com/maps?q=123+Example+Avenue,+Springfield,+NV+89000&output=embed")?.street).toBe("123 Example Avenue");
  });
  it("reads an Apple Maps address=", () => {
    expect(addressFromMapsUrl("https://maps.apple.com/?address=123%20Example%20Avenue,%20Springfield,%20NV%20%2089000,%20United%20States&q=Example%20Cafe")?.postalCode).toBe("89000");
  });
  it("reads a /maps/place/ path", () => {
    expect(addressFromMapsUrl("https://www.google.com/maps/place/123+Example+Avenue,+Springfield,+NV+89000/@36.1,-115.1,17z")?.city).toBe("Springfield");
  });
  it("never turns a place name into an address", () => {
    expect(addressFromMapsUrl("https://www.google.com/maps?q=Example+Cafe&output=embed")).toBeNull();
    expect(addressFromMapsUrl("https://example.com/?q=123+Example+Avenue,+Springfield,+NV+89000")).toBeNull();
  });
});

describe("extractPage addresses", () => {
  it("finds a one-line address inside a maps link (Anime Boba shape)", () => {
    const kb = scrape(
      `<div><p class="has-text-align-center"><a href="https://maps.apple.com/?address=123%20Example%20Avenue,%20Springfield,%20NV%20%2089000">Example Cafe, 123 Example Avenue, Springfield, NV 89000</a></p></div>`,
    );
    expect(kb.company.mainAddress).toMatchObject({ confidence: "scraped", source: "https://example.com/" });
    expect(kb.company.mainAddress.value?.formatted).toBe("123 Example Avenue, Springfield, NV 89000");
    expect(kb.company.otherLocations).toHaveLength(0);
  });

  it("finds an address split by <br> with no commas", () => {
    const kb = scrape(`<footer><p>Visit us<br>123 Example Ave #105<br>Springfield NV 89000</p></footer>`);
    expect(kb.company.mainAddress.value?.street).toBe("123 Example Ave #105");
  });

  it("falls back to a Google Maps embed, marked inferred", () => {
    const kb = scrape(`<p>Come say hi!</p><iframe src="https://www.google.com/maps?q=123+Example+Avenue,+Springfield,+NV+89000&output=embed"></iframe>`);
    expect(kb.company.mainAddress).toMatchObject({ confidence: "inferred" });
    expect(kb.company.mainAddress.value?.city).toBe("Springfield");
  });

  it("keeps a place-name-only map out of the knowledge base", () => {
    const kb = scrape(`<p>Find us on the map.</p><a href="https://www.google.com/maps?q=Example+Cafe">Map</a>`);
    expect(kb.company.mainAddress.value).toBeNull();
  });

  it("files a restaurant page's address as another location (Dragon Factory shape)", () => {
    const kb = scrape(
      `<h1><span><span>Monday - Sunday<br>11:00 AM - 12:00 AM<br>LAST CALL: 11:30 PM<br><span>456 Sample Blvd #12, Springfield, NV 89000</span></span></span></h1>`,
      { url: "https://example.com/sample-sushi", category: "other" },
    );
    expect(kb.company.mainAddress.value).toBeNull();
    expect(kb.company.otherLocations.map((f) => f.value?.street)).toEqual(["456 Sample Blvd #12"]);
  });

  it("treats 3+ addresses on one page as a branch directory: no main, all locations", () => {
    const kb = scrape(
      `<ul><li>100 First St, Springfield, NV 89000</li><li>200 Second St, Shelbyville, NV 89001</li><li>300 Third St, Capital City, NV 89002</li></ul>`,
    );
    expect(kb.company.mainAddress.value).toBeNull();
    expect(kb.company.otherLocations).toHaveLength(3);
  });

  it("on a location page, picks that city's branch as main", () => {
    const kb = scrape(
      `<p>200 Second St<br>Shelbyville, NV 89001</p><p>100 First St, Suite 1,<br>Springfield, NV 89000</p><p>300 Third St, Capital City, NV 89002</p>`,
      { startUrl: "https://example.com/location/springfield" },
    );
    expect(kb.company.mainAddress.value?.street).toBe("100 First St Suite 1");
    expect(kb.company.otherLocations.map((f) => f.value?.city).sort()).toEqual(["Capital City", "Shelbyville"]);
  });

  it("finds nothing on a page without an address", () => {
    const kb = scrape(`<p>Call us at (702) 555-0100. Open 7 days.</p>`);
    expect(kb.company.mainAddress.value).toBeNull();
    expect(kb.company.otherLocations).toHaveLength(0);
  });
});
