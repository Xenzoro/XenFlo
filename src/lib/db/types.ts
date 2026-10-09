/** Row shapes for the Supabase tables (see supabase/migrations and docs/schema.md). */

/** A knowledge_bases row as stored. `data` is the full KnowledgeBase JSON. */
export interface KnowledgeBaseRow {
  id: string;
  company_id: string;
  owner_id: string | null;
  url: string;
  company_name: string;
  industry: string | null;
  completeness: number;
  version: number;
  last_crawled_at: string | null;
  data: unknown; // validated with knowledgeBaseSchema before use
  created_at: string;
  updated_at: string;
}

/** Light list item for the management page (no JSONB). */
export interface KnowledgeSummary {
  id: string;
  companyId: string;
  url: string;
  companyName: string;
  industry: string | null;
  /** Best small-tile logo (see pickIconLogo), read from the JSONB so cards can show it */
  logoUrl: string | null;
  completeness: number;
  version: number;
  lastCrawledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VersionSummary {
  version: number;
  completeness: number;
  note: string | null;
  createdAt: string;
}

export type ListSort =
  | "updated_desc"
  | "updated_asc"
  | "name_asc"
  | "name_desc"
  | "industry_asc"
  | "industry_desc"
  | "completeness_desc"
  | "completeness_asc"
  | "version_desc"
  | "version_asc";

export interface ListFilters {
  /** Free text matched against company name, URL and industry */
  q?: string;
  industry?: string;
  minScore?: number;
  maxScore?: number;
  /** ISO dates, compared with updated_at */
  from?: string;
  to?: string;
  sort?: ListSort;
  limit?: number;
  offset?: number;
}
