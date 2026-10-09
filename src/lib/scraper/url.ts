import { ScrapeError } from "./errors";

/**
 * Turn user input like "apexhosting.com" or "https://www.site.com/about"
 * into a clean absolute URL. Throws INVALID_URL if it can't be a website.
 */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new ScrapeError("INVALID_URL", "Please enter a website address.");

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new ScrapeError("INVALID_URL", "That doesn't look like a valid website address.");
  }

  // Require a real-looking hostname: has a dot, a 2+ letter TLD, no spaces.
  const host = url.hostname;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) || host.includes("..")) {
    throw new ScrapeError("INVALID_URL", "That doesn't look like a valid website address.");
  }

  url.hash = "";
  return url.toString();
}

/** Hostname without a leading "www." so www and bare domains count as the same site. */
export function siteHost(url: string): string {
  return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
}

export function isSameSite(a: string, b: string): boolean {
  try {
    return siteHost(a) === siteHost(b);
  } catch {
    return false;
  }
}

/** Same company domain, counting subdomains (billing.site.com is still site.com). */
export function isSameDomain(a: string, b: string): boolean {
  try {
    const [x, y] = [siteHost(a), siteHost(b)];
    return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
  } catch {
    return false;
  }
}

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_|ref$|_ga)/i;

/** Resolve a (possibly relative) href against a page and strip hash and tracking params. */
export function cleanUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    }
    // Avoid a dangling "?" when every param was a tracking param.
    if (!url.searchParams.size) url.search = "";
    // Treat "/about/index.html" as "/about/".
    url.pathname = url.pathname.replace(/\/index\.(html?|php)$/i, "/");
    // Treat "/about/" and "/about" as the same page.
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Identity of a page for "have we crawled this already?" checks.
 * Ignores protocol, "www.", trailing slashes, index files and query param order,
 * so https://www.site.com/pricing/ and http://site.com/pricing are the same page.
 */
export function pageKey(url: string): string {
  const cleaned = cleanUrl(url, url);
  if (!cleaned) return url;
  const u = new URL(cleaned);
  u.searchParams.sort();
  const path = u.pathname === "/" ? "" : u.pathname.toLowerCase();
  return `${siteHost(cleaned)}${path}${u.search}`;
}
