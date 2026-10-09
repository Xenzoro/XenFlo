import { NextResponse } from "next/server";
import { z } from "zod";
import { enrich } from "@/lib/ai/enrich";
import { aiConfig, liveAvailable, passcodeMatches } from "@/lib/ai/config";
import { aiQuotaRemaining } from "@/lib/db/ai";
import { badRequest, errorResponse } from "@/lib/utils/http";
import { knowledgeBaseSchema } from "@/types/knowledge.schema";
import type { EnrichStatus } from "@/types/enrichment";

// Node runtime for crypto and the prompt files. Two OpenAI calls run in parallel with a
// 25s timeout each, so 60s (the Vercel Hobby maximum without Fluid compute) is plenty.
export const runtime = "nodejs";
export const maxDuration = 60;

/** GET -> whether live AI is available and how many runs are left today. */
export async function GET() {
  const status: EnrichStatus = {
    liveAvailable: liveAvailable(),
    remainingToday: liveAvailable() ? await aiQuotaRemaining(aiConfig.dailyLimit) : null,
    textModel: aiConfig.textModel,
    visionModel: aiConfig.visionModel,
  };
  return NextResponse.json(status);
}

const bodySchema = z.object({
  knowledgeBase: z.unknown(),
  passcode: z.string().max(200).optional(),
  /** Skip live AI and return template suggestions */
  preview: z.boolean().optional(),
});

/** POST { knowledgeBase, passcode?, preview? } -> EnrichResult (suggestions to review; nothing is saved). */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("INVALID_REQUEST", "Send JSON like { \"knowledgeBase\": {...}, \"passcode\": \"...\" }.");
  const kb = knowledgeBaseSchema.safeParse(parsed.data.knowledgeBase);
  if (!kb.success) return badRequest("INVALID_DATA", "That knowledge base isn't in the expected format.");

  const { passcode, preview } = parsed.data;
  // A wrong passcode is an error the user can fix, not a silent switch to preview.
  if (!preview && liveAvailable() && !passcodeMatches(passcode)) {
    return NextResponse.json({ error: { code: "INVALID_PASSCODE", message: "That passcode isn't right." } }, { status: 401 });
  }

  try {
    return NextResponse.json(await enrich(kb.data, { preview: preview || !liveAvailable() }));
  } catch (err) {
    return errorResponse(err);
  }
}
