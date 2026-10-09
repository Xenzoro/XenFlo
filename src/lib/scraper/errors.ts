/**
 * Typed scraper errors. Each code maps to a friendly message in the UI
 * and an HTTP status in the API route.
 */
export type ScrapeErrorCode =
  | "INVALID_URL"
  | "TIMEOUT"
  | "UNREACHABLE"
  | "BLOCKED_ROBOTS" // robots.txt disallows us
  | "ROBOTS_AI_RESTRICTED" // robots.txt shuts out AI crawlers (we ask the owner first)
  | "BLOCKED_ACCESS" // server refused us (401/403/429, bot challenge)
  | "HTTP_ERROR"
  | "NO_CONTENT"
  | "UNSUPPORTED_FILE" // upload fallback: wrong file type
  | "TOO_LARGE"; // upload fallback: file or text over the limit

export class ScrapeError extends Error {
  constructor(
    public code: ScrapeErrorCode,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ScrapeError";
  }
}
