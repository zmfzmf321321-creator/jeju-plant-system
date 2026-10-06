-- Inventory photos: imported workbook images live in this protected table;
-- new user uploads remain in the existing private instrument-photos bucket.
create table public.inventory_photos (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  storage_url text,
  image_base64 text,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  source text not null default 'upload' check (source in ('upload', 'tms_xlsx', 'instrument')),
  source_ref text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  is_removed boolean not null default false,
  constraint inventory_photo_one_location check ((storage_url is null) <> (image_base64 is null)),
  constraint inventory_photo_base64_size check (image_base64 is null or char_length(image_base64) <= 4000000),
  constraint inventory_photo_storage_location check (
    storage_url is null or storage_url like 'https://euohxdxddvyldtfdvpkk.supabase.co/storage/v1/object/public/instrument-photos/%'
  ),
  constraint inventory_photo_import_reference unique (inventory_id, source, source_ref)
);
create index inventory_photos_item_idx on public.inventory_photos (inventory_id, created_at, id) where is_removed = false;
alter table public.inventory_photos enable row level security;
revoke all on public.inventory_photos from public, anon, authenticated;
grant select on public.inventory_photos to authenticated;
grant insert (inventory_id, storage_url, mime_type, source, created_by) on public.inventory_photos to authenticated;
grant update (is_removed) on public.inventory_photos to authenticated;
create policy inventory_photo_approval on public.inventory_photos as restrictive for all to authenticated
  using ((select private.is_approved_user()))
  with check ((select private.is_approved_user()));
create policy inventory_photo_read on public.inventory_photos for select to authenticated using (true);
create policy inventory_photo_upload on public.inventory_photos for insert to authenticated
  with check (
    source = 'upload' and created_by = (select auth.uid()) and image_base64 is null
    and storage_url like 'https://euohxdxddvyldtfdvpkk.supabase.co/storage/v1/object/public/instrument-photos/' || (select auth.uid())::text || '/%'
  );
create policy inventory_photo_remove on public.inventory_photos for update to authenticated
  using (true) with check (is_removed = true);
