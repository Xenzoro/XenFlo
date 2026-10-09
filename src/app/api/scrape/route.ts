import { NextResponse } from "next/server";
import { z } from "zod";
import { scrapeSite } from "@/lib/scraper";
import { badRequest, errorResponse } from "@/lib/utils/http";
import { knowledgeBaseSchema } from "@/types/knowledge.schema";

// Cheerio and long-running fetches need the Node runtime, not Edge.
export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().min(1).max(2048),
  maxPages: z.number().int().min(1).max(30).optional(),
});

/** POST { url } -> { knowledgeBase } or { error: { code, message } } */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return badRequest("INVALID_URL", "Send JSON like { \"url\": \"example.com\" }.");
  }

  try {
    const kb = await scrapeSite(parsed.data.url, { maxPages: parsed.data.maxPages });
    // Validate our own output so schema drift shows up immediately during development.
    return NextResponse.json({ knowledgeBase: knowledgeBaseSchema.parse(kb) });
  } catch (err) {
    return errorResponse(err);
  }
}
