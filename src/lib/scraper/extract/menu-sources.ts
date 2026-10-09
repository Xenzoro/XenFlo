/**
 * Menu sources outside plain HTML (Phase 10). On every page:
 * - PDF links that look like menus or price lists -> kb.crawl.menuSources (read after the crawl, menus/index.ts)
 * - big images on menu pages, or images named like a menu -> kb.crawl.menuSources (read by AI on request)
 * - third-party ordering, delivery and booking links -> customers.channels, with the platform name.
 *   Those platforms are never fetched: we only record that the business uses them.
 */
import type { MenuSource } from "@/types/knowledge";
import type { PageContext } from "./types";
import { addItem } from "../merge";
import { cleanUrl, pageKey } from "../url";
import { textOf } from "./text";
import { companyWords, groupFromTitle } from "../menus/brands";

const MENU_WORD = /menu|food|drinks?|beverage|price|pricing|rates|services|specials|catering|brunch|lunch|dinner|wine|cocktail|happy[- ]hour|price[- ]?list/i;
const PDF = /\.pdf$/i;
// Pages whose PDFs are menus or price lists even when the link just says "Download"
const MENU_PAGES = new Set(["menu", "pricing", "services", "products"]);
const MIN_IMAGE_SIDE = 400;
// Plenty for a restaurant group; keeps the saved record small on sites that link hundreds of PDFs
const MAX_SOURCES = 40;
const STOCK = /nsplsh_|unsplash|shutterstock|istockphoto|pexels|gettyimages/i;

/** Third-party platforms -> the channel they represent. Matched on the link's host. */
const PLATFORMS: { host: RegExp; name: string; channel: "Online ordering" | "Delivery" | "Reservations" | "Online booking" | "Reviews" }[] = [
  { host: /(^|\.)toasttab\.com$/, name: "Toast", channel: "Online ordering" },
  { host: /(^|\.)(squareup\.com|square\.site)$/, name: "Square", channel: "Online ordering" },
  { host: /(^|\.)clover\.com$/, name: "Clover", channel: "Online ordering" },
  { host: /(^|\.)chownow\.com$/, name: "ChowNow", channel: "Online ordering" },
  { host: /(^|\.)menu11\.com$/, name: "Menu11", channel: "Online ordering" },
  { host: /(^|\.)(olo\.com|order\.online)$/, name: "Olo", channel: "Online ordering" },
  { host: /(^|\.)menufy\.com$/, name: "Menufy", channel: "Online ordering" },
  { host: /(^|\.)beyondmenu\.com$/, name: "BeyondMenu", channel: "Online ordering" },
  { host: /(^|\.)slicelife\.com$/, name: "Slice", channel: "Online ordering" },
  { host: /(^|\.)popmenu\.com$/, name: "Popmenu", channel: "Online ordering" },
  { host: /(^|\.)doordash\.com$/, name: "DoorDash", channel: "Delivery" },
  { host: /(^|\.)ubereats\.com$/, name: "Uber Eats", channel: "Delivery" },
  { host: /(^|\.)grubhub\.com$/, name: "Grubhub", channel: "Delivery" },
  { host: /(^|\.)postmates\.com$/, name: "Postmates", channel: "Delivery" },
  { host: /(^|\.)seamless\.com$/, name: "Seamless", channel: "Delivery" },
  { host: /(^|\.)ezcater\.com$/, name: "ezCater", channel: "Delivery" },
  { host: /(^|\.)opentable\.com$/, name: "OpenTable", channel: "Reservations" },
  { host: /(^|\.)resy\.com$/, name: "Resy", channel: "Reservations" },
  { host: /(^|\.)exploretock\.com$/, name: "Tock", channel: "Reservations" },
  { host: /(^|\.)(vagaro\.com|booksy\.com|fresha\.com|schedulicity\.com)$/, name: "online booking site", channel: "Online booking" },
  { host: /(^|\.)yelp\.com$/, name: "Yelp", channel: "Reviews" },
];

export function extractMenuSources(ctx: PageContext): void {
  const { $, url, kb, category } = ctx;
  const group = pageGroup(ctx);
  const sources = (kb.crawl.menuSources ??= []);

  $("a[href]").each((_, node) => {
    const a = $(node);
    const href = cleanUrl(a.attr("href") ?? "", url);
    if (!href) return;
    const label = (textOf(a) || a.attr("aria-label") || a.attr("title") || "").slice(0, 60) || null;
    const host = new URL(href).hostname.toLowerCase();

    const platform = PLATFORMS.find((p) => p.host.test(host));
    if (platform) {
      // "Online ordering (Clover)": the link itself is the source, so the owner can check it
      addItem(kb.customers.channels, `${platform.channel} (${platform.name})`, href, (v) => v.toLowerCase());
      return;
    }

    if (PDF.test(new URL(href).pathname) && (MENU_WORD.test(`${label ?? ""} ${href}`) || MENU_PAGES.has(category))) {
      addMenuSource(sources, { url: href, kind: "pdf", foundOn: url, label, group, status: "found", items: 0 });
    }
  });

  // Images: only where a menu is likely, so food photos and banners aren't sent to AI.
  $("img").each((_, node) => {
    const img = $(node);
    const src = img.attr("src") ?? img.attr("data-src");
    const abs = src && !src.startsWith("data:") ? cleanUrl(src, url) : null;
    if (!abs) return;
    const alt = img.attr("alt") ?? "";
    const named = /menu|price/i.test(`${alt} ${abs.split("/").pop()}`);
    if (!named && category !== "menu") return;
    const { w, h } = imageSize(img.attr("width"), img.attr("height"), abs);
    if (!w || !h || Math.min(w, h) < MIN_IMAGE_SIDE) return;
    // Logos, stock photos (Wix "nsplsh_" = Unsplash) and site chrome are never menus
    if (/logo|icon/i.test(`${alt} ${abs}`) || STOCK.test(abs) || img.closest("header, footer, nav").length) return;
    addMenuSource(sources, { url: abs, kind: "image", foundOn: url, label: alt.slice(0, 60) || null, group, status: "found", items: 0, area: w * h });
  });
}

/**
 * Add or merge a menu source. The same PDF is often linked from a hub page ("All you can eat sushi")
 * and from the restaurant's own page: keep the restaurant page, since that's where its name and address are.
 */
export function addMenuSource(sources: MenuSource[], next: MenuSource): void {
  if (sources.length >= MAX_SOURCES) return;
  const existing = sources.find((s) => pageKey(s.url) === pageKey(next.url));
  if (!existing) {
    sources.push(next);
    return;
  }
  if (!existing.group && next.group) Object.assign(existing, { group: next.group, foundOn: next.foundOn, label: existing.label ?? next.label });
}

/** Width and height from attributes, or from Wix-style URL transforms ("/fit/w_1200,h_815/"). */
function imageSize(width: string | undefined, height: string | undefined, src: string): { w: number; h: number } {
  const w = Number(width);
  const h = Number(height);
  if (w && h) return { w, h };
  const m = src.match(/[,/]w_(\d+),h_(\d+)/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 0, h: 0 };
}

/**
 * The brand or location a page is about, from its <title> or h1: "SAKANA SUSHI | Dragon Factory" -> "Sakana Sushi".
 * Null for the home page, hub pages, and titles that are just the company name (see menus/brands.ts).
 */
export function pageGroup(ctx: Pick<PageContext, "$" | "url" | "kb" | "category">): string | null {
  const { $, url, kb, category } = ctx;
  if (category === "home" || new URL(url).pathname === "/") return null;
  return groupFromTitle(textOf($("title").first()) || textOf($("h1").first()), companyWords(kb, url));
}
