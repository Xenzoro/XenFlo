import { NextResponse } from "next/server";
import { liveAvailable } from "@/lib/ai/config";
import { z } from "zod";
import type { UploadRecord } from "@/types/knowledge";
import { MAX_SCREENSHOT_BYTES, SCREENSHOT_TYPES, signedUploadUrl, uploadScreenshot } from "@/lib/db";
import { ScrapeError } from "@/lib/scraper/errors";
import { badRequest, errorResponse } from "@/lib/utils/http";

export const runtime = "nodejs";

// Field paths a screenshot can be marked as holding (see UploadPanel's "What does it show?")
const NEEDS = z.array(z.string().regex(/^[a-zA-Z.]+$/).max(60)).max(10);

/**
 * POST multipart { file, needs?, consent=true } -> { upload, url, aiAvailable }
 * Stores a screenshot privately. Reading it needs vision AI (Phase 8); until then
 * the record lists the fields it should fill.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof Blob)) return badRequest("INVALID_REQUEST", "Send a multipart form with a \"file\".");
  if (form.get("consent") !== "true") {
    return badRequest("CONSENT_REQUIRED", "Please confirm you own this business or have the owner's permission.");
  }
  const needs = NEEDS.safeParse(String(form.get("needs") ?? "").split(",").filter(Boolean));
  if (!needs.success) return badRequest("INVALID_REQUEST", "Invalid \"needs\" list.");

  try {
    if (!SCREENSHOT_TYPES.includes(file.type)) throw new ScrapeError("UNSUPPORTED_FILE", "Screenshots must be PNG, JPG or WebP images.");
    if (file.size > MAX_SCREENSHOT_BYTES) throw new ScrapeError("TOO_LARGE", "Screenshots can be up to 5 MB each.");
    const path = await uploadScreenshot(file, file.type);
    const name = (file instanceof File ? file.name : "") || "screenshot";
    const upload: UploadRecord = {
      id: crypto.randomUUID(),
      kind: "screenshot",
      name: name.slice(0, 200),
      size: file.size,
      path,
      uploadedAt: new Date().toISOString(),
      needsAiFields: needs.data,
    };
    // Only whether a key exists; nothing is sent to OpenAI here
    const aiAvailable = liveAvailable(); // key and passcode both configured
    return NextResponse.json({ upload, url: await signedUploadUrl(path), aiAvailable }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

/** GET ?path=demo/<file> -> { url } (a fresh signed link, valid one hour) */
export async function GET(request: Request) {
  const path = z
    .string()
    .regex(/^demo\/[0-9a-f-]{36}\.(png|jpg|webp)$/)
    .safeParse(new URL(request.url).searchParams.get("path"));
  if (!path.success) return badRequest("INVALID_REQUEST", "That isn't a valid upload path.");
  try {
    return NextResponse.json({ url: await signedUploadUrl(path.data) });
  } catch (err) {
    return errorResponse(err);
  }
}
