/*
  The saved-records page keeps its whole view (mode, search, filters, sort, open record)
  in the URL query, so any view can be bookmarked or shared. These helpers convert
  between the URL and a typed ViewState, leaving defaults out of the URL.
*/
import type { ListSort } from "@/lib/db/types";

export type ViewMode = "card" | "table" | "detailed";
export type ScoreBand = "all" | "low" | "mid" | "high";
export type DateRange = "any" | "7d" | "30d" | "90d";

export interface ViewState {
  mode: ViewMode;
  q: string;
  industry: string;
  score: ScoreBand;
  date: DateRange;
  sort: ListSort;
  /** Record shown in Detailed mode */
  id: string;
}

export const DEFAULT_VIEW: ViewState = { mode: "card", q: "", industry: "", score: "all", date: "any", sort: "updated_desc", id: "" };

export const SCORE_BANDS: Record<ScoreBand, { label: string; min?: number; max?: number }> = {
  all: { label: "Any health" },
  low: { label: "Needs work (0-49)", min: 0, max: 49 },
  mid: { label: "Good (50-79)", min: 50, max: 79 },
  high: { label: "Great (80+)", min: 80, max: 100 },
};

export const DATE_RANGES: Record<DateRange, { label: string; days?: number }> = {
  any: { label: "Any time" },
  "7d": { label: "Last 7 days", days: 7 },
  "30d": { label: "Last 30 days", days: 30 },
  "90d": { label: "Last 90 days", days: 90 },
};

export const SORT_LABELS: Record<ListSort, string> = {
  updated_desc: "Recently updated",
  updated_asc: "Oldest updated",
  name_asc: "Name A-Z",
  name_desc: "Name Z-A",
  industry_asc: "Industry A-Z",
  industry_desc: "Industry Z-A",
  completeness_desc: "Highest health",
  completeness_asc: "Lowest health",
  version_desc: "Most versions",
  version_asc: "Fewest versions",
};

const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

export function parseView(params: URLSearchParams): ViewState {
  return {
    mode: pick(params.get("mode"), ["card", "table", "detailed"], DEFAULT_VIEW.mode),
    q: params.get("q") ?? "",
    industry: params.get("industry") ?? "",
    score: pick(params.get("score"), Object.keys(SCORE_BANDS) as ScoreBand[], "all"),
    date: pick(params.get("date"), Object.keys(DATE_RANGES) as DateRange[], "any"),
    sort: pick(params.get("sort"), Object.keys(SORT_LABELS) as ListSort[], DEFAULT_VIEW.sort),
    id: params.get("id") ?? "",
  };
}

/** ViewState -> "?mode=table&q=apex" (defaults omitted). */
export function toQuery(view: ViewState): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(DEFAULT_VIEW) as (keyof ViewState)[]) {
    if (view[key] && view[key] !== DEFAULT_VIEW[key]) params.set(key, view[key]);
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** ViewState -> query params for GET /api/knowledge. */
export function toApiParams(view: ViewState): Record<string, string> {
  const out: Record<string, string> = { sort: view.sort, limit: "100" };
  if (view.q.trim()) out.q = view.q.trim();
  if (view.industry) out.industry = view.industry;
  const band = SCORE_BANDS[view.score];
  if (band.min !== undefined) out.minScore = String(band.min);
  if (band.max !== undefined) out.maxScore = String(band.max);
  const days = DATE_RANGES[view.date].days;
  if (days) out.from = new Date(Date.now() - days * 86_400_000).toISOString();
  return out;
}

export function hasFilters(view: ViewState): boolean {
  return !!view.q.trim() || !!view.industry || view.score !== "all" || view.date !== "any";
}
