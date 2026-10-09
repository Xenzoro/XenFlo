-- Phase 8: AI enrichment cache and daily cost cap.
--
-- ai_enrichments: one row per distinct AI input. The key is a hash of the prompt versions,
--   the models and the exact input, so the same knowledge base version never pays twice.
-- ai_usage: live AI runs per UTC day, checked and incremented atomically by take_ai_quota().
--
-- Both are app-internal: RLS is on with no policies, so only the server's secret key
-- (service_role, which bypasses RLS) can read or write them.

create table public.ai_enrichments (
  cache_key text primary key,
  -- Not a foreign key: unsaved knowledge bases (not in the table yet) can be enriched too
  knowledge_base_id uuid null,
  version integer null,
  models text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index ai_enrichments_kb_idx on public.ai_enrichments (knowledge_base_id, version);

create table public.ai_usage (
  day date primary key,
  count integer not null default 0 check (count >= 0)
);

alter table public.ai_enrichments enable row level security;
alter table public.ai_usage enable row level security;

-- Returns true and counts the run if today is still under p_limit; false otherwise.
-- One statement, so two requests at the same moment can't both take the last slot.
create or replace function public.take_ai_quota(p_limit integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_limit <= 0 then
    return false;
  end if;
  insert into public.ai_usage as u (day, count)
  values ((now() at time zone 'utc')::date, 1)
  on conflict (day) do update set count = u.count + 1
    where u.count < p_limit
  returning u.count into v_count;
  -- No row returned means the update's WHERE failed: the limit is already reached.
  return v_count is not null and v_count <= p_limit;
end;
$$;

-- Live runs left today, for the "N left today" hint in the UI.
create or replace function public.ai_quota_remaining(p_limit integer)
returns integer
language sql
security invoker
set search_path = ''
stable
as $$
  select greatest(0, p_limit - coalesce((select count from public.ai_usage where day = (now() at time zone 'utc')::date), 0));
$$;

revoke execute on function public.take_ai_quota(integer) from public, anon, authenticated;
revoke execute on function public.ai_quota_remaining(integer) from public, anon, authenticated;
grant execute on function public.take_ai_quota(integer) to service_role;
grant execute on function public.ai_quota_remaining(integer) to service_role;
