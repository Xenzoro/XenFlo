import type { Logo } from "@/types/knowledge";
import type { PageContext } from "./types";
import { addItem, clean } from "../merge";
import { cleanUrl } from "../url";
import { isNeutral, isSimilar, parseColor } from "../colors";
import { imageClue, titleCaseIfLower } from "./text";
import { meta } from "./meta";

/*
  Branding: logos, fonts, and brand colors.
  Logos are ranked by how sure we are (a header image with "logo" in it beats a favicon).
  Fonts and colors come from the CSS collected in styles.ts (homepage only).
*/

// Lower number = better logo candidate. The list is kept sorted by this.
const LOGO_RANK: Record<string, number> = {
  "header logo": 0,
  "logo image": 1,
  "json-ld logo": 2,
  "header image": 3,
  "apple-touch-icon": 4,
  "og:image": 5,
  favicon: 6,
};
const MAX_LOGOS = 8;
const LOGO_HINT = /logo|\bbrand(mark)?\b/i;
const PARTNER_CONTEXT = /partner|sponsor|client|affiliate|trusted by|as seen|featured/i;
const NOT_OWN_LOGO = /partner|client|sponsor|payment|visa|mastercard|paypal|trustpilot|badge|flag|award|seal|google|apple-store|app-store|play-store/i;

export function extractBranding(ctx: PageContext): void {
  extractLogos(ctx);
  if (ctx.css !== undefined) {
    extractFonts(ctx);
    extractColors(ctx);
  }
}

// ---------- Logos ----------

function extractLogos(ctx: PageContext): void {
  const { $, url, kb, category } = ctx;
  const isHome = category === "home";
  const partnerPage = PARTNER_CONTEXT.test(new URL(url).pathname);
  const add = (src: string | undefined, kind: string, alt: string | undefined) => {
    const href = src ? cleanUrl(src, url) : null;
    // The site's own logo is on the homepage; inner pages only contribute name clues.
    if (!href || !isHome || kb.brand.logos.length >= MAX_LOGOS) return;
    addItem<Logo>(kb.brand.logos, { url: href, kind, alt: imageClue(src, alt) }, url, (v) => v.url);
  };

  $("img").each((_, node) => {
    const img = $(node);
    const src = img.attr("src") ?? img.attr("data-src");
    const alt = img.attr("alt");
    // Look at the img and its wrapping link/div for "logo" hints.
    const hints = [src, alt, img.attr("class"), img.attr("id"), img.parent().attr("class"), img.closest("a").attr("class")].join(" ");
    if (NOT_OWN_LOGO.test(hints)) return;
    const inHeader = img.closest("header, nav, [class*=header i], [id*=header i]").length > 0;

    if (LOGO_HINT.test(hints)) {
      // Logos on a partners page or under a "Partners"/"As seen on" heading belong to other companies.
      const sectionHeading = img.parents().slice(0, 5).toArray().map((a) => $(a).find("h2, h3").first().text()).join(" ");
      if (partnerPage || PARTNER_CONTEXT.test(sectionHeading)) {
        const clue = imageClue(src, alt);
        if (clue) addItem(kb.customers.suppliersPartners, { name: clue, category: "partner" }, url, (v) => v.name.toLowerCase());
        return;
      }
      add(src, inHeader ? "header logo" : "logo image", alt);
      // A logo named differently from the company is probably a sub-brand ("Sumo Henderson").
      addAlternateName(ctx, imageClue(src, alt));
    } else if (inHeader && isHome && img.closest("header, nav").find("img").first().is(img)) {
      add(src, "header image", alt);
    }
  });

  if (isHome) {
    $('link[rel~="apple-touch-icon"]').each((_, el) => add($(el).attr("href"), "apple-touch-icon", undefined));
    const og = meta(ctx, "og:image");
    if (og) add(og, LOGO_HINT.test(og) ? "logo image" : "og:image", undefined);
    $('link[rel~="icon"]').each((_, el) => add($(el).attr("href"), "favicon", undefined));
  }

  kb.brand.logos.sort((a, b) => (LOGO_RANK[a.value?.kind ?? ""] ?? 9) - (LOGO_RANK[b.value?.kind ?? ""] ?? 9));
}

function addAlternateName(ctx: PageContext, clue: string | null): void {
  if (!clue || clue.length < 4) return;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const company = norm(ctx.kb.company.name.value ?? "");
  const c = norm(clue);
  if (!c || (company && (company.includes(c) || c.includes(company)))) return;
  addItem(ctx.kb.company.alternateNames, clean(clue, 60), ctx.url, (v) => norm(v), "inferred");
}

// ---------- Fonts ----------

const GENERIC_FONTS = /^(inherit|initial|unset|revert|serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|-apple-system|blinkmacsystemfont|segoe ui|roboto|helvetica neue|helvetica|arial|noto sans|liberation sans|apple color emoji|segoe ui emoji|segoe ui symbol|noto color emoji|sfmono-regular|menlo|monaco|consolas|courier new|courier|times new roman|times|georgia|verdana|tahoma)$/i;
const ICON_FONTS = /etmodules|fontawesome|font awesome|fa-|material icons|material symbols|icomoon|dashicons|eicons|elementor|glyphicons|bootstrap-icons|swiper-icons|slick|revicons|themify|ionicons|feather|lineicons|fontello|genericons|woocommerce|star|wix-?icons|socicon/i;

