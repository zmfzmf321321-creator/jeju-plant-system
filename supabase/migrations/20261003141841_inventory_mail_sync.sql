-- Keep Gmail synchronization state outside the exposed Data API.
create table if not exists private.inventory_mail_messages (
  message_id text primary key,
  received_at timestamptz not null,
  processed_at timestamptz not null default now(),
  status text not null check (status in ('applied', 'irrelevant', 'needs_review')),
  note text
);

create table if not exists private.inventory_mail_rows (
  message_id text not null,
  source_key text not null,
  source_file text not null,
  inventory_id uuid references public.inventory(id),
  stock_qty integer,
  status text not null check (status in ('created', 'updated', 'unchanged', 'needs_review')),
  note text,
  processed_at timestamptz not null default now(),
  primary key (message_id, source_key)
);

revoke all on private.inventory_mail_messages from public, anon, authenticated;
revoke all on private.inventory_mail_rows from public, anon, authenticated;

-- Called by the trusted scheduled worker through the Supabase management connection.
create or replace function private.apply_inventory_mail_snapshot(
  p_message_id text, p_rows jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  source_row jsonb;
  source_key text;
  source_file text;
  major text;
  code text;
  item_name text;
  item_spec text;
  desired integer;
  matched public.inventory;
  matched_id uuid;
  match_count integer;
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
    desired := null;
    source_key := nullif(btrim(source_row->>'source_key'), '');
    source_file := left(coalesce(source_row->>'source_file', ''), 255);
    major := nullif(btrim(source_row->>'major_category'), '');
    code := nullif(btrim(source_row->>'item_code'), '');
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
       or length(code) > 100 or length(item_name) > 300 then
      row_note := '대분류, 품명 또는 현재고를 확인할 수 없음';
    else
      desired := (source_row->>'stock_qty')::integer;
      if code is not null then
        select count(*), (array_agg(i.id))[1] into match_count, matched_id
          from public.inventory i where lower(btrim(i.item_code)) = lower(code);
      else
        select count(*), (array_agg(i.id))[1] into match_count, matched_id
          from public.inventory i
          where i.major_category = major
            and lower(btrim(i.item_name)) = lower(item_name)
            and lower(btrim(coalesce(i.spec,''))) = lower(coalesce(item_spec,''));
      end if;
      if match_count > 1 then
        row_note := '기존 품목이 여러 개 일치함';
      else
        if match_count = 1 then
          select * into matched from public.inventory where id = matched_id for update;
          if matched.is_archived or matched.major_category <> major then
            row_note := '보관 종료 또는 대분류 불일치';
          elsif matched.stock_qty = desired then
            row_status := 'unchanged';
          else
            update public.inventory set stock_qty = desired,
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
            (major_category,item_code,item_name,category,spec,model_name,purpose,
             service_life,standard_qty,stock_qty,unit,location,updated_by)
          values
            (major,code,item_name,nullif(source_row->>'category',''),item_spec,
             nullif(source_row->>'model_name',''),nullif(source_row->>'purpose',''),
             nullif(source_row->>'service_life',''),
             case when source_row->>'standard_qty' ~ '^[0-9]+$'
               then (source_row->>'standard_qty')::integer else null end,
             desired,coalesce(nullif(source_row->>'unit',''),'EA'),
             nullif(source_row->>'location',''),'Gmail 자동화')
          returning * into matched;
          row_status := 'created';
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
