import { NextResponse } from "next/server";
import { ScrapeError, type ScrapeErrorCode } from "./errors";

const STATUS: Record<ScrapeErrorCode, number> = {
  INVALID_URL: 400,
  BLOCKED_ROBOTS: 403,
  BLOCKED_ACCESS: 403,
  NO_CONTENT: 422,
  HTTP_ERROR: 502,
  UNREACHABLE: 502,
  TIMEOUT: 504,
};

/** Turn any scraper error into a JSON response { error: { code, message } }. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ScrapeError) {
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: STATUS[err.code] });
  }
  console.error("Scrape failed:", err instanceof Error ? err.message : err);
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Something went wrong while reading that site." } },
    { status: 500 },
  );
}
