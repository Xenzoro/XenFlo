-- XenFlo knowledge schema.
-- companies -> knowledge_bases (current version) -> knowledge_versions (history),
-- plus crawl_runs and upload_consents per knowledge base.
-- owner_id is nullable for the no-login demo; RLS is ready for real auth later.

create extension if not exists pg_trgm with schema extensions;

-- ---------- Shared trigger: keep updated_at fresh ----------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- Tables ----------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete set null,
  name text not null default '',
  -- Normalized host without "www.", e.g. "apexminecrafthosting.com"
  domain text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One company per domain per owner. "nulls not distinct" makes this hold for the
  -- demo too, where owner_id is null.
  constraint companies_owner_domain_key unique nulls not distinct (owner_id, domain)
);

create table public.knowledge_bases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete set null,
  -- Key fields copied out of data so lists, search and filters don't read the JSONB
  url text not null,
  company_name text not null default '',
  industry text,
  completeness smallint not null default 0 check (completeness between 0 and 100),
  version integer not null default 1 check (version >= 1),
  last_crawled_at timestamptz,
  -- The full KnowledgeBase (src/types/knowledge.ts) at the current version
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null references public.knowledge_bases (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete set null,
  version integer not null,
  completeness smallint not null default 0,
  note text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  constraint knowledge_versions_kb_version_key unique (knowledge_base_id, version)
);

