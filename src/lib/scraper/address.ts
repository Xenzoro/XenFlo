/**
 * US street addresses from page text or a maps link, without AI.
 *
 * Pages write addresses many ways: one line ("1 Main St, Springfield, NV 89000"), split
 * across lines with <br> ("1 Main St #5" / "Springfield NV 89000"), with units ("Ste 100",
 * "Suite 100", "Unit 4B", "#105") and sometimes no comma before the state. The pattern is
 * anchored on a real state code plus a ZIP code, which keeps false matches rare.
 */
import type { Address } from "@/types/knowledge";

const STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY";

const ADDRESS = new RegExp(
  [
    String.raw`\b(\d{1,6}[A-Za-z]?)\s+`, // 1: street number ("123", "12B")
    String.raw`([A-Za-z][A-Za-z0-9.'’ -]{1,50}?)`, // 2: street name, no commas ("W Example Ave", "Main St.")
    String.raw`(?:,?\s*(#\s*[\w-]+|(?:Suite|Ste\.?|Unit|Apt\.?|Bldg\.?|Building|Floor|Fl\.?)\s*#?\s*[\w-]+))?`, // 3: unit
    String.raw`\s*,\s*`, // the street ends at a comma (a line break is joined as ", ")
    String.raw`([A-Za-z][A-Za-z .'’-]{1,40}?)`, // 4: city
    String.raw`,?\s+(${STATES})\.?,?\s+`, // 5: state, comma before it optional
    String.raw`(\d{5}(?:-\d{4})?)\b`, // 6: ZIP
  ].join(""),
  "g",
);

const UNIT = /(?:#|\b(?:Suite|Ste\.?|Unit|Apt\.?|Bldg\.?|Building|Floor|Fl\.?))\s*#?\s*([\w-]+)\s*$/i;

/**
 * Same address? Street number + unit + ZIP. That survives "Rd." vs "Road" and "Suite 1" vs "Ste 1",
 * but keeps different suites in one building apart (restaurants at #117 and #119).
 */
export function addressKey(a: Address): string {
  const number = a.street?.match(/^\d+\w*/)?.[0] ?? a.formatted;
  const unit = a.street?.match(UNIT)?.[1] ?? "";
  return `${number}|${unit}|${a.postalCode ?? ""}`.toLowerCase();
}

function fromMatch(m: RegExpMatchArray): Address {
  const unit = m[3]?.replace(/\s+/g, " ").trim();
  const street = `${m[1]} ${m[2].trim()}${unit ? ` ${unit}` : ""}`;
  const city = m[4].trim();
  return {
    street,
    city,
    region: m[5],
    postalCode: m[6],
    country: "US",
    formatted: `${street}, ${city}, ${m[5]} ${m[6]}`,
  };
}

/** Every address in a piece of text (one line, or lines already joined). */
export function addressesInText(text: string): Address[] {
  return [...text.matchAll(ADDRESS)].map(fromMatch);
}

/**
 * Addresses in a page's lines. Single lines are tried first; then each run of 2-3 lines
 * joined with ", ", so "street" + "city, ST ZIP" on separate lines is found too.
 */
export function findAddresses(lines: string[]): Address[] {
  const found = new Map<string, Address>();
  const add = (list: Address[]) => list.forEach((a) => found.has(addressKey(a)) || found.set(addressKey(a), a));
  const clean = lines.map((l) => l.replace(/[\s,]+$/, "")); // "Suite 1," + "Las Vegas" -> no double comma
  for (const line of clean) add(addressesInText(line));
  for (const size of [2, 3]) {
    for (let i = 0; i + size <= clean.length; i++) add(addressesInText(clean.slice(i, i + size).join(", ")));
  }
  return [...found.values()];
}

// ---------- Maps links and embeds ----------

const MAPS_HOST = /(^|\.)google\.[a-z.]+$|^maps\.google\.[a-z.]+$|^maps\.apple\.com$/i;

/**
 * The address carried inside a Google or Apple Maps URL ("?q=", "?address=", "/maps/place/<...>/",
 * an embed's "!2s<...>"), or null. A place name alone ("q=Example Cafe") isn't an address and
 * returns null, so we never store a business name as a location.
 */
export function addressFromMapsUrl(raw: string): Address | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!MAPS_HOST.test(u.hostname) || (/google/i.test(u.hostname) && !/\/maps/i.test(u.pathname) && !/^maps\./i.test(u.hostname))) return null;

  const decode = (s: string) => {
    try {
      return decodeURIComponent(s.replace(/\+/g, " "));
    } catch {
      return s.replace(/\+/g, " ");
    }
  };
  const candidates = [
    ...["q", "query", "daddr", "address"].map((k) => u.searchParams.get(k)),
    ...[...u.pathname.matchAll(/\/maps\/(?:place|search)\/([^/]+)/gi)].map((m) => decode(m[1])),
    ...[...(u.searchParams.get("pb") ?? "").matchAll(/!2s([^!]+)/g)].map((m) => decode(m[1])),
  ];
  for (const c of candidates) {
    const a = c ? addressesInText(c.replace(/\s+/g, " "))[0] : undefined;
    if (a) return a;
  }
  return null;
}
