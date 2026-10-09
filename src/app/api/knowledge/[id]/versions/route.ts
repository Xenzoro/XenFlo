import { NextResponse } from "next/server";
import { z } from "zod";
import { listVersions } from "@/lib/db";
import { badRequest, errorResponse } from "@/lib/utils/http";

export const runtime = "nodejs";

/** GET -> { versions: [{ version, completeness, note, createdAt }] }, newest first */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return badRequest("INVALID_ID", "That isn't a valid knowledge base id.");
  try {
    return NextResponse.json({ versions: await listVersions(id.data) });
  } catch (err) {
    return errorResponse(err);
  }
}
