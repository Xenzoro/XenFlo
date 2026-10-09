-- Phase 6: upload fallback and owner-consented scrapes.
--
-- 1. Consent can now also come from the owner allowing a scrape that robots.txt restricts.
-- 2. A private Storage bucket for screenshots. Nothing in it is public: the app hands out
--    short-lived signed URLs from the server.

alter table public.upload_consents drop constraint if exists upload_consents_method_check;
alter table public.upload_consents
  add constraint upload_consents_method_check
  check (method in ('checkbox_upload', 'checkbox_paste', 'checkbox_scrape'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Signed-in users may only touch files under a folder named after their user id
-- ("<uid>/screenshot.png"), the same owner-only rule as the tables. The demo's server
-- uses the secret key, which bypasses these policies.
create policy uploads_select_own on storage.objects for select to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy uploads_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy uploads_update_own on storage.objects for update to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy uploads_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
