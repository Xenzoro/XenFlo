-- public.rls_auto_enable() is created by Supabase's "auto-enable RLS" setting, not by
-- our migrations. It's a SECURITY DEFINER event trigger function fired by the
-- ensure_rls event trigger (ddl_command_end), so nobody needs to call it directly.
--
-- Postgres only checks EXECUTE when an event trigger is created, not when it fires,
-- so revoking it from API roles keeps the trigger working. This clears the
-- "SECURITY DEFINER function executable by anon/authenticated" advisor warnings.
-- The owner (postgres) and service_role keep their grants.
--
-- Guarded so the migration also runs on databases without the function (local dev).
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
