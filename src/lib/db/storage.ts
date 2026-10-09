/**
 * Screenshot storage in the private Supabase "uploads" bucket (see the Phase 6 migration).
 * Files are never public: the browser gets short-lived signed URLs from the server.
 */
import { getDb } from "./client";
import { DbError } from "./errors";

const BUCKET = "uploads";
const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
export const SCREENSHOT_TYPES = Object.keys(EXTENSIONS);

/** Store one screenshot; returns its storage path. No login in the demo, so everything goes under "demo/". */
export async function uploadScreenshot(file: Blob, contentType: string): Promise<string> {
  const path = `demo/${crypto.randomUUID()}.${EXTENSIONS[contentType] ?? "bin"}`;
  const { error } = await getDb().storage.from(BUCKET).upload(path, file, { contentType, upsert: false });
  if (error) throw new DbError("DB_ERROR", `Storage error: ${error.message}`);
  return path;
}

/** A link to a stored screenshot that works for one hour. */
export async function signedUploadUrl(path: string): Promise<string> {
  const { data, error } = await getDb().storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data) throw new DbError("NOT_FOUND", "That file doesn't exist.");
  return data.signedUrl;
}
