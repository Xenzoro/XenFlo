import type { Address, Confidence } from "@/types/knowledge";
import type { PageContext } from "./types";
import { addItem, setField } from "../merge";
import { addressFromMapsUrl, addressKey, findAddresses } from "../address";
import { locationCity } from "./contact";

/*
  Addresses from the visible text, or from a maps link/embed when the text has none.
  Main address vs other locations:
  - Location page (/location/las-vegas): the address in that city is main; the rest are other locations.
  - A page listing 3+ addresses is a branch directory: all become other locations, none is main.
  - Pages that speak for the whole business (start page, home, about, contact, locations)
    with 1-2 addresses: the first is main.
  - Any other page (a sub-brand or one restaurant of a group): other location, never main.
    A group whose site names no head office keeps main Missing rather than picking one at random.
*/

const MAX_LOCATIONS = 25;
const BUSINESS_PAGES = new Set(["home", "about", "contact", "locations"]);

export function extractAddresses(ctx: PageContext): void {
  const text = findAddresses(ctx.lines);
  if (text.length) return place(ctx, text, "scraped");

  // Fallback: an address written into a Google/Apple Maps link or embed. Inferred, since
  // it comes from a URL rather than words on the page.
  const { $ } = ctx;
  const fromMaps = new Map<string, Address>();
  $("a[href], iframe[src]").each((_, el) => {
    const a = addressFromMapsUrl($(el).attr("href") ?? $(el).attr("src") ?? "");
    if (a && !fromMaps.has(addressKey(a))) fromMaps.set(addressKey(a), a);
  });
  if (fromMaps.size) place(ctx, [...fromMaps.values()], "inferred");
}

function place(ctx: PageContext, addresses: Address[], confidence: Confidence): void {
  const { kb, url, category } = ctx;
  const city = locationCity(kb.url);
  let main: Address | null = null;
  if (city) main = addresses.find((a) => a.city?.toLowerCase() === city) ?? null;
  else if (addresses.length < 3 && (url === kb.url || BUSINESS_PAGES.has(category))) main = addresses[0];

  const mainField = kb.company.mainAddress;
  const known = () => [mainField.value, ...kb.company.otherLocations.map((f) => f.value)].filter((a): a is Address => !!a).map(addressKey);
  // Main is open when empty, or when it only came from a maps link and we now read it on the page.
  const mainOpen = () => mainField.value === null || (mainField.confidence === "inferred" && confidence === "scraped");
  for (const a of addresses) {
    if (a === main && mainOpen()) {
      setField(mainField, a, url, confidence);
      // It may already be listed as another location from an earlier page: keep it in one place.
      kb.company.otherLocations = kb.company.otherLocations.filter((f) => !f.value || addressKey(f.value) !== addressKey(a));
      continue;
    }
    if (known().includes(addressKey(a))) continue;
    if (kb.company.otherLocations.length < MAX_LOCATIONS) addItem(kb.company.otherLocations, a, url, addressKey, confidence);
  }
}
