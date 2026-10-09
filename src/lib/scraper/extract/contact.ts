import type { PageContext } from "./types";
import { addItem, clean, setField } from "../merge";
import { phoneKey } from "./jsonld";
import { cleanUrl } from "../url";
import { field } from "@/lib/utils/knowledge";

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// Ignore emails that are really asset names or third-party tooling.
const FAKE_EMAIL = /\.(png|jpe?g|gif|webp|svg)$|@(example|sentry|wixpress|domain|email)\.|^(name|your|user)@/i;

// US/Canada style numbers with separators: (702) 555-1234, 702.555.1234, +1 702-555-1234.
// Requiring separators avoids matching IDs and timestamps.
const PHONE = /(?:\+?1[\s.-])?\(?\b[2-9]\d{2}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;

/** Emails, phones, contact page and legal links. (Copyright and legal entity: business-facts.ts) */
export function extractContact(ctx: PageContext): void {
  const { $, url, kb, category, visibleText } = ctx;

  // mailto: and tel: links are the most reliable.
  $('a[href^="mailto:"]').each((_, el) => {
    const email = ($(el).attr("href") ?? "").replace(/^mailto:/i, "").split("?")[0].trim();
    if (EMAIL.test(email) && !FAKE_EMAIL.test(email)) addItem(kb.contact.emails, email.toLowerCase(), url, (v) => v);
    EMAIL.lastIndex = 0;
  });
  // On a location page (/location/las-vegas), other pages list every branch's number.
  // Keep the ones next to our city, skip the ones next to another branch's address.
  const city = locationCity(kb.url);
  const isStartPage = url === kb.url;
  const addPhone = (display: string, digits: string, context: string) => {
    if (!isUsPhone(digits)) return;
    const value = PHONE_ONLY.test(display) ? display.trim() : formatPhone(digits);
    if (!city || isStartPage) return addItem(kb.contact.phones, value, url, phoneKey);
    const where = cityMatch(context, city);
    if (where === "other") return;
    if (where === "ours") return addPreferredPhone(ctx, value);
    addItem(kb.contact.phones, value, url, phoneKey);
  };

  $('a[href^="tel:"]').each((_, el) => {
    const digits = phoneKey(($(el).attr("href") ?? "").replace(/^tel:/i, ""));
    // Button text like "CALL Now" isn't a number: show the href's digits instead.
    addPhone(clean($(el).text()) ?? "", digits, city ? blockText($, el) : "");
  });

  for (const email of visibleText.match(EMAIL) ?? []) {
    if (!FAKE_EMAIL.test(email)) addItem(kb.contact.emails, email.toLowerCase(), url, (v) => v);
  }
  for (const m of visibleText.matchAll(PHONE)) {
    // The text around the number tells us which branch it belongs to.
    const around = city ? visibleText.slice(Math.max(0, m.index - 150), m.index + m[0].length + 150) : "";
    addPhone(m[0], phoneKey(m[0]), around);
  }

  if (category === "contact") setField(kb.contact.contactPageUrl, url, url);

  // Privacy / terms / refund links feed the Insights "legal and compliance" list.
  $("a[href]").each((_, el) => {
    const label = clean($(el).text(), 80);
    if (!label || !/privacy|terms|refund|cookie|accessibility|disclaimer|legal/i.test(label)) return;
    const href = cleanUrl($(el).attr("href") ?? "", url);
    if (href) addItem(kb.insights.legalLinks, { label, url: href }, url, (v) => v.url);
  });
}

// A whole string that is just a phone number (link text worth keeping as written).
const PHONE_ONLY = /^\s*(?:\+?1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\s*$/;
// "Phoenix, AZ 85042": a branch address in a location list.
const CITY_STATE_ZIP = /\b([A-Z][a-zA-Z.]+(?:\s[A-Z][a-zA-Z.]+){0,2}),\s*[A-Z]{2}\s+\d{5}\b/g;

/** 10 digits (after phoneKey drops a leading 1) with a valid US area code and exchange. */
function isUsPhone(digits: string): boolean {
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits);
}

/** "7022919893" -> "(702) 291-9893" */
function formatPhone(digits: string): string {
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** "https://site.com/location/las-vegas" -> "las vegas"; null when it isn't a location page. */
export function locationCity(pageUrl: string): string | null {
  const m = new URL(pageUrl).pathname.match(/\/(?:locations?|areas?-served|service-areas?)\/([a-z][a-z0-9-]*?)\/?$/i);
  return m ? m[1].replace(/-(nv|az|tx|ca|ut|co|fl|nevada|arizona|texas|california)$/i, "").replace(/-/g, " ").toLowerCase() : null;
}

/** Does this snippet belong to our city, another branch, or neither? */
function cityMatch(text: string, city: string): "ours" | "other" | "none" {
  if (text.toLowerCase().includes(city)) return "ours";
  return [...text.matchAll(CITY_STATE_ZIP)].length > 0 ? "other" : "none";
}

/** Text of the nearest wrapper big enough to hold an address (a location card), max 8 levels up. */
function blockText($: PageContext["$"], el: Parameters<PageContext["$"]>[0]): string {
  let node = $(el);
  for (let i = 0; i < 8; i++) {
    const text = node.text().replace(/\s+/g, " ").trim();
    if (text.length >= 40) return text.slice(0, 600);
    node = node.parent();
  }
  return "";
}

/** Our location's number goes right after the numbers shown on the location page itself. */
function addPreferredPhone(ctx: PageContext, value: string): void {
  const { kb, url } = ctx;
  if (kb.contact.phones.some((p) => p.value !== null && phoneKey(p.value) === phoneKey(value))) return;
  const position = kb.contact.phones.filter((p) => p.source === kb.url).length;
  kb.contact.phones.splice(position, 0, field(value, url, "scraped"));
}

