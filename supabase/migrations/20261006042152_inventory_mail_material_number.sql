-- New mail imports can carry a distinct material number and embedded item photos.
alter table public.inventory_photos drop constraint inventory_photos_source_check;
alter table public.inventory_photos add constraint inventory_photos_source_check
  check (source in ('upload', 'tms_xlsx', 'instrument', 'gmail_xlsx'));

create or replace function private.apply_inventory_mail_snapshot(
  p_message_id text, p_rows jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  source_row jsonb;
  source_key text;
  source_file text;
  major text;
  code text;
  material_no text;
  item_name text;
  item_spec text;
  desired integer;
  matched public.inventory;
  matched_id uuid;
  match_count integer;
  code_id uuid;
  code_count integer;
  material_id uuid;
  material_count integer;
  row_status text;
  row_note text;
  counts jsonb := '{"created":0,"updated":0,"unchanged":0,"needs_review":0}'::jsonb;
begin
  if p_message_id is null or length(p_message_id) > 200 or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Invalid mail import request';
  end if;
  for source_row in select value from jsonb_array_elements(p_rows) loop
    matched := null;
    matched_id := null;
    code_id := null;
    code_count := 0;
    material_id := null;
    material_count := 0;
    match_count := 0;
    desired := null;
    source_key := nullif(btrim(source_row->>'source_key'), '');
    source_file := left(coalesce(source_row->>'source_file', ''), 255);
    major := nullif(btrim(source_row->>'major_category'), '');
    code := nullif(btrim(source_row->>'item_code'), '');
    material_no := nullif(btrim(source_row->>'material_number'), '');
    item_name := nullif(btrim(source_row->>'item_name'), '');
    item_spec := nullif(btrim(source_row->>'spec'), '');
    row_status := 'needs_review';
    row_note := null;
    if source_key is null or source_file = '' then
      raise exception 'Every row needs a source key and file';
    end if;
    if exists (select 1 from private.inventory_mail_rows r
               where r.message_id = p_message_id and r.source_key = source_key) then
      continue;
    end if;
    if coalesce(major not in ('기력','내연','환경'), true) or item_name is null
       or not coalesce(source_row->>'stock_qty' ~ '^[0-9]{1,10}$', false)
       or (case when source_row->>'stock_qty' ~ '^[0-9]{1,10}$'
           then (source_row->>'stock_qty')::numeric > 2147483647 else false end)
       or length(code) > 100 or length(material_no) > 100
       or length(item_name) > 200 then
      row_note := '대분류, 품명 또는 현재고를 확인할 수 없음';
    else
      desired := (source_row->>'stock_qty')::integer;
      if code is not null then
        select count(*), (array_agg(i.id))[1] into code_count, code_id
          from public.inventory i where lower(btrim(i.item_code)) = lower(code);
      end if;
      if material_no is not null then
        select count(*), (array_agg(i.id))[1] into material_count, material_id
          from public.inventory i where lower(btrim(i.material_number)) = lower(material_no);
      end if;
      if coalesce(code_count,0) > 1 or coalesce(material_count,0) > 1
         or (code_id is not null and material_id is not null and code_id <> material_id) then
        row_note := '품목코드 또는 자재번호가 여러 품목과 일치함';
      else
        matched_id := coalesce(code_id, material_id);
        if matched_id is null then
        select count(*), (array_agg(i.id))[1] into match_count, matched_id
          from public.inventory i
          where i.major_category = major
            and lower(btrim(i.item_name)) = lower(item_name)
            and lower(btrim(coalesce(i.spec,''))) = lower(coalesce(item_spec,''));
        else
          match_count := 1;
        end if;
      if match_count > 1 then
        row_note := '기존 품목이 여러 개 일치함';
      else
        if match_count = 1 then
          select * into matched from public.inventory where id = matched_id for update;
          if matched.is_archived or matched.major_category <> major then
            row_note := '보관 종료 또는 대분류 불일치';
          elsif (code is not null and matched.item_code is not null
                 and lower(btrim(matched.item_code)) <> lower(code))
             or (material_no is not null and matched.material_number is not null
                 and lower(btrim(matched.material_number)) <> lower(material_no)) then
            row_note := '기존 품목의 코드 또는 자재번호와 충돌함';
          elsif matched.stock_qty = desired then
            if (code is not null and matched.item_code is null)
               or (material_no is not null and matched.material_number is null) then
              update public.inventory set
                item_code = coalesce(item_code, code),
                material_number = coalesce(material_number, material_no),
                updated_at = now(), updated_by = 'Gmail 자동화'
                where id = matched.id;
            end if;
            row_status := 'unchanged';
          else
            update public.inventory set stock_qty = desired,
              item_code = coalesce(item_code, code),
              material_number = coalesce(material_number, material_no),
              updated_at = now(), updated_by = 'Gmail 자동화'
              where id = matched.id;
            insert into public.inventory_movements
              (inventory_id, change_qty, before_qty, after_qty, reason, changed_by_name)
            values (matched.id, desired - matched.stock_qty, matched.stock_qty, desired,
              left('Gmail 메일 ' || p_message_id || ' / ' || source_file, 500), 'Gmail 자동화');
            row_status := 'updated';
          end if;
        else
          insert into public.inventory
            (major_category,item_code,material_number,item_name,category,spec,model_name,purpose,
             service_life,standard_qty,stock_qty,unit,location,updated_by)
          values
            (major,code,material_no,item_name,nullif(source_row->>'category',''),item_spec,
             nullif(source_row->>'model_name',''),nullif(source_row->>'purpose',''),
             nullif(source_row->>'service_life',''),
             case when source_row->>'standard_qty' ~ '^[0-9]{1,10}$'
               then case when (source_row->>'standard_qty')::numeric <= 2147483647
                 then (source_row->>'standard_qty')::integer else null end
               else null end,
             desired,coalesce(nullif(source_row->>'unit',''),'EA'),
             nullif(source_row->>'location',''),'Gmail 자동화')
          returning * into matched;
          row_status := 'created';
        end if;
      end if;
      end if;
    end if;
    insert into private.inventory_mail_rows
      (message_id,source_key,source_file,inventory_id,stock_qty,status,note)
    values (p_message_id,source_key,source_file,matched.id,desired,row_status,row_note);
    counts := jsonb_set(counts,array[row_status],
      to_jsonb((counts->>row_status)::integer + 1));
  end loop;
  return counts;
end;
$$;

revoke all on function private.apply_inventory_mail_snapshot(text,jsonb)
  from public, anon, authenticated;

-- Photo entries refer to a row already matched by apply_inventory_mail_snapshot.
-- Keep photo import separate so an unsupported image cannot roll back stock.
create or replace function private.apply_inventory_mail_photos(
  p_message_id text, p_photos jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  photo jsonb;
  item_id uuid;
  encoded text;
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
       and length(encoded) between 8 and 4000000 then
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
    counts := jsonb_set(counts,array[result_status],
      to_jsonb((counts->>result_status)::integer + 1));
  end loop;
  return counts;
end;
$$;

revoke all on function private.apply_inventory_mail_photos(text,jsonb)
  from public, anon, authenticated;