create table public.crawl_runs (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null references public.knowledge_bases (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete set null,
  url text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_ms integer not null default 0,
  robots_allowed boolean not null default true,
  page_count integer not null default 0,
  pages jsonb not null default '[]'::jsonb,
  log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.upload_consents (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null references public.knowledge_bases (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete set null,
  confirmed boolean not null check (confirmed),
  method text not null check (method in ('checkbox_upload', 'checkbox_paste')),
  consented_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint upload_consents_kb_time_key unique (knowledge_base_id, consented_at)
);

-- ---------- Indexes ----------

-- Trigram indexes make ILIKE '%term%' search fast on the list page
create index knowledge_bases_company_name_trgm on public.knowledge_bases using gin (company_name extensions.gin_trgm_ops);
create index knowledge_bases_url_trgm on public.knowledge_bases using gin (url extensions.gin_trgm_ops);
create index knowledge_bases_industry_trgm on public.knowledge_bases using gin (industry extensions.gin_trgm_ops);
-- Filters and sorting
create index knowledge_bases_industry_idx on public.knowledge_bases (industry);
create index knowledge_bases_completeness_idx on public.knowledge_bases (completeness);
create index knowledge_bases_updated_at_idx on public.knowledge_bases (updated_at desc);
create index knowledge_bases_company_id_idx on public.knowledge_bases (company_id);
-- Foreign keys and owner lookups (RLS filters on owner_id)
create index companies_owner_id_idx on public.companies (owner_id);
create index knowledge_bases_owner_id_idx on public.knowledge_bases (owner_id);
create index knowledge_versions_owner_id_idx on public.knowledge_versions (owner_id);
create index crawl_runs_kb_idx on public.crawl_runs (knowledge_base_id, started_at desc);
create index crawl_runs_owner_id_idx on public.crawl_runs (owner_id);
create index upload_consents_owner_id_idx on public.upload_consents (owner_id);

create trigger companies_set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger knowledge_bases_set_updated_at before update on public.knowledge_bases
  for each row execute function public.set_updated_at();

-- ---------- Row Level Security ----------
-- Signed-in users only see and change their own rows. There are no anon policies,
-- so the public key reads nothing. The demo's server routes use the secret key,
-- which bypasses RLS.

alter table public.companies enable row level security;
alter table public.knowledge_bases enable row level security;
alter table public.knowledge_versions enable row level security;
alter table public.crawl_runs enable row level security;
alter table public.upload_consents enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['companies', 'knowledge_bases', 'knowledge_versions', 'crawl_runs', 'upload_consents'] loop
    -- (select auth.uid()) is evaluated once per query instead of once per row
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
end;
$$;

-- ---------- Helpers ----------

-- Records consent from a KB's data if it has one (no-op when null or already stored).
create or replace function public.record_consent(p_kb_id uuid, p_owner uuid, p_data jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(p_data -> 'consent') = 'object' then
    insert into public.upload_consents (knowledge_base_id, owner_id, confirmed, method, consented_at)
    values (
      p_kb_id,
      p_owner,
      (p_data -> 'consent' ->> 'confirmed')::boolean,
      p_data -> 'consent' ->> 'method',
      (p_data -> 'consent' ->> 'timestamp')::timestamptz
    )
    on conflict (knowledge_base_id, consented_at) do nothing;
  end if;
end;
$$;

-- Records the crawl from a KB's data if any pages were fetched.
create or replace function public.record_crawl_run(p_kb_id uuid, p_owner uuid, p_data jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_crawl jsonb := p_data -> 'crawl';
begin
  if jsonb_array_length(coalesce(v_crawl -> 'pages', '[]'::jsonb)) > 0 then
    insert into public.crawl_runs (knowledge_base_id, owner_id, url, started_at, finished_at, duration_ms, robots_allowed, page_count, pages, log)
    values (
      p_kb_id,
      p_owner,
      p_data ->> 'url',
      (v_crawl ->> 'startedAt')::timestamptz,
      (v_crawl ->> 'finishedAt')::timestamptz,
      coalesce((v_crawl ->> 'durationMs')::integer, 0),
      coalesce((v_crawl ->> 'robotsAllowed')::boolean, true),
      jsonb_array_length(v_crawl -> 'pages'),
      v_crawl -> 'pages',
      coalesce(v_crawl -> 'log', '[]'::jsonb)
    );
  end if;
end;
$$;

-- ---------- Atomic write functions (called via supabase.rpc) ----------
-- supabase-js can't run multi-statement transactions, so each save is one
-- function call, which Postgres runs as a single transaction.

-- Creates a company (or reuses the one for this domain), the knowledge base at
-- version 1, its first snapshot, crawl run and consent. Returns the new row.
create or replace function public.create_knowledge_base(p_data jsonb, p_owner uuid default null, p_note text default null)
returns public.knowledge_bases
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_domain text;
  v_company_id uuid;
  v_kb public.knowledge_bases;
  v_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_data jsonb;
begin
  -- "https://www.Example.com/about" -> "example.com"
  v_domain := lower(regexp_replace(regexp_replace(p_data ->> 'url', '^[a-z]+://', '', 'i'), '^www\.|[/:?#].*$', '', 'g'));

  insert into public.companies (owner_id, name, domain)
  values (p_owner, coalesce(p_data ->> 'companyName', ''), v_domain)
  on conflict on constraint companies_owner_domain_key
    do update set name = case when excluded.name <> '' then excluded.name else public.companies.name end
  returning id into v_company_id;

  -- The database owns id, version and timestamps; write them back into the JSON
  v_data := p_data || jsonb_build_object(
    'id', v_id,
    'version', 1,
    'createdAt', to_jsonb(v_now),
    'updatedAt', to_jsonb(v_now)
  );

  insert into public.knowledge_bases (id, company_id, owner_id, url, company_name, industry, completeness, version, last_crawled_at, data, created_at, updated_at)
  values (
    v_id,
    v_company_id,
    p_owner,
    v_data ->> 'url',
    coalesce(v_data ->> 'companyName', ''),
    v_data -> 'company' -> 'industry' ->> 'value',
    coalesce((v_data -> 'completeness' ->> 'score')::smallint, 0),
    1,
    (v_data -> 'crawl' ->> 'finishedAt')::timestamptz,
    v_data,
    v_now,
    v_now
  )
  returning * into v_kb;

  insert into public.knowledge_versions (knowledge_base_id, owner_id, version, completeness, note, data)
  values (v_id, p_owner, 1, v_kb.completeness, coalesce(p_note, 'Initial save'), v_data);

  perform public.record_crawl_run(v_id, p_owner, v_data);
  perform public.record_consent(v_id, p_owner, v_data);

  return v_kb;
end;
$$;

-- Saves an edited knowledge base as a new version. If p_expected_version is
-- given and someone saved in between, raises 40001 so the API can return 409.
create or replace function public.update_knowledge_base(p_id uuid, p_data jsonb, p_expected_version integer default null, p_note text default null)
returns public.knowledge_bases
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_kb public.knowledge_bases;
  v_next integer;
  v_now timestamptz := now();
  v_data jsonb;
begin
  -- Lock the row so two saves can't both become the same version
  select * into v_kb from public.knowledge_bases where id = p_id for update;
  if not found then
    raise exception 'Knowledge base % not found', p_id using errcode = 'P0002';
  end if;
  if p_expected_version is not null and v_kb.version <> p_expected_version then
    raise exception 'Version conflict: expected %, current is %', p_expected_version, v_kb.version
      using errcode = '40001';
  end if;

  v_next := v_kb.version + 1;
  v_data := p_data || jsonb_build_object(
    'id', p_id,
    'version', v_next,
    'createdAt', to_jsonb(v_kb.created_at),
    'updatedAt', to_jsonb(v_now)
  );

  update public.knowledge_bases set
    url = v_data ->> 'url',
    company_name = coalesce(v_data ->> 'companyName', ''),
    industry = v_data -> 'company' -> 'industry' ->> 'value',
    completeness = coalesce((v_data -> 'completeness' ->> 'score')::smallint, 0),
    version = v_next,
    last_crawled_at = coalesce((v_data -> 'crawl' ->> 'finishedAt')::timestamptz, last_crawled_at),
    data = v_data
  where id = p_id
  returning * into v_kb;

  insert into public.knowledge_versions (knowledge_base_id, owner_id, version, completeness, note, data)
  values (p_id, v_kb.owner_id, v_next, v_kb.completeness, p_note, v_data);

  perform public.record_consent(p_id, v_kb.owner_id, v_data);

  return v_kb;
end;
$$;

-- Only signed-in users (subject to RLS) and the server's secret key may call these
revoke execute on function public.create_knowledge_base(jsonb, uuid, text) from public, anon;
revoke execute on function public.update_knowledge_base(uuid, jsonb, integer, text) from public, anon;
revoke execute on function public.record_consent(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.record_crawl_run(uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_knowledge_base(jsonb, uuid, text) to authenticated, service_role;
grant execute on function public.update_knowledge_base(uuid, jsonb, integer, text) to authenticated, service_role;
grant execute on function public.record_consent(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function public.record_crawl_run(uuid, uuid, jsonb) to authenticated, service_role;
