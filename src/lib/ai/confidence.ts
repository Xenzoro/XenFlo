/**
 * The confidence bar, enforced in code (the prompt asks for it too, but we don't rely on that).
 *
 * Facts (industry, channels, business model...): only "high" passes, and only with at least
 * 2 real evidence items, or 1 quote that contains the value itself.
 * Generated fields (pitch, writing style, Content Kit...): written rather than looked up, so they
 * pass when the model marks them high or medium AND cites at least 1 real evidence item.
 * A citation is "real" when it's an id from the input or a quote found in the input.
 */
import { GENERATED_FIELDS } from "./field-tiers";
import { resolveCitation, type Evidence } from "./evidence";

export type ModelConfidence = "high" | "medium" | "low";

export interface Answer {
  confidence: ModelConfidence;
  /** Raw citations from the model: ids ("p3") or quotes */
  evidence: string[];
  reason: string | null;
}

export interface Verdict {
  ok: boolean;
  /** Citations that checked out, made readable for the owner */
  evidence: string[];
  /** Why it was held back (only when !ok) */
  reason: string;
}

/** `values`: the suggested value(s) as text, for the "quote contains the value" check. */
export function checkAnswer(path: string, answer: Answer, values: string[], e: Evidence, inputLower: string): Verdict {
  const real = [...new Set(answer.evidence.map((c) => resolveCitation(c, e, inputLower)).filter((c): c is string => !!c))];
  // A direct quote (not an id) that exists in the input and contains the value counts on its own.
  const isId = (c: string) => e.items.some((i) => i.id === c.trim().replace(/^\[|\]$/g, ""));
  const quoteHasValue = answer.evidence.some(
    (c) => !isId(c) && resolveCitation(c, e, inputLower) !== null && values.some((v) => v.length >= 3 && c.toLowerCase().includes(v.toLowerCase())),
  );

  if (GENERATED_FIELDS.has(path)) {
    const ok = answer.confidence !== "low" && real.length >= 1;
    return { ok, evidence: real, reason: ok ? "" : answer.reason || (real.length ? "The AI wasn't confident in this one." : "Nothing in your site to base it on.") };
  }
  const ok = answer.confidence === "high" && (real.length >= 2 || quoteHasValue);
  const reason =
    answer.reason ||
    (answer.confidence !== "high"
      ? `Only ${answer.confidence} confidence.`
      : real.length === 1
        ? "Only one piece of evidence points to it."
        : "The evidence cited couldn't be found on your site.");
  return { ok, evidence: real, reason: ok ? "" : reason };
}
