alter table public.inventory
  alter column standard_qty drop not null,
  alter column standard_qty drop default;
alter table public.inventory
  drop constraint inventory_quantity_bounds;
alter table public.inventory
  add constraint inventory_quantity_bounds
  check ((standard_qty is null or standard_qty >= 0) and stock_qty >= 0);

create or replace function public.change_inventory_stock(p_inventory_id uuid, p_change_qty integer, p_reason text)
returns public.inventory language plpgsql security definer set search_path = ''
as $$
declare
  item public.inventory;
  next_qty integer;
  actor_name text;
begin
  if auth.uid() is null or not private.is_approved_user() then
    raise exception '승인된 사용자만 재고를 변경할 수 있습니다.' using errcode = '42501';
  end if;
  if p_change_qty is null or p_change_qty = 0 or p_reason is null
     or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception '변경 수량과 사유를 확인해 주세요.' using errcode = '22023';
  end if;
  select * into item from public.inventory
    where id = p_inventory_id and is_archived = false for update;
  if not found then
    raise exception '자재를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  next_qty := item.stock_qty + p_change_qty;
  if next_qty < 0 then
    raise exception '현재고는 0 이상이어야 합니다.' using errcode = '22023';
  end if;
  select coalesce(nullif(btrim(name), ''), '작업자') into actor_name
    from public.user_profiles where id = auth.uid();
  update public.inventory
    set stock_qty = next_qty, updated_at = now(), updated_by = coalesce(actor_name, '작업자')
    where id = p_inventory_id returning * into item;
  insert into public.inventory_movements
    (inventory_id, change_qty, before_qty, after_qty, reason, changed_by, changed_by_name)
  values
    (p_inventory_id, p_change_qty, item.stock_qty - p_change_qty, item.stock_qty,
     btrim(p_reason), auth.uid(), coalesce(actor_name, '작업자'));
  return item;
end;
$$;

