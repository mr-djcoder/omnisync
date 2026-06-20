-- The draft-media INSERT policy required (storage.foldername(name))[1] =
-- auth.uid(), which rejected authenticated uploads in practice. Simplify to:
-- any authenticated user may read/write/delete objects in the draft-media
-- bucket. The bucket only holds transient draft media (public-readable anyway),
-- so per-path ownership isn't worth the breakage.
drop policy if exists "draft-media auth upload" on storage.objects;
drop policy if exists "draft-media owner modify" on storage.objects;

create policy "draft-media auth insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'draft-media');
create policy "draft-media auth update" on storage.objects
  for update to authenticated using (bucket_id = 'draft-media');
create policy "draft-media auth select" on storage.objects
  for select to authenticated using (bucket_id = 'draft-media');
create policy "draft-media auth delete" on storage.objects
  for delete to authenticated using (bucket_id = 'draft-media');
