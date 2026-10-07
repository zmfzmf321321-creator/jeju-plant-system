create or replace function private.apply_inventory_mail_photos(
  p_message_id text, p_photos jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  photo jsonb;
  item_id uuid;
  encoded text;
  image_bytes bytea;
  kind text;
  photo_hash text;
  counts jsonb := '{"added":0,"duplicate":0,"needs_review":0}'::jsonb;
  result_status text;
begin
  if p_message_id is null or jsonb_typeof(p_photos) <> 'array' then
    raise exception 'Invalid photo import request';
  end if;
  for photo in select value from jsonb_array_elements(p_photos) loop
    result_status := 'needs_review';
    item_id := null;
    select r.inventory_id into item_id from private.inventory_mail_rows r
      where r.message_id = p_message_id
        and r.source_key = photo->>'source_key'
        and r.status in ('created','updated','unchanged');
    kind := photo->>'mime_type';
    encoded := photo->>'image_base64';
    if item_id is not null
       and kind in ('image/jpeg','image/png','image/webp','image/gif')
       and encoded ~ '^[A-Za-z0-9+/]+={0,2}$'
       and length(encoded) between 32 and 4000000
       and length(encoded) % 4 = 0 then
      image_bytes := decode(encoded,'base64');
      if (kind = 'image/jpeg' and encode(substring(image_bytes from 1 for 3),'hex') = 'ffd8ff')
         or (kind = 'image/png' and encode(substring(image_bytes from 1 for 8),'hex') = '89504e470d0a1a0a')
         or (kind = 'image/gif' and encode(substring(image_bytes from 1 for 4),'hex') = '47494638')
         or (kind = 'image/webp' and encode(substring(image_bytes from 1 for 4),'hex') = '52494646'
             and encode(substring(image_bytes from 9 for 4),'hex') = '57454250') then
        photo_hash := md5(encoded);
        if exists (select 1 from public.inventory_photos p
                   where p.inventory_id = item_id and p.image_base64 is not null
                     and md5(p.image_base64) = photo_hash) then
          result_status := 'duplicate';
        elsif (select count(*) from public.inventory_photos p
               where p.inventory_id = item_id and not p.is_removed) < 5 then
          insert into public.inventory_photos
            (inventory_id,image_base64,mime_type,source,source_ref)
          values (item_id,encoded,kind,'gmail_xlsx','gmail:' || photo_hash)
          on conflict (inventory_id,source,source_ref) do nothing;
          result_status := 'added';
        end if;
      end if;
    end if;
    counts := jsonb_set(counts,array[result_status],
      to_jsonb((counts->>result_status)::integer + 1));
  end loop;
  return counts;
end;
$$;

revoke all on function private.apply_inventory_mail_photos(text,jsonb)
  from public, anon, authenticated;
