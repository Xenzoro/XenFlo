import type { PageContext } from "./types";
import { addItem, clean, setField } from "../merge";
import { phoneKey } from "./jsonld";
import { cleanUrl } from "../url";

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// Ignore emails that are really asset names or third-party tooling.
const FAKE_EMAIL = /\.(png|jpe?g|gif|webp|svg)$|@(example|sentry|wixpress|domain|email)\.|^(name|your|user)@/i;

// US/Canada style numbers with separators: (702) 555-1234, 702.555.1234, +1 702-555-1234.
// Requiring separators avoids matching IDs and timestamps.
const PHONE = /(?:\+?1[\s.-])?\(?\b[2-9]\d{2}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;

const ENTITY = String.raw`(LLC|L\.L\.C\.|Inc\.?|Incorporated|Ltd\.?|Limited|Corp\.?|Corporation|LLP|PLLC|GmbH|Co\.)`;
// "© 2014-2025 Apex Hosting LLC" -> years + name + entity
const COPYRIGHT = new RegExp(
  String.raw`(?:©|\(c\)|copyright)\s*(?:(\d{4})\s*[-–]\s*)?(\d{4})?\s*,?\s*([A-Z][\w&'. -]{1,60}?)\s*,?\s*` + ENTITY + String.raw`(?=[\s.,|]|$)`,
  "i",
);
// Fallback: copyright line without a legal entity, just to get the year range.
const COPYRIGHT_YEARS = /(?:©|\(c\)|copyright)\s*(\d{4})\s*[-–]\s*(\d{4})/i;

/** Emails, phones, contact page, copyright/legal entity and legal links. */
export function extractContact(ctx: PageContext): void {
  const { $, url, kb, category, visibleText } = ctx;

  // mailto: and tel: links are the most reliable.
  $('a[href^="mailto:"]').each((_, el) => {
    const email = ($(el).attr("href") ?? "").replace(/^mailto:/i, "").split("?")[0].trim();
    if (EMAIL.test(email) && !FAKE_EMAIL.test(email)) addItem(kb.contact.emails, email.toLowerCase(), url, (v) => v);
    EMAIL.lastIndex = 0;
  });
  $('a[href^="tel:"]').each((_, el) => {
    const raw = ($(el).attr("href") ?? "").replace(/^tel:/i, "");
    if (phoneKey(raw).length >= 10) addItem(kb.contact.phones, clean($(el).text()) || raw, url, phoneKey);
  });

  for (const email of visibleText.match(EMAIL) ?? []) {
    if (!FAKE_EMAIL.test(email)) addItem(kb.contact.emails, email.toLowerCase(), url, (v) => v);
  }
  for (const phone of visibleText.match(PHONE) ?? []) {
    addItem(kb.contact.phones, phone.trim(), url, phoneKey);
  }

  if (category === "contact") setField(kb.contact.contactPageUrl, url, url);

  // Copyright notices live in the footer; fall back to the whole page.
  const footer = clean($("footer").text()) ?? "";
  const match = footer.match(COPYRIGHT) ?? visibleText.match(COPYRIGHT);
  if (match) {
    const [, startYear, , name, entity] = match;
    const entityType = entity.replace(/\.$/, "").replace(/^L\.L\.C$/i, "LLC");
    setField(kb.company.legalEntityType, normalizeEntity(entityType), url);
    setField(kb.company.legalName, `${name.trim()} ${entity}`.trim(), url);
    // A range like "2014-2025" suggests the business existed in 2014; a hint, not a fact.
    if (startYear) setField(kb.company.yearFounded, Number(startYear), url, "inferred");
  } else {
    const years = (footer || visibleText).match(COPYRIGHT_YEARS);
    if (years) setField(kb.company.yearFounded, Number(years[1]), url, "inferred");
  }

  // Privacy / terms / refund links feed the Insights "legal and compliance" list.
  $("a[href]").each((_, el) => {
    const label = clean($(el).text(), 80);
    if (!label || !/privacy|terms|refund|cookie|accessibility|disclaimer|legal/i.test(label)) return;
    const href = cleanUrl($(el).attr("href") ?? "", url);
    if (href) addItem(kb.insights.legalLinks, { label, url: href }, url, (v) => v.url);
  });
}

function normalizeEntity(entity: string): string {
  const e = entity.toLowerCase().replace(/\./g, "");
  if (e === "incorporated") return "Inc";
  if (e === "limited") return "Ltd";
  if (e === "corporation") return "Corp";
  return { llc: "LLC", inc: "Inc", ltd: "Ltd", corp: "Corp", llp: "LLP", pllc: "PLLC", gmbh: "GmbH", co: "Co" }[e] ?? entity;
}
