import { NextResponse } from "next/server";
import { z } from "zod";
import { createKnowledgeBase, listKnowledgeBases } from "@/lib/db";
import { badRequest, errorResponse } from "@/lib/utils/http";
import { knowledgeBaseSchema } from "@/types/knowledge.schema";

export const runtime = "nodejs";

const saveSchema = z.object({
  knowledgeBase: knowledgeBaseSchema,
  note: z.string().max(200).optional(),
});

/** POST { knowledgeBase, note? } -> 201 { knowledgeBase } saved as version 1 with a new id. */
export async function POST(request: Request) {
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return badRequest("INVALID_REQUEST", "Send JSON like { \"knowledgeBase\": { ... } } from a scrape.");
  }
  try {
    const kb = await createKnowledgeBase(parsed.data.knowledgeBase, { note: parsed.data.note });
    return NextResponse.json({ knowledgeBase: kb }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

// Query strings are always text, so numbers are coerced. Empty values count as "not set".
const blank = (v: unknown) => (v === "" ? undefined : v);
const listQuerySchema = z.object({
  q: z.preprocess(blank, z.string().max(100).optional()),
  industry: z.preprocess(blank, z.string().max(100).optional()),
  minScore: z.preprocess(blank, z.coerce.number().int().min(0).max(100).optional()),
  maxScore: z.preprocess(blank, z.coerce.number().int().min(0).max(100).optional()),
  from: z.preprocess(blank, z.iso.date().or(z.iso.datetime()).optional()),
  to: z.preprocess(blank, z.iso.date().or(z.iso.datetime()).optional()),
  sort: z.preprocess(
    blank,
    z
      .enum([
        "updated_desc",
        "updated_asc",
        "name_asc",
        "name_desc",
        "industry_asc",
        "industry_desc",
        "completeness_desc",
        "completeness_asc",
        "version_desc",
        "version_asc",
      ])
      .optional(),
  ),
  limit: z.preprocess(blank, z.coerce.number().int().min(1).max(100).optional()),
  offset: z.preprocess(blank, z.coerce.number().int().min(0).optional()),
});

/** GET ?q&industry&minScore&maxScore&from&to&sort&limit&offset -> { items, total } */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = listQuerySchema.safeParse(params);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return badRequest("INVALID_QUERY", `Invalid "${issue.path.join(".")}": ${issue.message}`);
  }
  try {
    return NextResponse.json(await listKnowledgeBases(parsed.data));
  } catch (err) {
    return errorResponse(err);
  }
}
