/*
  Browser-side wrappers for our API routes. Every call resolves to either
  { data } or { error: { code, message } } and never throws, so components
  can handle failures with a simple if.
*/
import type { KnowledgeBase } from "@/types/knowledge";

export interface ApiError {
  code: string;
  message: string;
}

export type ApiResult<T> = { data: T; error?: undefined } | { data?: undefined; error: ApiError };

async function call<T>(url: string, init: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      // Vercel/Next timeouts return HTML, not our JSON error shape
      if (body?.error?.code) return { error: body.error };
      return { error: { code: res.status === 504 ? "TIMEOUT" : "INTERNAL", message: `Request failed (${res.status}).` } };
    }
    return { data: body as T };
  } catch {
    return { error: { code: "NETWORK", message: "Couldn't reach the XenFlo server." } };
  }
}

const post = <T>(url: string, body: unknown) => call<T>(url, { method: "POST", body: JSON.stringify(body) });

type KbResponse = { knowledgeBase: KnowledgeBase };

export async function scrapeUrl(url: string): Promise<ApiResult<KnowledgeBase>> {
  const res = await post<KbResponse>("/api/scrape", { url });
  return res.error ? res : { data: res.data.knowledgeBase };
}

export async function digDeeper(kb: KnowledgeBase): Promise<ApiResult<KnowledgeBase>> {
  const res = await post<KbResponse>("/api/scrape/deeper", { knowledgeBase: kb });
  return res.error ? res : { data: res.data.knowledgeBase };
}

/** First save creates a record (POST); later saves add a version (PATCH). */
export async function saveKnowledge(kb: KnowledgeBase, saved: { id: string; version: number } | null): Promise<ApiResult<KnowledgeBase>> {
  const res = saved
    ? await call<KbResponse>(`/api/knowledge/${saved.id}`, {
        method: "PATCH",
        body: JSON.stringify({ knowledgeBase: kb, expectedVersion: saved.version }),
      })
    : await post<KbResponse>("/api/knowledge", { knowledgeBase: kb });
  return res.error ? res : { data: res.data.knowledgeBase };
}
