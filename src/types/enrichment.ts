/**
 * Shapes shared by the enrichment API and the review modal.
 * The server proposes suggestions; nothing is applied until the owner accepts it.
 */

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
  confidence: "ai_live" | "ai_mock";
  /** Where this came from: "ai:gpt-5.4-mini" or "ai:preview" */
  source: string;
  /** Input fields the model said it used (live mode only) */
  basedOn: string[];
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
