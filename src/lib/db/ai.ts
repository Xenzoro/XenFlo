/**
 * AI cache and daily quota (tables from the 20261009165731_ai_enrichment migration).
 * When Supabase isn't configured, both fall back to memory. That is per server instance
 * and resets on restart: fine for local development, not a real cost cap.
 */
import { getDb } from "./client";

const memoryCache = new Map<string, unknown>();
const memoryUsage = new Map<string, number>();
const today = () => new Date().toISOString().slice(0, 10);

function db() {
  try {
    return getDb();
  } catch {
    return null; // NOT_CONFIGURED
  }
}

export async function getCachedEnrichment<T>(key: string): Promise<T | null> {
  const client = db();
  if (!client) return (memoryCache.get(key) as T) ?? null;
  const { data } = await client.from("ai_enrichments").select("result").eq("cache_key", key).maybeSingle();
  return (data?.result as T) ?? null;
}

export async function putCachedEnrichment(
  key: string,
  result: unknown,
  meta: { knowledgeBaseId: string; version: number; models: string },
): Promise<void> {
  const client = db();
  if (!client) {
    memoryCache.set(key, result);
    return;
  }
  // A failed cache write shouldn't fail the enrichment the user already paid for.
  await client.from("ai_enrichments").upsert({
    cache_key: key,
    knowledge_base_id: meta.knowledgeBaseId,
    version: meta.version,
    models: meta.models,
    result,
  });
}

/** Counts one live run if today's limit allows it. */
export async function takeAiQuota(limit: number): Promise<boolean> {
  const client = db();
  if (!client) {
    const used = memoryUsage.get(today()) ?? 0;
    if (used >= limit) return false;
    memoryUsage.set(today(), used + 1);
    return true;
  }
  const { data, error } = await client.rpc("take_ai_quota", { p_limit: limit });
  if (error) return false; // can't confirm the cap: stay safe and use preview mode
  return data === true;
}

export async function aiQuotaRemaining(limit: number): Promise<number | null> {
  const client = db();
  if (!client) return Math.max(0, limit - (memoryUsage.get(today()) ?? 0));
  const { data, error } = await client.rpc("ai_quota_remaining", { p_limit: limit });
  return error ? null : (data as number);
}
