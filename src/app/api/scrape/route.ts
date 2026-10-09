import { NextResponse } from "next/server";
import { z } from "zod";
import { scrapeSite, ScrapeError } from "@/lib/scraper";
import type { ScrapeErrorCode } from "@/lib/scraper/errors";
import { knowledgeBaseSchema } from "@/types/knowledge.schema";

// Cheerio and long-running fetches need the Node runtime, not Edge.
export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().min(1).max(2048),
  maxPages: z.number().int().min(1).max(30).optional(),
});

const STATUS: Record<ScrapeErrorCode, number> = {
  INVALID_URL: 400,
  BLOCKED_ROBOTS: 403,
  BLOCKED_ACCESS: 403,
  NO_CONTENT: 422,
  HTTP_ERROR: 502,
  UNREACHABLE: 502,
  TIMEOUT: 504,
};

/** POST { url } -> { knowledgeBase } or { error: { code, message } } */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_URL", message: "Send JSON like { \"url\": \"example.com\" }." } },
      { status: 400 },
    );
  }

  try {
    const kb = await scrapeSite(parsed.data.url, { maxPages: parsed.data.maxPages });
    // Validate our own output so schema drift shows up immediately during development.
    const knowledgeBase = knowledgeBaseSchema.parse(kb);
    return NextResponse.json({ knowledgeBase });
  } catch (err) {
    if (err instanceof ScrapeError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: STATUS[err.code] });
    }
    console.error("Scrape failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Something went wrong while reading that site." } },
      { status: 500 },
    );
  }
}
