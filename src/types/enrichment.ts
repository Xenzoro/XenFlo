/**
 * Shapes shared by the enrichment API and the review modal.
 * The server proposes suggestions; nothing is applied until the owner accepts it.
 */

import type { Field, MenuSource, Offering } from "./knowledge";

export type EnrichMode = "live" | "mock";

export interface Suggestion {
  /** Dot path into the knowledge base, e.g. "company.pitch" or "contentKit.hashtags" */
  path: string;
  /** Friendly field name for the review list */
  label: string;
  /** A string for scalar fields, a list of strings for list fields, or a VoiceGuide object */
  value: unknown;
  /** true when `path` is a list: accepted values are added as new items */
  list: boolean;
  /** ai_live = real model, ai_mock = template preview, inferred = keyword/CTA heuristics */
  confidence: "ai_live" | "ai_mock" | "inferred";
  /** Where this came from: "ai:gpt-5.4-mini", "ai:preview" or "heuristic" */
  source: string;
  /** The evidence behind it, readable: "/sakana: Sakana Las Vegas…" or a short quote */
  basedOn: string[];
  /** For per-offering category suggestions: which offering (path is "offerings.<index>.category") */
  offering?: { index: number; name: string };
  /** Dismissal identity when the value alone isn't enough (offering categories: name + category) */
  dismissKey?: string;
}

/** A field the AI looked at but couldn't support well enough to suggest. */
export interface NotEnough {
  path: string;
  label: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface EnrichResult {
  mode: EnrichMode;
  /** Models used (empty in mock mode) */
  models: { text: string | null; vision: string | null };
  /** True when this came from the cache (no new AI call, no quota used) */
  cached: boolean;
  suggestions: Suggestion[];
  /** Fields the AI couldn't fill from the facts it had */
  missing: string[];
  /** Fields left empty because the evidence wasn't strong enough, with the reason */
  notEnough: NotEnough[];
  /** One-line hint, e.g. "Re-scrape for better results." for records scraped before page evidence existed */
  hint: string | null;
  /** Why we fell back to preview mode, or other notes for the user */
  notes: string[];
  /** Live runs left today (null when unknown) */
  remainingToday: number | null;
  /** Tokens and time per live call, for comparing models */
  usage?: { text?: CallUsage; vision?: CallUsage };
}

export interface CallUsage {
  input: number;
  output: number;
  ms: number;
}

export interface EnrichStatus {
  /** An OpenAI key and a passcode are configured on the server */
  liveAvailable: boolean;
  remainingToday: number | null;
  textModel: string;
  visionModel: string;
}

/** "Read menus with AI" (/api/menus): new menu items and updated menu sources, merged by the client. */
export interface MenuReadResult {
  /** "live": AI ran (or every menu came from the cache). "unavailable": no key, no passcode or no quota left. */
  mode: "live" | "unavailable";
  /** New offerings to add (already filtered against dismissed and existing items) */
  offerings: Field<Offering>[];
  /** The menu sources this run touched, with their new status and item counts (matched by url) */
  sources: MenuSource[];
  /** Menus read this run, menus still waiting, and how many came from the cache (free) */
  read: number;
  remaining: number;
  cachedCount: number;
  notes: string[];
  remainingToday: number | null;
  /** Total tokens over this run's live calls */
  usage?: { input: number; output: number; calls: number; ms: number };
}
