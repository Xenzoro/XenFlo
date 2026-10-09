import { ScrapeError } from "./errors";
import { assertPublicUrl } from "./safety";

export const USER_AGENT = process.env.SCRAPER_USER_AGENT || "XenFloBot/1.0 (knowledge base builder)";

export interface FetchResult {
  /** Final URL after redirects */
  url: string;
  status: number;
  contentType: string;
  body: string;
  durationMs: number;
}

const BOT_CHALLENGE = /<title>(Just a moment\.\.\.|Attention Required|Access denied|Pardon Our Interruption)|challenges\.cloudflare\.com\/cdn-cgi|_Incapsula_Resource/i;

const MAX_BODY_CHARS = 3_000_000; // ignore anything past ~3MB of HTML
const MAX_REDIRECTS = 5;

/**
 * Fetch a URL with a timeout. Follows up to 5 redirects itself (not fetch's automatic
 * redirect), so every hop is checked: no localhost, private networks or cloud metadata (safety.ts).
 * Throws ScrapeError for blocked addresses, timeouts, network failures and non-2xx responses.
 */
export async function fetchPage(
  url: string,
  { timeoutMs = 10_000, accept = "text/html,application/xhtml+xml" } = {},
): Promise<FetchResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let current = url;
    let res: Response;
    for (let hop = 0; ; hop++) {
      await assertPublicUrl(current);
      res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: accept,
          "Accept-Language": "en-US,en;q=0.9",
        },
        cache: "no-store",
      });
      const location = res.headers.get("location");
      if (res.status < 300 || res.status >= 400 || !location) break;
      if (hop >= MAX_REDIRECTS) throw new ScrapeError("HTTP_ERROR", "The site redirected too many times.", res.status);
      await res.body?.cancel(); // we only need the Location header
      current = new URL(location, current).toString(); // relative redirects resolve against the current URL
    }

    if (res.status === 401 || res.status === 403 || res.status === 429) {
      throw new ScrapeError(
        "BLOCKED_ACCESS",
        `The site refused automated access (HTTP ${res.status}).`,
        res.status,
      );
    }
    if (!res.ok) {
      throw new ScrapeError("HTTP_ERROR", `The site returned HTTP ${res.status}.`, res.status);
    }

    const body = (await res.text()).slice(0, MAX_BODY_CHARS);
    // Bot-protection pages (Cloudflare "Just a moment...", etc.) sometimes come back as 200.
    if (BOT_CHALLENGE.test(body.slice(0, 5_000))) {
      throw new ScrapeError("BLOCKED_ACCESS", "The site is protected by a bot check.", res.status);
    }
    return {
      url: current,
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      body,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    if (err instanceof ScrapeError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ScrapeError("TIMEOUT", `The site took longer than ${timeoutMs / 1000}s to respond.`);
    }
    // Node's fetch throws TypeError("fetch failed") for DNS, TLS and connection errors.
    throw new ScrapeError("UNREACHABLE", "We couldn't reach that website. Check the address and try again.");
  } finally {
    clearTimeout(timer);
  }
}

export function isHtml(contentType: string): boolean {
  return contentType === "" || /html|xml/i.test(contentType);
}
