import type { CheerioAPI } from "cheerio";
import type { Offering, PricingType } from "@/types/knowledge";
import type { PageContext } from "./types";
import { addItem, clean } from "../merge";
import { textOf } from "./text";
import { parseMenuLines } from "../menus/parse";
import { pageGroup } from "./menu-sources";

type El = ReturnType<CheerioAPI>;

const HEADINGS = 'h1, h2, h3, h4, h5, [class*="title" i], [class*="name" i]';
const PRICE = /\$\s?(\d[\d,]*(?:\.\d{1,2})?)/g;
const PERIOD = /\/\s?(mo|month|yr|year|hr|hour|wk|week|day)\b|\bper\s+(month|year|hour|week|day|project|session|person|visit|user|seat)\b|\b(monthly|annually|yearly)\b|\bbilled\b/i;
// Headings that are page sections, not things you can buy.
const GENERIC = /faq|frequently|question|contact|newsletter|subscribe|footer|testimonial|review|blog|guide|about|team|location|why|how it works|get started|follow|cookie|privacy|sign up|login|menu|^(features?|services?|products?|pricing|plans?)$/i;

/**
 * Offerings from two shapes of content:
 * 1. Price cards: a price with a heading nearby (plans, packages, menu items).
 * 2. On services/products pages: a heading followed by a description paragraph.
 */
export function extractOfferings(ctx: PageContext): void {
  // A menu page laid out as lists or tables ("California Roll ... $8.95"): read it line by line.
  // When that works, skip the price-card reader, which would take the section heading ("Rolls") as an item.
  if (ctx.category === "menu" && extractMenuPage(ctx)) return;
  extractPriceCards(ctx);
  if (ctx.category === "services" || ctx.category === "products") extractServiceSections(ctx);
}

const MIN_MENU_ITEMS = 3;

/** Priced lines on a menu page -> offerings, grouped by the brand the page is about. Returns false when it isn't a list menu. */
function extractMenuPage(ctx: PageContext): boolean {
  // Only priced items: unpriced short lines on a web page are often nav links and buttons.
  const items = parseMenuLines(ctx.lines, { requirePrice: true });
  if (items.length < MIN_MENU_ITEMS) return false;
  const group = pageGroup(ctx);
  for (const item of items) {
    addItem(
      ctx.kb.offerings,
      {
        name: item.name,
        category: item.category,
        description: item.description,
        features: [],
        pricingType: item.price?.pricingType ?? "unknown",
        priceText: item.price?.priceText ?? null,
        priceAmount: item.price?.priceAmount ?? null,
        currency: item.price?.currency ?? null,
        group,
        sourceKind: "page",
      },
      ctx.url,
      (v) => `${v.group ?? ""}|${v.name}`.toLowerCase(),
    );
  }
  return true;
}

function extractPriceCards(ctx: PageContext): void {
  const { $text: $, url, kb } = ctx;
  const cards = new Set<unknown>();

  // Small elements that contain a price and have no child that also does (the innermost one).
  $("body *").each((_, node) => {
    const el = $(node);
    const t = textOf(el);
    if (t.length > 80 || !/\$\s?\d/.test(t)) return;
    if (el.children().toArray().some((c) => /\$\s?\d/.test(textOf($(c))))) return;

    const card = cardFor($, el);
    if (!card || cards.has(card.get(0))) return;
    cards.add(card.get(0));

    const name = clean(textOf(card.find(HEADINGS).first()), 80);
    if (!name || GENERIC.test(name) || /\$\s?\d/.test(name)) return;
    const cardText = textOf(card);

    addItem(
      kb.offerings,
      {
        name,
        category: sectionTitle($, card, name),
        description: description($, card, name),
        features: card
          .find("li")
          .toArray()
          .map((li) => textOf($(li)))
          .filter((f) => f.length >= 2 && f.length <= 120)
          .slice(0, 12),
        ...parsePricing(cardText),
      },
      url,
      (v) => v.name.toLowerCase(),
    );
  });
}

/** Climb from a price to the smallest ancestor that has a heading (the "card"). */
function cardFor($: CheerioAPI, el: El): El | null {
  let cur = el;
  for (let i = 0; i < 7; i++) {
    const parent = cur.parent();
    if (!parent.length || parent.is("body")) return null;
    cur = parent;
    if (textOf(cur).length > 900) return null;
    if (cur.find(HEADINGS).length) return cur;
  }
  return null;
}

type Pricing = Pick<Offering, "pricingType" | "priceText" | "priceAmount" | "currency">;

