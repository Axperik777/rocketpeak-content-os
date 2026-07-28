grant select, insert, delete on public.media_assets to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-media',
  'content-media',
  false,
  104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media_objects_owner_read" on storage.objects;
drop policy if exists "media_objects_owner_insert" on storage.objects;
drop policy if exists "media_objects_owner_update" on storage.objects;
drop policy if exists "media_objects_owner_delete" on storage.objects;

create policy "media_objects_owner_read" on storage.objects for select to authenticated
using (bucket_id = 'content-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media_objects_owner_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'content-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media_objects_owner_update" on storage.objects for update to authenticated
using (bucket_id = 'content-media' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'content-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media_objects_owner_delete" on storage.objects for delete to authenticated
using (bucket_id = 'content-media' and (storage.foldername(name))[1] = auth.uid()::text);
