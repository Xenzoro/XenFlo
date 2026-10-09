import type { PageContext } from "./types";
import { addItem, clean, setField } from "../merge";
import { cleanUrl, siteHost } from "../url";

/** Read a <meta> tag by name or property (covers both OG and Twitter styles). */
export function meta(ctx: PageContext, key: string): string | null {
  const { $ } = ctx;
  return clean($(`meta[property="${key}"], meta[name="${key}"]`).first().attr("content"));
}

/**
 * Title, description, Open Graph / Twitter tags, theme color and icons.
 * Only the homepage's description is used as the company overview, since inner
 * page descriptions describe that page, not the business.
 */
export function extractMeta(ctx: PageContext): { title: string | null } {
  const { $, url, kb, category } = ctx;
  const title = clean($("title").first().text());

  if (category === "home") {
    const description = meta(ctx, "description") ?? meta(ctx, "og:description") ?? meta(ctx, "twitter:description");
    setField(kb.company.overview, description, url);

    const siteName = meta(ctx, "og:site_name") ?? meta(ctx, "application-name");
    if (siteName) setField(kb.company.name, siteName, url, "scraped");

    // Fall back to the homepage <title>: "Apex Hosting | Minecraft Servers" -> pick the part that looks like the brand.
    const fromTitle = nameFromTitle(title, url);
    if (fromTitle) setField(kb.company.name, fromTitle, url, "inferred");
  }

  // theme-color is the browser UI color the site chose: a strong brand color hint.
  const themeColor = meta(ctx, "theme-color") ?? meta(ctx, "msapplication-TileColor");
  if (themeColor && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(themeColor)) {
    addItem(kb.brand.colors, normalizeHex(themeColor), url, (v) => v);
  }

  // Icons are logo candidates (proper logo detection comes in the branding phase).
  $('link[rel~="apple-touch-icon"], link[rel~="icon"]').each((_, el) => {
    const href = cleanUrl($(el).attr("href") ?? "", url);
    if (!href) return;
    const rel = $(el).attr("rel") ?? "icon";
    addItem(kb.brand.logos, { url: href, kind: rel.includes("apple") ? "apple-touch-icon" : "favicon", alt: null }, url, (v) => v.url);
  });

  return { title };
}

export function normalizeHex(hex: string): string {
  let h = hex.toLowerCase();
  if (h.length === 4) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return h;
}

/**
 * Split a page title on common separators and choose the segment that best
 * matches the domain name (e.g. "apexminecrafthosting.com" -> "Apex Hosting").
 */
function nameFromTitle(title: string | null, url: string): string | null {
  if (!title) return null;
  const parts = title.split(/\s+[|\-–—:·•]\s+/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const domain = siteHost(url).split(".")[0].replace(/[^a-z0-9]/g, "");

  let best = parts[0];
  let bestScore = -1;
  for (const part of parts) {
    const words = part.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
    if (!words.length) continue;
    // Share of the segment's words that appear in the domain.
    const score = words.filter((w) => domain.includes(w)).length / words.length;
    if (score > bestScore) {
      best = part;
      bestScore = score;
    }
  }
  return best.length <= 60 ? best : null;
}
