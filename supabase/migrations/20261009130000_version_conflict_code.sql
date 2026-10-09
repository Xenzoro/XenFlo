-- PostgREST automatically retries transactions that fail with SQLSTATE 40001
-- (serialization_failure), so a version conflict raised with that code retried
-- until the request timed out. Use PostgREST's custom "PTxxx" code instead,
-- which it returns immediately as HTTP 409.

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
      using errcode = 'PT409';
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
