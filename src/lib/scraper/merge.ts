import type { Confidence, Field, FieldList } from "@/types/knowledge";
import { field } from "@/lib/utils/knowledge";

/*
  Small helpers extractors use to write into the knowledge base.
  Rule of thumb: the first good value wins (homepage and JSON-LD run first),
  but a scraped value may replace an inferred one.
*/

const RANK: Record<Confidence, number> = {
  missing: 0,
  ai_mock: 1,
  inferred: 2,
  ai_live: 3,
  scraped: 4,
  user_edited: 5,
};

/** Set a scalar field unless it already holds an equal-or-better value. */
export function setField<T>(
  target: Field<T>,
  value: T | null | undefined,
  source: string,
  confidence: Confidence = "scraped",
  /** Short quotes the value was read from, shown in the badge tooltip */
  evidence?: string[],
): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string" && !value.trim()) return;
  if (RANK[target.confidence] >= RANK[confidence]) return;
  Object.assign(target, field(value, source, confidence));
  // Don't keep the evidence of the value being replaced
  if (evidence?.length) target.evidence = evidence;
  else delete target.evidence;
}

/**
 * Add an item to a list unless an item with the same key is already there.
 * `key` decides what counts as a duplicate (defaults to lowercased JSON).
 */
export function addItem<T>(
  list: FieldList<T>,
  value: T | null | undefined,
  source: string,
  key: (v: T) => string = (v) => JSON.stringify(v).toLowerCase(),
  confidence: Confidence = "scraped",
): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string" && !value.trim()) return;
  const k = key(value);
  if (list.some((item) => item.value !== null && key(item.value) === k)) return;
  list.push(field(value, source, confidence));
}

/** Collapse whitespace and trim; returns null for empty strings. */
export function clean(text: string | null | undefined, maxLength = 2000): string | null {
  if (!text) return null;
  const out = text.replace(/\s+/g, " ").trim();
  return out ? out.slice(0, maxLength) : null;
}
