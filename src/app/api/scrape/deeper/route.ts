import { NextResponse } from "next/server";
import { z } from "zod";
import { digDeeper } from "@/lib/scraper";
import { badRequest, errorResponse } from "@/lib/utils/http";
import { knowledgeBaseSchema } from "@/types/knowledge.schema";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({ knowledgeBase: knowledgeBaseSchema });

/**
 * POST { knowledgeBase } -> { knowledgeBase }
 * Continues a crawl from the knowledge base's saved pending links ("Dig deeper").
 * The client sends the KB it has; once saving is wired up this can load it by id instead.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return badRequest("INVALID_REQUEST", "Send JSON like { \"knowledgeBase\": { ... } } from a previous scrape.");
  }

  try {
    const kb = await digDeeper(parsed.data.knowledgeBase);
    return NextResponse.json({ knowledgeBase: knowledgeBaseSchema.parse(kb) });
  } catch (err) {
    return errorResponse(err);
  }
}
