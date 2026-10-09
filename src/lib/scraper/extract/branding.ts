import type { Logo } from "@/types/knowledge";
import type { PageContext } from "./types";
import { addItem, clean } from "../merge";
import { cleanUrl } from "../url";
import { isNeutral, isPlatformDefault, isSimilar, parseColor } from "../colors";
import { imageClue, isDescriptive, titleCaseIfLower } from "./text";
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
    const markup = [src, img.attr("class"), img.attr("id"), img.parent().attr("class"), img.closest("a").attr("class")].join(" ");
    if (NOT_OWN_LOGO.test(`${markup} ${alt ?? ""}`)) return;
    const inHeader = img.closest("header, nav, [class*=header i], [id*=header i]").length > 0;
    // Alt text alone only counts when it names a logo ("Acme logo"), not when it describes
    // a photo that happens to show one ("Person holding a wrench in front of the logo").
    const altSaysLogo = !!alt && LOGO_HINT.test(alt) && !isDescriptive(alt);

    if (LOGO_HINT.test(markup) || altSaysLogo) {
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
  // Brand names are short; longer text is a tagline or a photo caption.
  if (!clue || clue.length < 4 || isDescriptive(clue) || clue.split(/\s+/).length > 5) return;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  // On inner pages, only trust a logo name that matches the page itself
  // ("Neko Loco" logo on /neko-loco-sushi), so random images don't become brands.
  if (ctx.category !== "home") {
    const pageText = `${new URL(ctx.url).pathname} ${ctx.$("title").text()}`.toLowerCase();
    const words = clue.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
    if (!words.some((w) => pageText.includes(w))) return;
  }
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
  // Hyphens became spaces above, so also test the hyphenated form ("ui sans serif" -> "ui-sans-serif").
  const generic = GENERIC_FONTS.test(name) || GENERIC_FONTS.test(name.replace(/ /g, "-"));
  if (!name || name.length > 40 || name.startsWith("var(") || generic || ICON_FONTS.test(name)) return null;
  // Generated/hashed names like "__Inter_a1b2c3" or Wix "wfont_e381d2_..." aren't readable font names.
  if (/^__|wfont_|^[a-f0-9]{6,}/i.test(name)) return null;
  return titleCaseIfLower(name).replace(/\bLt\b/, "LT");
}

// ---------- Colors ----------

/*
  Colors are ranked by where the site actually uses them, not where they're defined:
  a color on buttons and CTAs counts most, then header/nav, then links, then anything else.
  Rules that only style plugin or block library markup (.wp-block-*, .kadence-*...) count for nothing,
  since those carry the plugin's defaults rather than the brand.
*/
const BRAND_VAR = /^--[\w-]*(primary|brand|accent|secondary|main|theme)[\w-]*$/i;
// Variables that belong to bundled UI libraries, not the site's brand.
const LIBRARY_VAR = /^--(swiper|slick|splide|glide|tw|bs|fa|wp--preset|wp-admin|toastify|plyr|mejs)/i;
// Selectors for plugin and block library markup, plus WordPress's preset color utility classes.
const LIBRARY_SELECTOR = /\.(wp-|kadence-|kb-|elementor-|e-con|swiper-|slick-|has-[\w-]*color)|#wpadminbar/i;
const BUTTON_SELECTOR = /button|\bbtn|cta|\[type=["']?submit/i;
const HEADER_SELECTOR = /header|\bnav|menu|topbar|top-bar/i;
const LINK_SELECTOR = /(^|[\s>+~])a([:.[\s]|$)|link/i;
const MAX_COLORS = 6;

/** How much a selector tells us about brand usage. 0 = plugin-only rule, ignore it. */
function selectorWeight(selectorList: string): number {
  const own = selectorList.split(",").map((s) => s.trim()).filter((s) => s && !LIBRARY_SELECTOR.test(s));
  if (!own.length) return 0;
  const joined = own.join(",");
  if (BUTTON_SELECTOR.test(joined)) return 6;
  if (HEADER_SELECTOR.test(joined)) return 4;
  if (LINK_SELECTOR.test(joined)) return 2;
  return 1;
}

/** Background and text color matter most; borders, fills and shadows are supporting colors. */
function propertyWeight(prop: string): number {
  if (/^(background(-color)?|color)$/.test(prop)) return 1;
  if (/^(border|border-[\w-]*color|border-(top|right|bottom|left)|fill|stroke|outline(-color)?|box-shadow|text-decoration-color)$/.test(prop)) return 0.5;
  return 0;
}

function colorsIn(value: string): string[] {
  return [...value.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|oklch\([^)]*\)/gi)]
    .map((m) => parseColor(m[0]))
    .filter((hex): hex is string => !!hex);
}

function extractColors(ctx: PageContext): void {
  const { $, kb, url } = ctx;
  const css = ctx.css ?? "";
  const vars = cssVariables(css); // from every rule, so plugin-defined palettes still resolve where the site uses them
  const scores = new Map<string, number>();
  const usedVars = new Set<string>();

  const score = (decls: string, weight: number) => {
    for (const d of decls.matchAll(/([\w-]+)\s*:\s*([^;]+)/g)) {
      const prop = d[1].toLowerCase();
      const w = weight * propertyWeight(prop);
      if (!w) continue;
      for (const v of d[2].matchAll(/var\(\s*(--[\w-]+)/g)) usedVars.add(v[1]);
      for (const hex of colorsIn(resolveVars(d[2], vars))) scores.set(hex, (scores.get(hex) ?? 0) + w);
    }
  };

  // 1. Stylesheet rules (innermost blocks, so rules inside @media count too).
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    if (selector === "x" || selector.startsWith("@")) continue; // "x{...}" is an inline style, scored below
    const weight = selectorWeight(selector);
    if (weight) score(m[2], weight);
  }

  // 2. Inline style="" attributes, weighted by the element they sit on.
  $("[style]").each((_, node) => {
    const el = $(node);
    const hints = `${node.tagName} ${el.attr("class") ?? ""} ${el.attr("id") ?? ""}`;
    if (LIBRARY_SELECTOR.test(hints.split(/\s+/).map((c) => `.${c}`).join(" "))) return;
    const weight = BUTTON_SELECTOR.test(hints) || node.tagName === "button" ? 6 : el.closest("header, nav").length ? 4 : node.tagName === "a" ? 2 : 1;
    score(el.attr("style") ?? "", weight);
  });

  // 3. Small bonus for colors kept in brand-named variables the site actually uses (--primary, --brand-500).
  for (const name of usedVars) {
    const value = vars.get(name);
    if (!value || !BRAND_VAR.test(name) || LIBRARY_VAR.test(name)) continue;
    for (const hex of colorsIn(resolveVars(value, vars))) scores.set(hex, (scores.get(hex) ?? 0) + 2);
  }

  const picked: string[] = kb.brand.colors.map((c) => c.value).filter((v): v is string => !!v); // theme-color from meta.ts
  const take = (hex: string) => {
    if (picked.length >= MAX_COLORS || picked.some((p) => isSimilar(p, hex))) return;
    picked.push(hex);
    addItem(kb.brand.colors, hex, url, (v) => v);
  };
  const ranked = [...scores.entries()]
    .filter(([hex]) => !isPlatformDefault(hex))
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);
  ranked.filter((hex) => !isNeutral(hex)).forEach(take);

  // 4. A black-and-white site: keep its dominant neutral so the swatch list isn't empty.
  if (!picked.length && ranked[0]) take(ranked[0]);
}
