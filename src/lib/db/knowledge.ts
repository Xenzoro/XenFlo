/**
 * Knowledge base storage. The only place that knows the data lives in Supabase,
 * so swapping databases means rewriting this folder and nothing else.
 *
 * Writes go through Postgres functions (create_knowledge_base, update_knowledge_base)
 * so each save, its version snapshot, crawl run and consent are one transaction.
 */
import type { KnowledgeBase } from "@/types/knowledge";
import { knowledgeBaseSchema } from "@/types/knowledge.schema";
import { scoreCompleteness } from "@/lib/scraper/score";
import { getDb } from "./client";
import { DbError, fromPostgrest } from "./errors";
import type { KnowledgeBaseRow, KnowledgeSummary, ListFilters, ListSort, VersionSummary } from "./types";

// `logo:data->...->>url` is PostgREST JSON-path syntax: it pulls one value out of the JSONB
// (the first logo's URL) without sending the whole knowledge base.
const SUMMARY_COLUMNS =
  "id, company_id, url, company_name, industry, completeness, version, last_crawled_at, created_at, updated_at, logo:data->brand->logos->0->value->>url";

const SORTS: Record<ListSort, { column: string; ascending: boolean }> = {
  updated_desc: { column: "updated_at", ascending: false },
  updated_asc: { column: "updated_at", ascending: true },
  name_asc: { column: "company_name", ascending: true },
  name_desc: { column: "company_name", ascending: false },
  industry_asc: { column: "industry", ascending: true },
  industry_desc: { column: "industry", ascending: false },
  completeness_desc: { column: "completeness", ascending: false },
  completeness_asc: { column: "completeness", ascending: true },
  version_desc: { column: "version", ascending: false },
  version_asc: { column: "version", ascending: true },
};

type SummaryRow = Omit<KnowledgeBaseRow, "data" | "owner_id"> & { logo: string | null };

function toSummary(row: SummaryRow): KnowledgeSummary {
  return {
    id: row.id,
    companyId: row.company_id,
    url: row.url,
    companyName: row.company_name,
    industry: row.industry,
    logoUrl: row.logo,
    completeness: row.completeness,
    version: row.version,
    lastCrawledAt: row.last_crawled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Validate the stored JSON so a bad record fails loudly instead of breaking the UI. */
function toKnowledgeBase(row: Pick<KnowledgeBaseRow, "data">): KnowledgeBase {
  return knowledgeBaseSchema.parse(row.data);
}

/** Recompute completeness so the score column always matches the saved content. */
function withScore(kb: KnowledgeBase): KnowledgeBase {
  return { ...kb, completeness: scoreCompleteness(kb) };
}

/** Save a new knowledge base (version 1). Returns it with the database's id and timestamps. */
export async function createKnowledgeBase(kb: KnowledgeBase, opts: { note?: string } = {}): Promise<KnowledgeBase> {
  const { data, error } = await getDb()
    .rpc("create_knowledge_base", { p_data: withScore(kb), p_owner: null, p_note: opts.note ?? null })
    .single<KnowledgeBaseRow>();
  if (error) throw fromPostgrest(error);
  return toKnowledgeBase(data);
}

export async function getKnowledgeBase(id: string): Promise<KnowledgeBase> {
  const { data, error } = await getDb()
    .from("knowledge_bases")
    .select("data")
    .eq("id", id)
    .maybeSingle<Pick<KnowledgeBaseRow, "data">>();
  if (error) throw fromPostgrest(error);
  if (!data) throw new DbError("NOT_FOUND", "That knowledge base doesn't exist.");
  return toKnowledgeBase(data);
}

/** List summaries with search, filters, sorting and paging. */
export async function listKnowledgeBases(
  filters: ListFilters = {},
): Promise<{ items: KnowledgeSummary[]; total: number }> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const sort = SORTS[filters.sort ?? "updated_desc"];

  let query = getDb().from("knowledge_bases").select(SUMMARY_COLUMNS, { count: "exact" });

  if (filters.q) {
    // Strip characters that have meaning in PostgREST's or() syntax or ILIKE patterns
    const term = filters.q.replace(/[,()%*\\:"]/g, " ").trim();
    if (term) {
      query = query.or(`company_name.ilike.%${term}%,url.ilike.%${term}%,industry.ilike.%${term}%`);
    }
  }
  if (filters.industry) query = query.ilike("industry", filters.industry);
  if (filters.minScore !== undefined) query = query.gte("completeness", filters.minScore);
  if (filters.maxScore !== undefined) query = query.lte("completeness", filters.maxScore);
  if (filters.from) query = query.gte("updated_at", filters.from);
  if (filters.to) query = query.lte("updated_at", filters.to);

  const { data, error, count } = await query
    .order(sort.column, { ascending: sort.ascending })
    .range(offset, offset + limit - 1);
  if (error) throw fromPostgrest(error);
  return { items: (data as SummaryRow[]).map(toSummary), total: count ?? 0 };
}

/**
 * Save edits as a new version. Pass expectedVersion (the version the user loaded)
 * to get a CONFLICT error instead of silently overwriting someone else's save.
 */
export async function updateKnowledgeBase(
  id: string,
  kb: KnowledgeBase,
  opts: { expectedVersion?: number; note?: string } = {},
): Promise<KnowledgeBase> {
  const { data, error } = await getDb()
    .rpc("update_knowledge_base", {
      p_id: id,
      p_data: withScore(kb),
      p_expected_version: opts.expectedVersion ?? null,
      p_note: opts.note ?? null,
    })
    .single<KnowledgeBaseRow>();
  if (error) throw fromPostgrest(error);
  return toKnowledgeBase(data);
}

/** Delete a knowledge base. Versions, crawl runs and consents cascade with it. */
export async function deleteKnowledgeBase(id: string): Promise<void> {
  const { data, error } = await getDb().from("knowledge_bases").delete().eq("id", id).select("id");
  if (error) throw fromPostgrest(error);
  if (!data || data.length === 0) throw new DbError("NOT_FOUND", "That knowledge base doesn't exist.");
}

/** Version history, newest first (metadata only, no snapshots). */
export async function listVersions(id: string): Promise<VersionSummary[]> {
  // Check the KB exists so an unknown id is a 404, not an empty list
  const { count, error: existsError } = await getDb()
    .from("knowledge_bases")
    .select("id", { count: "exact", head: true })
    .eq("id", id);
  if (existsError) throw fromPostgrest(existsError);
  if (!count) throw new DbError("NOT_FOUND", "That knowledge base doesn't exist.");

  const { data, error } = await getDb()
    .from("knowledge_versions")
    .select("version, completeness, note, created_at")
    .eq("knowledge_base_id", id)
    .order("version", { ascending: false });
  if (error) throw fromPostgrest(error);
  return data.map((v) => ({
    version: v.version,
    completeness: v.completeness,
    note: v.note,
    createdAt: v.created_at,
  }));
}

/** One saved version's full snapshot. */
export async function getVersion(id: string, version: number): Promise<KnowledgeBase> {
  const { data, error } = await getDb()
    .from("knowledge_versions")
    .select("data")
    .eq("knowledge_base_id", id)
    .eq("version", version)
    .maybeSingle<Pick<KnowledgeBaseRow, "data">>();
  if (error) throw fromPostgrest(error);
  if (!data) throw new DbError("NOT_FOUND", `Version ${version} doesn't exist.`);
  return toKnowledgeBase(data);
}
