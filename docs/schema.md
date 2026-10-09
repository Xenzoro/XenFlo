# Database schema

XenFlo stores knowledge bases in Supabase (Postgres). The app's only access path is `src/lib/db`. Migrations, in order:

1. `supabase/migrations/20261009120000_knowledge_schema.sql`: tables, indexes, RLS and the write functions
2. `20261009130000_version_conflict_code.sql`: version conflicts raise `PT409` (HTTP 409)
3. `20261009140000_revoke_rls_auto_enable.sql`: revokes execute on Supabase's `rls_auto_enable()` helper from API roles
4. `20261009165731_ai_enrichment.sql`: `ai_enrichments` cache and `ai_usage` daily cap for AI enrichment
5. `20261010120000_uploads_and_scrape_consent.sql`: `checkbox_scrape` consent method and the private `uploads` storage bucket

## Overview

```
auth.users (Supabase Auth, unused in the demo)
    │ owner_id (nullable)
    ▼
companies ──1:N──▶ knowledge_bases ──1:N──▶ knowledge_versions   (snapshot per save)
                         │        ──1:N──▶ crawl_runs           (one per scrape)
                         │        ──1:N──▶ upload_consents      (permission records)
```

- A **company** is a business, identified by its domain.
- A **knowledge base** is that company's current knowledge. A company can have several (a duplicate, or a test copy), but normally it has one.
- Every save writes a **version** snapshot, so history is never lost.

The design is a hybrid. The full `KnowledgeBase` object (`src/types/knowledge.ts`) lives in a `jsonb` column, because it is deeply nested and every field carries its own `{ value, source, confidence, updatedAt }` metadata. The few fields the app filters and sorts on are copied into real columns. The Zod schema validates the JSON on the way in (API) and on the way out (`getKnowledgeBase`).

## Tables

All primary keys are `uuid default gen_random_uuid()`. All timestamps are `timestamptz`. Every table has `owner_id uuid null → auth.users(id) on delete set null`.

### companies
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| owner_id | uuid, null | future signed-in owner |
| name | text | latest known company name |
| domain | text | normalized host, e.g. `apexminecrafthosting.com` |
| created_at / updated_at | timestamptz | `updated_at` set by trigger |

`unique nulls not distinct (owner_id, domain)` means one company row per domain per owner. Saving a second KB for the same site reuses the company.

### knowledge_bases (current version)
| column | type | notes |
|---|---|---|
| id | uuid | PK, also written into `data.id` |
| company_id | uuid | FK → companies, cascade delete |
| owner_id | uuid, null | |
| url | text | |
| company_name | text | copy of `data.companyName` |
| industry | text, null | copy of `data.company.industry.value` |
| completeness | smallint 0–100 | copy of `data.completeness.score`, recomputed on every save |
| version | integer ≥ 1 | current version number |
| last_crawled_at | timestamptz, null | from `data.crawl.finishedAt` |
| data | jsonb | the full KnowledgeBase |
| created_at / updated_at | timestamptz | |

### knowledge_versions (history)
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| knowledge_base_id | uuid | FK, cascade delete |
| version | integer | `unique (knowledge_base_id, version)` |
| completeness | smallint | score at that version (for a history chart) |
| note | text, null | "Initial save", "Edited pitch"... |
| data | jsonb | full snapshot |
| created_at | timestamptz | |

