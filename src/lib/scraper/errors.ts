/**
 * Typed scraper errors. Each code maps to a friendly message in the UI
 * and an HTTP status in the API route.
 */
export type ScrapeErrorCode =
  | "INVALID_URL"
  | "TIMEOUT"
  | "UNREACHABLE"
  | "BLOCKED_ROBOTS" // robots.txt disallows us
  | "BLOCKED_ACCESS" // server refused us (401/403/429, bot challenge)
  | "HTTP_ERROR"
  | "NO_CONTENT";

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
