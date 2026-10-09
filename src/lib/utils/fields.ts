/** Helpers for walking every Field ({ value, source, confidence, updatedAt }) in a knowledge base. */
import type { Confidence, Field } from "@/types/knowledge";

export function isField(x: unknown): x is Field<unknown> {
  return typeof x === "object" && x !== null && "value" in x && "confidence" in x && "updatedAt" in x;
}

export const isPlainObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Call `fn` on every Field inside `root` (single fields and list items). */
export function forEachField(root: unknown, fn: (f: Field<unknown>) => void): void {
  if (isField(root)) return fn(root);
  if (Array.isArray(root)) root.forEach((x) => forEachField(x, fn));
  else if (isPlainObject(root)) Object.values(root).forEach((x) => forEachField(x, fn));
}

/**
 * AI and inferred values always show their badge (not only in Advanced view), with a
 * "Wrong? Remove" button, so nobody mistakes them for facts stated on the site.
 */
export const isAi = (c: Confidence) => c === "ai_live" || c === "ai_mock" || c === "inferred";
