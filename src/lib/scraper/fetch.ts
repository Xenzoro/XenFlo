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
 * Open a URL, following up to 5 redirects ourselves (not fetch's automatic redirect) so every
 * hop is checked: no localhost, private networks or cloud metadata (safety.ts).
 * Throws ScrapeError for blocked addresses and refused access (401/403/429) and non-2xx responses.
 * The caller reads (or cancels) the body.
 */
async function openChecked(url: string, signal: AbortSignal, accept: string): Promise<{ res: Response; url: string }> {
  let current = url;
  let res: Response;
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(current);
    res = await fetch(current, {
      redirect: "manual",
      signal,
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
    await res.body?.cancel();
    throw new ScrapeError("BLOCKED_ACCESS", `The site refused automated access (HTTP ${res.status}).`, res.status);
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new ScrapeError("HTTP_ERROR", `The site returned HTTP ${res.status}.`, res.status);
  }
  return { res, url: current };
}

/** Turn fetch's low-level errors into ScrapeErrors the UI can explain. */
function toScrapeError(err: unknown, timeoutMs: number): ScrapeError {
  if (err instanceof ScrapeError) return err;
  if (err instanceof Error && err.name === "AbortError") {
    return new ScrapeError("TIMEOUT", `The site took longer than ${timeoutMs / 1000}s to respond.`);
  }
  // Node's fetch throws TypeError("fetch failed") for DNS, TLS and connection errors.
  return new ScrapeError("UNREACHABLE", "We couldn't reach that website. Check the address and try again.");
}

/**
 * Fetch a page with a timeout, checking every redirect hop (see openChecked).
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
    const { res, url: finalUrl } = await openChecked(url, controller.signal, accept);
    const body = (await res.text()).slice(0, MAX_BODY_CHARS);
    // Bot-protection pages (Cloudflare "Just a moment...", etc.) sometimes come back as 200.
    if (BOT_CHALLENGE.test(body.slice(0, 5_000))) {
      throw new ScrapeError("BLOCKED_ACCESS", "The site is protected by a bot check.", res.status);
    }
    return {
      url: finalUrl,
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      body,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    throw toScrapeError(err, timeoutMs);
  } finally {
    clearTimeout(timer);
  }
}

export interface BinaryResult {
  url: string;
  contentType: string;
  bytes: Uint8Array;
  /** ETag or Last-Modified, when the server sends one */
  version: string | null;
  /** The file's own name, when the server gives one ("nabemenu (2).pdf") */
  fileName: string | null;
}

/**
 * A downloaded file's own name: Content-Disposition ("filename*=UTF-8''nabemenu%20%282%29.pdf" or
 * filename="...") or Wix's download parameter ("...pdf?dn=Captain+6+-+Menu+-+2026.pdf").
 */
export function fileNameFrom(contentDisposition: string | null, url: string): string | null {
  const cd = contentDisposition ?? "";
  const star = cd.match(/filename\*\s*=\s*(?:UTF-8|utf-8)?''([^;]+)/);
  const plain = cd.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/);
  const raw = star?.[1] ?? plain?.[1] ?? plain?.[2] ?? null;
  if (raw) {
    try {
      return decodeURIComponent(raw.trim());
    } catch {
      return raw.trim();
    }
  }
  try {
    return new URL(url).searchParams.get("dn");
  } catch {
    return null;
  }
}

/**
 * Download a file (menu PDFs) with the same redirect and private-network checks as pages,
 * plus a size cap: refused up front when Content-Length is too big, and cut off while
 * streaming when the server doesn't say. Throws ScrapeError("TOO_LARGE") over the cap.
 */
export async function fetchBinary(
  url: string,
  { maxBytes, timeoutMs = 15_000, accept = "application/pdf,*/*;q=0.5" }: { maxBytes: number; timeoutMs?: number; accept?: string },
): Promise<BinaryResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { res, url: finalUrl } = await openChecked(url, controller.signal, accept);
    const declared = Number(res.headers.get("content-length"));
    if (declared > maxBytes) {
      await res.body?.cancel();
      throw new ScrapeError("TOO_LARGE", `The file is ${mb(declared)}, over the ${mb(maxBytes)} limit.`);
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body?.getReader();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ScrapeError("TOO_LARGE", `The file is over the ${mb(maxBytes)} limit.`);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }
    return {
      url: finalUrl,
      contentType: res.headers.get("content-type") ?? "",
      bytes,
      version: res.headers.get("etag") ?? res.headers.get("last-modified"),
      fileName: fileNameFrom(res.headers.get("content-disposition"), finalUrl),
    };
  } catch (err) {
    throw toScrapeError(err, timeoutMs);
  } finally {
    clearTimeout(timer);
  }
}

const mb = (n: number) => `${(n / 1_048_576).toFixed(n < 10_485_760 ? 1 : 0)} MB`;

export function isHtml(contentType: string): boolean {
  return contentType === "" || /html|xml/i.test(contentType);
}
