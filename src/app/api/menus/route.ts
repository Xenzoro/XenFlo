import { NextResponse } from "next/server";
import { z } from "zod";
import { readMenusWithAi } from "@/lib/ai/read-menus";
import { liveAvailable, passcodeMatches } from "@/lib/ai/config";
import { badRequest, errorResponse } from "@/lib/utils/http";
import { knowledgeBaseSchema } from "@/types/knowledge.schema";
import type { MenuReadResult } from "@/types/enrichment";

// "Read menus with AI": its own route and 60 s budget, so Enrich with AI stays text + vision only.
// Menus are read in parallel and nothing new starts after 40 s (see read-menus.ts).
export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  knowledgeBase: z.unknown(),
  passcode: z.string().max(200).optional(),
});

/** POST { knowledgeBase, passcode } -> MenuReadResult (new offerings + updated menu sources; nothing is saved). */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("INVALID_REQUEST", "Send JSON like { \"knowledgeBase\": {...}, \"passcode\": \"...\" }.");
  const kb = knowledgeBaseSchema.safeParse(parsed.data.knowledgeBase);
  if (!kb.success) return badRequest("INVALID_DATA", "That knowledge base isn't in the expected format.");

  // Reading pictures needs live AI; there is no preview version of it.
  if (!liveAvailable()) {
    const result: MenuReadResult = {
      mode: "unavailable",
      offerings: [],
      sources: [],
      read: 0,
      remaining: (kb.data.crawl.menuSources ?? []).filter((s) => ["found", "no_text", "messy"].includes(s.status)).length,
      cachedCount: 0,
      notes: ["Live AI isn't set up on this server, so menus in PDFs and images can't be read here. You can add items yourself."],
      remainingToday: null,
    };
    return NextResponse.json(result);
  }
  if (!passcodeMatches(parsed.data.passcode)) {
    return NextResponse.json({ error: { code: "INVALID_PASSCODE", message: "That passcode isn't right." } }, { status: 401 });
  }

  try {
    return NextResponse.json(await readMenusWithAi(kb.data));
  } catch (err) {
    return errorResponse(err);
  }
}
