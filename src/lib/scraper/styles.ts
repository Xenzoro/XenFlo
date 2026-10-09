import type { CheerioAPI } from "cheerio";
import { fetchPage } from "./fetch";
import { cleanUrl, isSameSite } from "./url";

const MAX_SHEETS = 3;
const MAX_SHEET_CHARS = 600_000;
// Bundled UI libraries ship their own colors and fonts (Swiper's #007aff, icon fonts).
const LIBRARY_CSS = /swiper|slick|splide|glide|flickity|owl|bootstrap|font-?awesome|animate|aos|lightbox|fancybox|magnific|normalize|reset|jquery|select2|tippy|toastify|plyr/i;

/**
 * All CSS we can see for a page: <style> blocks, style="" attributes, and up to
 * three of the site's own stylesheets. Used for fonts and brand colors.
 * Third-party CSS (CDN frameworks, icon packs) is skipped on purpose.
 */
export async function collectCss($: CheerioAPI, pageUrl: string, isAllowed: (url: string) => boolean): Promise<string> {
  const parts: string[] = [];
  $("style").each((_, el) => {
    parts.push($(el).text());
  });
  $("[style]").each((_, el) => {
    parts.push(`x{${$(el).attr("style")}}`);
  });

  const sheets = $('link[rel~="stylesheet"][href]')
    .map((_, el) => cleanUrl($(el).attr("href") ?? "", pageUrl))
    .get()
    .filter((u): u is string => !!u && isSameSite(u, pageUrl) && isAllowed(u) && !LIBRARY_CSS.test(new URL(u).pathname))
    .slice(0, MAX_SHEETS);

  const fetched = await Promise.all(
    sheets.map((u) =>
      fetchPage(u, { timeoutMs: 6_000, accept: "text/css,*/*;q=0.1" })
        .then((res) => res.body.slice(0, MAX_SHEET_CHARS))
        .catch(() => ""),
    ),
  );
  return [...parts, ...fetched].join("\n");
}
