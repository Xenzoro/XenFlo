import { NextResponse } from "next/server";
import { z } from "zod";
import { extractContent, MAX_CONTENT_CHARS } from "@/lib/scraper/content";
import { normalizeUrl } from "@/lib/scraper/url";
import { emptyKnowledgeBase } from "@/lib/utils/knowledge";
import { badRequest, errorResponse } from "@/lib/utils/http";
import { knowledgeBaseSchema } from "@/types/knowledge.schema";

export const runtime = "nodejs";

const bodySchema = z.object({
  kind: z.enum(["text", "html"]),
  // A little over the extractor limit so it can answer with a friendly TOO_LARGE
  content: z.string().min(1).max(MAX_CONTENT_CHARS + 1000),
  name: z.string().min(1).max(200),
  /** The site this content belongs to, when starting a new knowledge base */
  url: z.string().max(2048).optional(),
  /** Add to this knowledge base instead of starting a new one ("Add info yourself") */
  knowledgeBase: knowledgeBaseSchema.optional(),
  /** Required: "I own this business or have permission from the owner..." */
  consent: z.object({ confirmed: z.literal(true), method: z.enum(["checkbox_paste", "checkbox_upload"]) }),
});

/**
 * POST { kind, content, name, url?, knowledgeBase?, consent } -> { knowledgeBase }
 * Runs pasted text or uploaded HTML through the same extractors as a scrape.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const consentMissing = parsed.error.issues.some((i) => i.path[0] === "consent");
    return badRequest(
      consentMissing ? "CONSENT_REQUIRED" : "INVALID_REQUEST",
      consentMissing ? "Please confirm you own this business or have the owner's permission." : "Send JSON like { \"kind\": \"text\", \"content\": \"...\", \"name\": \"pasted-text\", \"consent\": { ... } }.",
    );
  }
  const { kind, content, name, url, knowledgeBase, consent } = parsed.data;
  try {
    const base = knowledgeBase ?? emptyKnowledgeBase(url ? normalizeUrl(url) : "https://uploaded.content/");
    if (!knowledgeBase) base.crawl.finishedAt = base.crawl.startedAt;
    const kb = extractContent(base, { kind, content, name });
    kb.consent = { confirmed: true, timestamp: new Date().toISOString(), method: consent.method };
    return NextResponse.json({ knowledgeBase: knowledgeBaseSchema.parse(kb) });
  } catch (err) {
    return errorResponse(err);
  }
}