/** Read the pricing model and the main price from a card's text. */
export function parsePricing(text: string): Pricing {
  const prices = [...text.matchAll(PRICE)].map((m) => ({
    amount: Number(m[1].replace(/,/g, "")),
    raw: m[0].replace(/\s/g, ""),
    after: text.slice(m.index! + m[0].length, m.index! + m[0].length + 30),
    before: text.slice(Math.max(0, m.index! - 20), m.index!),
  }));

  if (!prices.length) {
    if (/\bfree\b/i.test(text)) return { pricingType: "free", priceText: "Free", priceAmount: 0, currency: "USD" };
    if (/contact|quote|call (us )?for|request/i.test(text)) return { pricingType: "quote", priceText: "Contact for a quote", priceAmount: null, currency: null };
    return { pricingType: "unknown", priceText: null, priceAmount: null, currency: null };
  }

  // Skip intro prices like "$11.24 first month" in favor of the recurring price.
  const intro = (p: (typeof prices)[number]) => /^\s*(first|for the first|intro|today|1st)/i.test(p.after);
  const main = prices.find((p) => !intro(p)) ?? prices[0];
  const introPrice = prices.find(intro);
  const period = main.after.match(PERIOD) ?? text.match(PERIOD);

  let pricingType: PricingType = "fixed";
  if (/(starting|starts) at|from\s*$/i.test(main.before) || /(starting|starts) at/i.test(text)) pricingType = "starting_at";
  else if (/^\s*[-–]\s*\$/.test(main.after)) pricingType = "range";
  else if (period && !/project|session|person|visit/i.test(period[0])) pricingType = "subscription";

  let priceText = main.raw;
  if (pricingType === "starting_at") priceText = `Starting at ${main.raw}`;
  if (pricingType === "range") priceText = `${main.raw}${main.after.match(/^\s*[-–]\s*\$\s?[\d,.]+/)?.[0].replace(/\s/g, "") ?? ""}`;
  if (period) priceText += periodSuffix(period[0], text);
  if (introPrice && introPrice !== main) priceText += `, ${introPrice.raw} first month`;

  return { pricingType, priceText, priceAmount: main.amount, currency: "USD" };
}

/** "/mo", "billed monthly", "per month" -> "/mo"; "per project" -> " per project". */
function periodSuffix(period: string, text: string): string {
  const p = period.toLowerCase();
  const unit = /yr|year|annual/.test(p) || /billed (annually|yearly)/i.test(text) ? "yr"
    : /mo|month/.test(p) || /billed monthly/i.test(text) ? "mo"
    : /hr|hour/.test(p) ? "hr" : /wk|week/.test(p) ? "wk" : /day/.test(p) ? "day" : null;
  if (unit) return `/${unit}`;
  const per = p.match(/per\s+(\w+)/);
  return per ? ` per ${per[1]}` : "";
}

/** Nearest section heading above the card that isn't the card's own name. */
function sectionTitle($: CheerioAPI, card: El, name: string): string | null {
  let cur = card;
  for (let i = 0; i < 8; i++) {
    cur = cur.parent();
    if (!cur.length) break;
    const heading = cur.find("h1, h2").toArray().map((h) => textOf($(h))).find((t) => t && t !== name && t.length <= 60);
    if (heading) return heading;
  }
  // Fall back to the page's main heading ("Game Servers").
  const h1 = textOf($("h1").first());
  return h1 && h1.length <= 60 && h1 !== name ? h1 : null;
}

function description($: CheerioAPI, card: El, name: string): string | null {
  const text = card
    .find("p, [class*=desc i]")
    .toArray()
    .map((p) => textOf($(p)))
    .find((t) => t.length >= 10 && t !== name && !/\$\s?\d/.test(t));
  return clean(text, 300);
}

function extractServiceSections(ctx: PageContext): void {
  const { $text: $, url, kb } = ctx;
  let added = 0;
  $("h2, h3").each((_, node) => {
    if (added >= 12) return;
    const el = $(node);
    const name = textOf(el);
    if (name.length < 3 || name.length > 60 || name.endsWith("?") || GENERIC.test(name)) return;
    const desc = textOf(el.nextAll("p").first());
    if (desc.length < 40) return;
    addItem(
      kb.offerings,
      {
        name,
        category: textOf($("h1").first()) || null,
        description: clean(desc, 300),
        features: el.nextAll("ul").first().find("li").toArray().map((li) => textOf($(li))).filter((f) => f.length <= 120).slice(0, 10),
        pricingType: "unknown",
        priceText: null,
        priceAmount: null,
        currency: null,
      },
      url,
      (v) => v.name.toLowerCase(),
    );
    added++;
  });
}