function extractFonts(ctx: PageContext): void {
  const { $, url, kb } = ctx;
  const css = ctx.css ?? "";
  const counts = new Map<string, number>();
  const bump = (name: string, by = 1) => {
    const font = cleanFontName(name);
    if (font) counts.set(font, (counts.get(font) ?? 0) + by);
  };

  // Google Fonts links are an explicit choice: weight them heavily.
  const googleHrefs = [
    ...$('link[href*="fonts.googleapis.com"]').map((_, el) => $(el).attr("href") ?? "").get(),
    ...[...css.matchAll(/@import\s+(?:url\()?["']?([^"')]*fonts\.googleapis\.com[^"')]*)/g)].map((m) => m[1]),
  ];
  for (const href of googleHrefs) {
    for (const family of googleFamilies(href)) bump(family, 10);
  }

  // font-family declarations, with var(--x) resolved from the CSS custom properties.
  const vars = cssVariables(css);
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    bump(firstFamily(resolveVars(m[1], vars)));
  }
  // Tailwind-style --font-* variables hold the stack directly.
  for (const [name, value] of vars) {
    if (/^--font-(sans|serif|heading|body|display|primary|base)/i.test(name)) bump(firstFamily(resolveVars(value, vars)), 2);
  }

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [font] of top) addItem(kb.brand.fonts, font, url, (v) => v.toLowerCase());
}

/** "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400&family=Lato" -> ["Open Sans", "Lato"] */
function googleFamilies(href: string): string[] {
  try {
    const u = new URL(href, "https://fonts.googleapis.com");
    return u.searchParams
      .getAll("family")
      .flatMap((f) => f.split("|"))
      .map((f) => f.split(":")[0].replace(/\+/g, " ").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function cssVariables(css: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
    if (!vars.has(m[1])) vars.set(m[1], m[2].trim());
  }
  return vars;
}

/** Replace var(--x, fallback) with the variable's value (a few levels deep). */
function resolveVars(value: string, vars: Map<string, string>): string {
  let out = value;
  for (let i = 0; i < 4 && out.includes("var("); i++) {
    out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, name: string, fallback?: string) => vars.get(name) ?? fallback ?? "");
  }
  return out;
}

function firstFamily(stack: string): string {
  return stack.split(",")[0]?.replace(/!important/i, "").trim() ?? "";
}

function cleanFontName(raw: string): string | null {
  const name = raw
    .replace(/["']/g, "")
    .replace(/\s+(variable|vf)$/i, "")
    .replace(/[-_]?fallback$/i, "")
    // Wix/Monotype web font ids: "avenir-lt-w01_35-light1475496" -> "avenir-lt", "HelveticaNeueW01-UltLt" -> "HelveticaNeue"
    .replace(/[-_ ]?w0\d.*$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || name.length > 40 || name.startsWith("var(") || GENERIC_FONTS.test(name) || ICON_FONTS.test(name)) return null;
  // Generated/hashed names like "__Inter_a1b2c3" or Wix "wfont_e381d2_..." aren't readable font names.
  if (/^__|wfont_|^[a-f0-9]{6,}/i.test(name)) return null;
  return titleCaseIfLower(name).replace(/\bLt\b/, "LT");
}

// ---------- Colors ----------

const BRAND_VAR = /^--[\w-]*(primary|brand|accent|secondary|main|theme)[\w-]*$/i;
// Variables that belong to bundled UI libraries, not the site's brand.
const LIBRARY_VAR = /^--(swiper|slick|splide|glide|tw|bs|fa|wp--preset|toastify|plyr|mejs)/i;
const MAX_COLORS = 6;

function extractColors(ctx: PageContext): void {
  const { kb, url } = ctx;
  const css = ctx.css ?? "";
  const picked: string[] = kb.brand.colors.map((c) => c.value).filter((v): v is string => !!v); // theme-color from meta.ts
  const take = (hex: string) => {
    if (picked.length >= MAX_COLORS || picked.some((p) => isSimilar(p, hex))) return;
    picked.push(hex);
    addItem(kb.brand.colors, hex, url, (v) => v);
  };

  // 1. Variables named like brand colors (--primary, --color-brand-500, --accent).
  const named: string[] = [];
  for (const [name, value] of cssVariables(css)) {
    if (!BRAND_VAR.test(name) || LIBRARY_VAR.test(name)) continue;
    const hex = parseColor(value);
    if (hex && !isNeutral(hex)) named.push(hex);
  }
  named.slice(0, 3).forEach(take);

  // 2. The most frequently used colors in the CSS.
  const counts = new Map<string, number>();
  for (const m of css.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi)) {
    const hex = parseColor(m[0]);
    if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  ranked.filter((hex) => !isNeutral(hex)).forEach(take);

  // 3. A black-and-white site: keep its dominant neutral so the swatch list isn't empty.
  if (!picked.length && ranked[0]) take(ranked[0]);
}
