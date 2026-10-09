/*
  Re-scrape support: start from a fresh scrape, then put back everything the owner
  edited by hand in the previous version, so refreshing never throws away their work.

  - A single Field marked user_edited replaces the fresh value at the same path.
  - In lists, user_edited items are appended unless the fresh list already has an equal value.
  - Only the content sections are merged; crawl info and the score come from the fresh scrape.
*/
import type { KnowledgeBase } from "@/types/knowledge";
import { scoreCompleteness } from "@/lib/scraper/score";
import { forEachField, isField, isPlainObject } from "./fields";

const CONTENT_KEYS = ["company", "contact", "customers", "brand", "people", "offerings", "insights", "contentKit"] as const;

const valueKey = (v: unknown) => JSON.stringify(v).toLowerCase();

/** Recursively overlay user edits from `prev` onto `fresh`. */
function overlay(fresh: unknown, prev: unknown): unknown {
  if (isField(prev)) return prev.confidence === "user_edited" ? prev : fresh;

  if (Array.isArray(prev) && Array.isArray(fresh)) {
    const have = new Set(fresh.map((f) => (isField(f) ? valueKey(f.value) : valueKey(f))));
    const edits = prev.filter((f) => isField(f) && f.confidence === "user_edited" && !have.has(valueKey(f.value)));
    return [...fresh, ...edits];
  }

  if (isPlainObject(prev) && isPlainObject(fresh)) {
    const out: Record<string, unknown> = { ...fresh };
    for (const key of Object.keys(fresh)) {
      if (key in prev) out[key] = overlay(fresh[key], prev[key]);
    }
    return out;
  }
  return fresh;
}

export function keepUserEdits(fresh: KnowledgeBase, previous: KnowledgeBase): KnowledgeBase {
  const merged: KnowledgeBase = { ...fresh, id: previous.id, version: previous.version, createdAt: previous.createdAt };
  for (const key of CONTENT_KEYS) {
    (merged as unknown as Record<string, unknown>)[key] = overlay(fresh[key], previous[key]);
  }
  // Consent was given for this business, so it carries over
  merged.consent = fresh.consent ?? previous.consent;
  merged.companyName = merged.company.name.value ?? fresh.companyName;
  merged.completeness = scoreCompleteness(merged);
  return merged;
}

/** How many user-edited values a knowledge base has (shown in the re-scrape confirm). */
export function countUserEdits(kb: KnowledgeBase): number {
  let count = 0;
  CONTENT_KEYS.forEach((k) => forEachField(kb[k], (f) => f.confidence === "user_edited" && count++));
  return count;
}
