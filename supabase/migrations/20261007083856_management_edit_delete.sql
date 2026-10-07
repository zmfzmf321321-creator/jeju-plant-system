-- Editing remains subject to the restrictive approval gates installed earlier.
grant delete on public."Instrumnet_calibration" to authenticated;
grant update (major_category, equipment_name, change_content, change_reason, change_date)
  on public.logic_change_logs to authenticated;
grant delete on public.logic_change_logs to authenticated;
drop policy if exists approved_logic_update on public.logic_change_logs;
create policy approved_logic_update on public.logic_change_logs for update to authenticated
  using (true) with check (true);
create policy approved_logic_delete on public.logic_change_logs for delete to authenticated
  using (true);

grant delete on public.maintenance_todos to authenticated;
drop policy approved_todo_update on public.maintenance_todos;
create policy approved_todo_update on public.maintenance_todos for update to authenticated
  using (true) with check (true);
create policy approved_todo_delete on public.maintenance_todos for delete to authenticated
  using (true);
create function private.validate_todo_completion_change()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if (new.completed_at, new.completed_by) is distinct from (old.completed_at, old.completed_by)
     and not (
       (new.completed_at is null and new.completed_by is null)
       or (new.completed_at is not null and new.completed_by = auth.uid())
     ) then
    raise exception '완료 처리자는 현재 사용자여야 합니다.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_todo_completion_change() from public, anon, authenticated;
create trigger validate_todo_completion_change
  before update on public.maintenance_todos for each row
  execute function private.validate_todo_completion_change();
grant update (update_text) on public.maintenance_todo_progress to authenticated;
grant delete on public.maintenance_todo_progress to authenticated;
create policy approved_progress_update on public.maintenance_todo_progress for update to authenticated
  using (true) with check (true);
create policy approved_progress_delete on public.maintenance_todo_progress for delete to authenticated
  using (true);

grant update (major_category, title, description, material_type, original_file_name,
  storage_path, mime_type, file_size) on public.maintenance_materials to authenticated;
drop policy approved_material_delete on public.maintenance_materials;
create policy approved_material_update on public.maintenance_materials for update to authenticated
  using (true) with check (true);
create policy approved_material_delete on public.maintenance_materials for delete to authenticated
  using (true);

grant update (prompt, response) on public.ai_chat_history to authenticated;
grant delete on public.ai_chat_history to authenticated;
create policy approved_own_chat_update on public.ai_chat_history for update to authenticated
  using (user_id is not null and user_id = (select auth.uid()))
  with check (user_id is not null and user_id = (select auth.uid()));
create policy approved_own_chat_delete on public.ai_chat_history for delete to authenticated
  using (user_id is not null and user_id = (select auth.uid()));

-- Photo metadata can be removed by any approved colleague. The object itself is
-- removed through the Storage API, whose approval gate remains restrictive.
grant delete on public.inventory_photos to authenticated;
create policy inventory_photo_delete on public.inventory_photos for delete to authenticated
  using (true);
drop policy approved_application_files_delete on storage.objects;

-- Only the RPCs below may change stock history. A parent inventory row lock
-- serializes them with change_inventory_stock and the mail import procedure.
alter table public.inventory_movements
  add column occurred_at timestamptz not null default now();
update public.inventory_movements set occurred_at = created_at;
create index inventory_movements_item_occurred_idx
  on public.inventory_movements (inventory_id, occurred_at desc, id desc);

create function private.recalculate_inventory_movements(p_inventory_id uuid)
returns integer language plpgsql security invoker set search_path = ''
as $$
declare
  movement record;
  balance bigint := 0;
begin
  for movement in
    select id, change_qty from public.inventory_movements
    where inventory_id = p_inventory_id order by occurred_at, id
  loop
    balance := balance + movement.change_qty::bigint;
    if balance < 0 or balance > 2147483647 then
      raise exception '이력 변경으로 중간 재고가 유효 범위를 벗어납니다.' using errcode = '22023';
    end if;
    update public.inventory_movements
      set before_qty = (balance - movement.change_qty)::integer,
          after_qty = balance::integer
      where id = movement.id;
  end loop;
  return balance::integer;
end;
$$;
revoke all on function private.recalculate_inventory_movements(uuid)
  from public, anon, authenticated;

create function public.update_inventory_movement(
  p_movement_id bigint, p_change_qty integer, p_reason text, p_created_at timestamptz
)
returns public.inventory_movements language plpgsql security definer set search_path = ''
as $$
declare
  item public.inventory;
  movement public.inventory_movements;
  movement_inventory_id uuid;
  final_qty integer;
  existing_qty bigint;
begin
  if auth.uid() is null or not private.is_approved_user() then
    raise exception '승인된 사용자만 재고 이력을 수정할 수 있습니다.' using errcode = '42501';
  end if;
  if p_change_qty is null or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500
     or p_created_at is null then
    raise exception '변경 수량, 사유, 작업일을 확인해 주세요.' using errcode = '22023';
  end if;
  select inventory_id into movement_inventory_id from public.inventory_movements
    where id = p_movement_id;
  if not found then
    raise exception '재고 이력을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  select * into item from public.inventory where id = movement_inventory_id for update;
  if not found then
    raise exception '자재를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  select * into movement from public.inventory_movements
    where id = p_movement_id and inventory_id = item.id for update;
  if not found then
    raise exception '재고 이력이 변경되었습니다. 다시 시도해 주세요.' using errcode = '40001';
  end if;
  select coalesce(sum(change_qty::bigint), 0) into existing_qty
    from public.inventory_movements where inventory_id = item.id;
  if existing_qty <> item.stock_qty then
    raise exception '현재고와 기존 이력이 일치하지 않습니다.' using errcode = '23514';
  end if;
  update public.inventory_movements
    set change_qty = p_change_qty, reason = btrim(p_reason), occurred_at = p_created_at
    where id = p_movement_id;
  final_qty := private.recalculate_inventory_movements(item.id);
  update public.inventory set stock_qty = final_qty, updated_at = now()
    where id = item.id;
  select * into movement from public.inventory_movements where id = p_movement_id;
  return movement;