### crawl_runs
`knowledge_base_id` (FK, cascade), `url`, `started_at`, `finished_at`, `duration_ms int`, `robots_allowed bool`, `page_count int`, `pages jsonb` (each page's URL, category, status, title, timing), `log jsonb` (the crawl log).

### upload_consents
`knowledge_base_id` (FK, cascade), `confirmed bool check (confirmed)`, `method text check in ('checkbox_upload','checkbox_paste','checkbox_scrape')` (`checkbox_scrape` = the owner allowed a scrape that robots.txt restricts), `consented_at`, `created_at`. `unique (knowledge_base_id, consented_at)` lets re-saving the same KB skip duplicate consent rows. This is the audit trail for "I own this business or have permission".

### ai_enrichments and ai_usage (AI enrichment)
Server-only tables: RLS is on with **no policies**, so only the secret key can touch them. The security advisor's "RLS enabled, no policy" notice is expected for these two.

- **`ai_enrichments`:** the result cache.
  - Columns: `cache_key text` PK, `knowledge_base_id uuid` (not a FK, since unsaved knowledge bases can be enriched too), `version int`, `models text`, `result jsonb`, `created_at`.
  - The key is a sha256 of the prompt text, models and exact input, so the same knowledge base version never pays twice.
- **`ai_usage`:** live runs per UTC day (`day date` PK, `count int`).
  - `take_ai_quota(p_limit)` checks and increments it in one `insert … on conflict … where count < p_limit` statement, so two requests can't both take the last slot.
  - `ai_quota_remaining(p_limit)` feeds the "N runs left today" hint.
  - Execute on both is granted only to `service_role`.

## Indexes
- **Search:** `pg_trgm` GIN indexes on `company_name`, `url` and `industry`, so `ILIKE '%term%'` stays fast as the table grows.
- **Filters and sort:** btree on `industry`, `completeness` and `updated_at desc`.
- **Relationships:** `company_id` on knowledge_bases. `(knowledge_base_id, started_at desc)` on crawl_runs. The unique key on knowledge_versions covers version lookups.
- **RLS:** `owner_id` on every table, because every policy filters on it.

## Writes and versioning
supabase-js can't run multi-statement transactions, so each write goes through a Postgres function called with `supabase.rpc()`. Each function runs as a single transaction.

**`create_knowledge_base(p_data, p_owner, p_note)`**
1. Upserts the company by domain.
2. Inserts the KB at version 1.
3. Writes the version 1 snapshot.
4. Records the crawl run (if pages were fetched) and the consent (if any).

The database owns `id`, `version`, `createdAt` and `updatedAt` and writes them back into `data`, so the JSON and the columns always agree.

**`update_knowledge_base(p_id, p_data, p_expected_version, p_note)`**
1. Locks the row (`select … for update`) so two saves can't both become version N+1.
2. If `p_expected_version` doesn't match the current version, it raises `PT409`, which PostgREST passes straight through as HTTP 409. (`40001` would be retried automatically by PostgREST until the request timed out.) The API returns **409 CONFLICT** ("Someone saved a newer version"), which is optimistic concurrency for multiple editors.
3. Otherwise it bumps the version, updates the columns and `data`, and writes the snapshot.

A delete cascades to versions, crawl runs and consents.

## Row Level Security
RLS is **enabled on all five tables**. Each table has four policies for the `authenticated` role:

```sql
using      (owner_id = (select auth.uid()))   -- select, update, delete
with check (owner_id = (select auth.uid()))   -- insert, update
```

- `(select auth.uid())` is wrapped in a subquery so Postgres evaluates it once per query, not once per row.
- `owner_id` is copied onto the child tables (versions, crawl runs, consents), so policies never need joins.
- **anon has no policies**, so the public (anon/publishable) key can read or write nothing.
- The RPC functions are `security invoker`, so RLS applies to whoever calls them. Execute is revoked from `anon`.

**The demo has no login.** API routes use the server-only secret key (`SUPABASE_SERVICE_ROLE_KEY` in `src/lib/db/client.ts`), which bypasses RLS, and rows are saved with `owner_id = null`. The key never reaches the browser. All browser access goes through `/api/knowledge*`.

**Turning on auth later:**
1. Create a per-request client from the user's session (`@supabase/ssr`).
2. Pass `p_owner = auth.uid()`.
3. Backfill or claim the `owner_id = null` demo rows.

The policies are already in place.

## Multi-company support
- One user can own many companies, and each has its own knowledge bases. An agency managing clients would look like this.
- The domain is unique per owner, not globally. Two different users can each build a KB for the same business, and RLS keeps them isolated.
- **Teams (next step):** add `company_members(company_id, user_id, role text check in ('owner','editor','viewer'))`, and change the policies to `exists (select 1 from company_members m where m.company_id = … and m.user_id = (select auth.uid()))`, with role checks for writes. `owner_id` stays as the creator or billing owner.

### Storage: `uploads` bucket
Private bucket for upload-fallback screenshots (PNG/JPG/WebP, 5 MB max). The KB's `uploads` list stores each file's path; the browser only ever gets 1-hour signed URLs from the server. Storage RLS mirrors the tables: signed-in users can only touch objects under a folder named after their user id. The demo stores under `demo/` with the secret key.

## API
| method | route | does |
|---|---|---|
| POST | `/api/knowledge` | save a new KB (v1) → 201 `{ knowledgeBase }` |
| GET | `/api/knowledge?q&industry&minScore&maxScore&from&to&sort&limit&offset` | list summaries (incl. first `logoUrl` via a JSON-path select) → `{ items, total }`. `sort`: `updated`, `name`, `industry`, `completeness`, `version`, each `_asc`/`_desc` |
| GET | `/api/knowledge/[id]` | current KB |
| PATCH | `/api/knowledge/[id]` | `{ knowledgeBase, expectedVersion?, note? }` → saved as the next version |
| DELETE | `/api/knowledge/[id]` | delete with cascade |
| GET | `/api/knowledge/[id]/versions` | `[{ version, completeness, note, createdAt }]`, newest first |
| POST | `/api/extract` | pasted text / uploaded HTML + consent → `{ knowledgeBase }` (new, or added into a given KB) |
| POST | `/api/uploads` | multipart screenshot + consent → stored privately, `{ upload, url, aiAvailable }` |
| GET | `/api/uploads?path=` | fresh 1-hour signed URL for a stored screenshot |
| GET | `/api/knowledge/[id]/versions/[version]` | that version's full snapshot → `{ knowledgeBase }` (restore = PATCH it back with a note) |

Errors always come back as `{ error: { code, message } }`:

| status | code |
|---|---|
| 400 | `INVALID_*` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 503 | `NOT_CONFIGURED` |
| 500 | `DB_ERROR` / `INVALID_DATA` |

## How it would scale
- **List queries** never read `data`. They select summary columns with paging (`limit`/`offset`) and an exact count. Past roughly 100k rows, switch to keyset pagination on `(updated_at, id)` and an estimated count.
- **Snapshot size:** a KB is about 50–200 KB of JSON. Postgres TOAST-compresses jsonb automatically. If history grows large, add a retention policy (keep the last N versions plus daily snapshots), or store only JSON diffs between versions.
- **Crawl pages:** `crawl_runs.pages` is jsonb because pages are only read alongside their run. To query across pages (for example "all 404s"), split them into a `pages_crawled` table.
- **Search:** trigram ILIKE is good for name and URL. Full-text search across the KB body (FAQs, offerings) would add a generated `tsvector` column with a GIN index, or pgvector embeddings for semantic search.
- **Volume:** `knowledge_versions` is append-only and can be range-partitioned by `created_at`. Read traffic can go to Supabase read replicas.
- **Swappability:** routes only import `@/lib/db`. Moving to another Postgres host or ORM means rewriting that folder.
