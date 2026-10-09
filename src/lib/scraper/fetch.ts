import { ScrapeError } from "./errors";

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

/**
 * Fetch a URL with a timeout. Follows redirects.
 * Throws ScrapeError for timeouts, network failures and non-2xx responses.
 */
export async function fetchPage(
  url: string,
  { timeoutMs = 10_000, accept = "text/html,application/xhtml+xml" } = {},
): Promise<FetchResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept,
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    });

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
      url: res.url || url,
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