end;
$$;
revoke all on function public.update_inventory_movement(bigint, integer, text, timestamptz)
  from public, anon;
grant execute on function public.update_inventory_movement(bigint, integer, text, timestamptz)
  to authenticated;

create function public.delete_inventory_movement(p_movement_id bigint)
returns public.inventory language plpgsql security definer set search_path = ''
as $$
declare
  item public.inventory;
  movement_inventory_id uuid;
  final_qty integer;
  existing_qty bigint;
begin
  if auth.uid() is null or not private.is_approved_user() then
    raise exception '승인된 사용자만 재고 이력을 삭제할 수 있습니다.' using errcode = '42501';
  end if;
  select inventory_id into movement_inventory_id from public.inventory_movements
    where id = p_movement_id;
  if not found then
    raise exception '재고 이력을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  select * into item from public.inventory where id = movement_inventory_id for update;
  if not found then
    raise exception '자재를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  perform 1 from public.inventory_movements
    where id = p_movement_id and inventory_id = item.id for update;
  if not found then
    raise exception '재고 이력이 변경되었습니다. 다시 시도해 주세요.' using errcode = '40001';
  end if;
  select coalesce(sum(change_qty::bigint), 0) into existing_qty
    from public.inventory_movements where inventory_id = item.id;
  if existing_qty <> item.stock_qty then
    raise exception '현재고와 기존 이력이 일치하지 않습니다.' using errcode = '23514';
  end if;
  delete from public.inventory_movements where id = p_movement_id;
  final_qty := private.recalculate_inventory_movements(item.id);
  update public.inventory set stock_qty = final_qty, updated_at = now()
    where id = item.id returning * into item;
  return item;
end;
$$;
revoke all on function public.delete_inventory_movement(bigint) from public, anon;
grant execute on function public.delete_inventory_movement(bigint) to authenticated;

create function public.delete_inventory_item(p_inventory_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  item public.inventory;
begin
  if auth.uid() is null or not private.is_approved_user() then
    raise exception '승인된 사용자만 자재를 삭제할 수 있습니다.' using errcode = '42501';
  end if;
  select * into item from public.inventory where id = p_inventory_id for update;
  if not found then
    raise exception '자재를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  -- Preserve imported mail audit rows without a dangling inventory reference.
  update private.inventory_mail_rows set inventory_id = null where inventory_id = p_inventory_id;
  delete from public.inventory_movements where inventory_id = p_inventory_id;
  delete from public.inventory_photos where inventory_id = p_inventory_id;
  delete from public.inventory where id = p_inventory_id;
end;
$$;
revoke all on function public.delete_inventory_item(uuid) from public, anon;
grant execute on function public.delete_inventory_item(uuid) to authenticated;

-- A Storage object can be shared by inventory, instrument and AI records.
-- Call before removing an instrument-photos object. The two exclusions are used
-- for the photo row or inventory item that the caller is deleting.
create function public.can_delete_inventory_photo_object(
  p_storage_url text, p_exclude_photo_id uuid default null, p_exclude_inventory_id uuid default null
)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_approved_user() then
    raise exception '승인된 사용자만 사진 참조를 확인할 수 있습니다.' using errcode = '42501';
  end if;
  if p_storage_url is null or p_storage_url not like
      'https://euohxdxddvyldtfdvpkk.supabase.co/storage/v1/object/public/instrument-photos/%' then
    return false;
  end if;
  return not (
    exists (
      select 1 from public.inventory_photos p
      where p.storage_url = p_storage_url
        and (p_exclude_photo_id is null or p.id <> p_exclude_photo_id)
        and (p_exclude_inventory_id is null or p.inventory_id <> p_exclude_inventory_id)
    )
    or exists (
      select 1 from public.instruments i
      where i.photo_url = p_storage_url or i.image_data = p_storage_url
        or jsonb_path_exists(to_jsonb(i.history_logs), '$.** ? (@ == $url)',
          jsonb_build_object('url', to_jsonb(p_storage_url)))
    )
    or exists (
      select 1 from public.ai_inspections a
      where jsonb_path_exists(to_jsonb(a.photo_urls), '$.** ? (@ == $url)',
        jsonb_build_object('url', to_jsonb(p_storage_url)))
    )
  );
end;
$$;
revoke all on function public.can_delete_inventory_photo_object(text, uuid, uuid)
  from public, anon;
grant execute on function public.can_delete_inventory_photo_object(text, uuid, uuid)
  to authenticated;

-- Enforce reference checks at the Storage API boundary as well as in the UI.
-- The existing restrictive dashboard_approval_required policy still applies.
create policy approved_application_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('instrument-photos', 'maintenance-materials')
    and (
      (bucket_id = 'maintenance-materials' and not exists (
        select 1 from public.maintenance_materials m where m.storage_path = storage.objects.name
      ))
      or (bucket_id = 'instrument-photos' and public.can_delete_inventory_photo_object(
        'https://euohxdxddvyldtfdvpkk.supabase.co/storage/v1/object/public/instrument-photos/'
          || storage.objects.name
      ))
    )
  );
