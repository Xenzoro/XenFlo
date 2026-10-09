import { NextResponse } from "next/server";
import { z } from "zod";
import { getVersion } from "@/lib/db";
import { badRequest, errorResponse } from "@/lib/utils/http";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; version: string }> };

const paramsSchema = z.object({ id: z.uuid(), version: z.coerce.number().int().min(1) });

/** GET -> { knowledgeBase } as it was saved at that version (used by "view" and "restore") */
export async function GET(_request: Request, { params }: Context) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return badRequest("INVALID_ID", "That isn't a valid knowledge base id or version.");
  try {
    return NextResponse.json({ knowledgeBase: await getVersion(parsed.data.id, parsed.data.version) });
  } catch (err) {
    return errorResponse(err);
  }
}
