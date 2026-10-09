import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteKnowledgeBase, getKnowledgeBase, updateKnowledgeBase } from "@/lib/db";
import { badRequest, errorResponse } from "@/lib/utils/http";
import { knowledgeBaseSchema } from "@/types/knowledge.schema";

export const runtime = "nodejs";

// In Next 15, route params arrive as a Promise
type Context = { params: Promise<{ id: string }> };

const idSchema = z.uuid();

const updateSchema = z.object({
  knowledgeBase: knowledgeBaseSchema,
  /** The version the user started editing from; a mismatch returns 409 */
  expectedVersion: z.number().int().min(1).optional(),
  note: z.string().max(200).optional(),
});

/** GET -> { knowledgeBase } (current version) */
export async function GET(_request: Request, { params }: Context) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return badRequest("INVALID_ID", "That isn't a valid knowledge base id.");
  try {
    return NextResponse.json({ knowledgeBase: await getKnowledgeBase(id.data) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PATCH { knowledgeBase, expectedVersion?, note? } -> { knowledgeBase } saved as the next version */
export async function PATCH(request: Request, { params }: Context) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return badRequest("INVALID_ID", "That isn't a valid knowledge base id.");
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return badRequest("INVALID_REQUEST", "Send JSON like { \"knowledgeBase\": { ... }, \"expectedVersion\": 1 }.");
  }
  try {
    const { knowledgeBase, expectedVersion, note } = parsed.data;
    const kb = await updateKnowledgeBase(id.data, knowledgeBase, { expectedVersion, note });
    return NextResponse.json({ knowledgeBase: kb });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE -> { deleted: true }. Its versions, crawl runs and consents go with it. */
export async function DELETE(_request: Request, { params }: Context) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return badRequest("INVALID_ID", "That isn't a valid knowledge base id.");
  try {
    await deleteKnowledgeBase(id.data);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
