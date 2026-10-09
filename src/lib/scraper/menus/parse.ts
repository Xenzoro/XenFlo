/**
 * Menus and price lists as text -> offerings, with heuristics only (no AI).
 * Used for PDF text and for HTML menu pages. The one hard rule: a price is only ever
 * copied from the item's own lines. If no price is printed there, the price stays empty.
 */
import type { PricingType } from "@/types/knowledge";

export interface ParsedPrice {
  pricingType: PricingType;
  /** Exactly as printed ("$12.99", "Market price") */
  priceText: string | null;
  priceAmount: number | null;
  currency: string | null;
}

export interface MenuItem {
  name: string;
  description: string | null;
  category: string | null;
  price: ParsedPrice | null;
}

const MARKET = /^(market\s+price|mp|m\.p\.|seasonal\s+price|ask\s+server)$/i;
// One price: "$12.99", "12.99", "12", "$9.95/person", "$10 - $15"
const PRICE_TOKEN = /^\$?\s?(\d{1,4}(?:[.,]\d{2})?)(?:\s*[-–]\s*\$?\s?(\d{1,4}(?:[.,]\d{2})?))?(\s*\/\s*[a-z]+|\s+(?:each|ea|per\s+\w+))?$/i;

/**
 * Read one price string. Returns null when the text isn't a price at all.
 * "$12.99" -> 12.99, "12" -> 12, "Market price" -> no amount (never guessed).
 */
export function parsePrice(raw: string): ParsedPrice | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (MARKET.test(text)) return { pricingType: "unknown", priceText: text.length <= 3 ? "Market price" : text, priceAmount: null, currency: null };
  const m = text.match(PRICE_TOKEN);
  if (!m) return null;
  const amount = Number(m[1].replace(",", "."));
  if (!Number.isFinite(amount)) return null;
  const range = !!m[2];
  return { pricingType: range ? "range" : "fixed", priceText: text, priceAmount: amount, currency: "USD" };
}

// A line that ends with a price: "California Roll ..... $8.95", "Edamame 5", "Gyoza – 6.50"
const TRAILING_PRICE = /^(.*?[A-Za-z].*?)\s*(?:\.{2,}|…+|\s[-–|]\s|\s)\s*(\$\s?\d{1,4}(?:[.,]\d{2})?(?:\s*[-–]\s*\$?\s?\d{1,4}(?:[.,]\d{2})?)?|\d{1,4}[.,]\d{2}|\d{1,3}|market price|MP)\s*$/i;
// Menu section words, so "Appetizers" or "Hand Rolls" counts as a heading even in Title Case
const SECTION_WORDS = /^(appetizers?|starters?|small plates|salads?|soups?|sides?|entrees?|entrées?|mains?|main courses?|noodles?|rice|ramen|rolls?|hand rolls?|special rolls?|signature rolls?|sushi|sashimi|nigiri|bowls?|sandwich(es)?|burgers?|tacos?|pizzas?|pastas?|desserts?|sweets|drinks?|beverages?|cocktails?|beer|wine|sake|coffee|teas?|milk teas?|smoothies|boba|toppings|kids( menu)?|lunch( specials)?|dinner|breakfast|brunch|specials?|combos?|platters?|hot pot|broths?|meats?|seafood|vegetables|veggies|add[- ]ons?|extras|services|packages|treatments)$/i;

// Words followed by a plain number that isn't a price
const NUMBERED = /\b(step|no\.?|number|table|suite|ste|unit|room|level|floor|minimum|min|max|limit|size|pack|pcs|pieces|day|week|year|option|combo|page)$/i;

const isPriceOnly = (line: string) => parsePrice(line) !== null;
const words = (line: string) => line.split(/\s+/).filter(Boolean);
const isAllCaps = (line: string) => /[A-Z]/.test(line) && line === line.toUpperCase();

/** A section heading: short, no price, ALL CAPS or a known menu section word, no sentence punctuation. */
function isHeading(line: string): boolean {
  if (/[.:!?,]$/.test(line) || /\d/.test(line)) return false;
  const n = words(line).length;
  if (n === 0 || n > 4) return false;
  return isAllCaps(line) ? line.length >= 3 : SECTION_WORDS.test(line);
}

