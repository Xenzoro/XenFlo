/**
 * Shared API error handling. Every route returns errors as
 * { error: { code, message } } with a matching HTTP status.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ScrapeError, type ScrapeErrorCode } from "@/lib/scraper/errors";
import { DbError, type DbErrorCode } from "@/lib/db/errors";

const SCRAPE_STATUS: Record<ScrapeErrorCode, number> = {
  INVALID_URL: 400,
  PRIVATE_ADDRESS: 400,
  BLOCKED_ROBOTS: 403,
  BLOCKED_ACCESS: 403,
  ROBOTS_AI_RESTRICTED: 403,
  UNSUPPORTED_FILE: 415,
  TOO_LARGE: 413,
  NO_CONTENT: 422,
  HTTP_ERROR: 502,
  UNREACHABLE: 502,
  TIMEOUT: 504,
};

const DB_STATUS: Record<DbErrorCode, number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  NOT_CONFIGURED: 503,
  DB_ERROR: 500,
};

function json(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** 400 response for a request that failed validation. */
export function badRequest(code: string, message: string): NextResponse {
  return json(code, message, 400);
}

/** Turn any thrown error into a JSON error response. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ScrapeError) return json(err.code, err.message, SCRAPE_STATUS[err.code]);
  if (err instanceof DbError) {
    if (err.code === "DB_ERROR") console.error(err.message);
    return json(err.code, err.code === "DB_ERROR" ? "Something went wrong saving your data." : err.message, DB_STATUS[err.code]);
  }
  if (err instanceof ZodError) {
    // Our own data failed validation (e.g. a stored record from an older schema)
    console.error("Invalid data:", err.issues.slice(0, 5));
    return json("INVALID_DATA", "That knowledge base has data in an unexpected format.", 500);
  }
  console.error("Request failed:", err instanceof Error ? err.message : err);
  return json("INTERNAL", "Something went wrong. Please try again.", 500);
}
