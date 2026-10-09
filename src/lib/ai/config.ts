/**
 * AI settings, all from environment variables so models and limits change without code.
 * SERVER ONLY: reads the OpenAI key and the passcode.
 */
import { timingSafeEqual } from "node:crypto";

export const DEFAULT_MODEL = "gpt-5.4-mini";

export const aiConfig = {
  get apiKey() {
    return process.env.OPENAI_API_KEY?.trim() || null;
  },
  get textModel() {
    return process.env.AI_MODEL_TEXT?.trim() || DEFAULT_MODEL;
  },
  get visionModel() {
    return process.env.AI_MODEL_VISION?.trim() || DEFAULT_MODEL;
  },
  /** Live runs allowed per day across the whole site (cache hits don't count) */
  get dailyLimit() {
    const n = Number(process.env.AI_DAILY_LIMIT);
    return Number.isFinite(n) && process.env.AI_DAILY_LIMIT?.trim() ? Math.max(0, Math.floor(n)) : 20;
  },
  get passcode() {
    return process.env.AI_PASSCODE?.trim() || null;
  },
};

// Budgets: ~16k tokens in (system prompt + page evidence), ~3.5k out, 2 images, 25s per call.
// Phase 9 raised them from 12k/2.5k: the text call now reads every crawled page's headings
// and answers ~25 fields with evidence. Worst case is about $0.03 per run on gpt-5.4-mini.
export const LIMITS = {
  inputTokens: 16_000,
  outputTokens: 3_500,
  images: 2,
  timeoutMs: 25_000,
};

/**
 * Live AI needs a key AND a passcode set on the server. Without a passcode
 * we stay in preview mode, so a deploy that forgot it can't run up costs.
 */
export function liveAvailable(): boolean {
  return !!aiConfig.apiKey && !!aiConfig.passcode;
}

/** Constant-time compare so the passcode can't be guessed from response timing. */
export function passcodeMatches(given: string | undefined): boolean {
  const expected = aiConfig.passcode;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