/** An item name: short, starts like a name, no sentence ending. */
function looksLikeItem(line: string): boolean {
  const n = words(line).length;
  return n >= 1 && n <= 8 && line.length <= 60 && /^[*"“(]?[A-Z0-9]/.test(line) && !/[.:!?]$/.test(line);
}

/** Description: a longer phrase with lowercase words, or an ingredient list with commas. */
function looksLikeDescription(line: string): boolean {
  return /[a-z]/.test(line) && (line.includes(",") || words(line).length >= 4) && line.length <= 300;
}

/** "Pan-fried dumplings, ginger soy": most words lowercase, so it reads as a phrase, not a dish name. */
function mostlyLowercase(line: string): boolean {
  const w = words(line).filter((x) => /^[A-Za-z]/.test(x));
  return w.length >= 2 && w.filter((x) => /^[a-z]/.test(x)).length >= w.length / 2;
}

const cleanName = (s: string) => s.replace(/^[*•·\-–\s]+|[*•·\s]+$/g, "").replace(/\s*\.{2,}\s*$/, "").trim();

/**
 * Turn menu lines into items. Headings start a category; "name ... price" lines are items;
 * a price on its own line belongs to the item just above it; a phrase under an item is its description.
 * `requirePrice`: only keep priced items (web pages, where unpriced short lines are often nav or buttons).
 */
export function parseMenuLines(lines: string[], { requirePrice = false } = {}): MenuItem[] {
  const items: MenuItem[] = [];
  let category: string | null = null;
  let current: MenuItem | null = null;
  // The heading just read and the category before it: an ALL CAPS item name with its price on
  // the next line ("CALIFORNIA ROLL" / "$8.95") looks like a heading until the price shows up.
  let heading: { name: string; before: string | null } | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || line.length > 300) continue;

    if (isPriceOnly(line)) {
      // "$8.95" under "California Roll": that item's price (only if it has none yet)
      if (current && !current.price) current.price = parsePrice(line);
      else if (!current && heading) {
        category = heading.before;
        current = { name: heading.name, description: null, category, price: parsePrice(line) };
        items.push(current);
      }
      heading = null;
      continue;
    }
    if (isHeading(line)) {
      heading = { name: titleCase(line), before: category };
      category = titleCase(line);
      current = null;
      continue;
    }
    heading = null;
    const priced = line.match(TRAILING_PRICE);
    // "STEP 2", "Table 4", "Suite 104": a number, not a price (only when it has no "$" or cents)
    const notAPrice = priced && /^\d+$/.test(priced[2]) && NUMBERED.test(cleanName(priced[1]));
    if (priced && !notAPrice && looksLikeItem(cleanName(priced[1]))) {
      current = { name: cleanName(priced[1]), description: null, category, price: parsePrice(priced[2]) };
      items.push(current);
      continue;
    }
    if (current && !current.description && looksLikeDescription(line) && (!looksLikeItem(line) || mostlyLowercase(line))) {
      current.description = line;
      continue;
    }
    // A bare name line: an item only inside a section, so intro text before the first heading is skipped.
    if (category && looksLikeItem(line)) {
      current = { name: cleanName(line), description: null, category, price: null };
      items.push(current);
      continue;
    }
    if (current && !current.description && looksLikeDescription(line)) current.description = line;
  }

  const seen = new Set<string>();
  return items.filter((i) => {
    const key = `${i.category ?? ""}|${i.name.toLowerCase()}`;
    if (!i.name || i.name.length < 2 || seen.has(key) || (requirePrice && !i.price)) return false;
    seen.add(key);
    return true;
  });
}

/** "HAND ROLLS" -> "Hand Rolls"; "Hand Rolls" stays. */
export function titleCase(text: string): string {
  if (!isAllCaps(text)) return text;
  return text.toLowerCase().replace(/(^|[\s(/.-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/**
 * How well the heuristics understood a menu text. "read" when they found a real list with prices;
 * "messy" when there is text but too few clear items (AI can structure it, with a verbatim check).
 */
export function menuTextQuality(text: string, items: MenuItem[]): "read" | "messy" | "no_text" {
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  if (letters < 40) return "no_text";
  // Garbled text from custom-encoded fonts: mostly symbols, few real words
  const realWords = (text.match(/\b[A-Za-z]{3,}\b/g) ?? []).length;
  if (realWords < 8) return "no_text";
  const priced = items.filter((i) => i.price?.priceAmount != null).length;
  return items.length >= 5 && priced >= items.length / 2 ? "read" : "messy";
}
