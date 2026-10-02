-- Extend the existing inventory table so a Dashboard CSV import can seed stock.
alter table public.inventory
  add column if not exists item_code text,
  add column if not exists model_name text,
  add column if not exists standard_qty integer not null default 0,
  add column if not exists is_archived boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

update public.inventory set stock_qty = 0 where stock_qty is null;
alter table public.inventory alter column stock_qty set not null;
alter table public.inventory
  add constraint inventory_quantity_bounds
  check (standard_qty >= 0 and stock_qty >= 0 and stock_qty <= standard_qty),
  add constraint inventory_item_code_length
  check (item_code is null or char_length(btrim(item_code)) between 1 and 100),
  add constraint inventory_model_name_length
  check (model_name is null or char_length(model_name) <= 200);
create unique index inventory_item_code_unique
  on public.inventory (lower(btrim(item_code))) where item_code is not null;

create table public.inventory_movements (
  id bigint generated always as identity primary key,
  inventory_id uuid not null references public.inventory(id) on delete restrict,
  change_qty integer not null,
  before_qty integer not null,
  after_qty integer not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  changed_by uuid references auth.users(id),
  changed_by_name text not null default '작업자',
  created_at timestamptz not null default now(),
  constraint inventory_movement_consistent check (after_qty = before_qty + change_qty)
);
create index inventory_movements_item_date_idx
  on public.inventory_movements (inventory_id, created_at desc, id desc);
alter table public.inventory_movements enable row level security;
revoke all on public.inventory_movements from public, anon, authenticated;
grant select on public.inventory_movements to authenticated;
create policy dashboard_approval_required on public.inventory_movements
  as restrictive for all to authenticated
  using ((select private.is_approved_user()))
  with check ((select private.is_approved_user()));
create policy approved_inventory_movements_read on public.inventory_movements
  for select to authenticated using (true);

-- An imported row or a manually registered item gets an initial balance entry.
create function public.log_initial_inventory_stock()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.inventory_movements
    (inventory_id, change_qty, before_qty, after_qty, reason, changed_by, changed_by_name)
  values
    (new.id, new.stock_qty, 0, new.stock_qty, '초기 재고 등록', auth.uid(),
     coalesce(nullif(btrim(new.updated_by), ''), 'CSV 또는 관리자 등록'));
  return new;
end;
$$;
revoke all on function public.log_initial_inventory_stock() from public, anon, authenticated;
create trigger inventory_initial_stock_log
  after insert on public.inventory for each row
  execute function public.log_initial_inventory_stock();

-- Existing rows, if any, become the auditable starting balance.
insert into public.inventory_movements
  (inventory_id, change_qty, before_qty, after_qty, reason, changed_by_name)
select id, stock_qty, 0, stock_qty, '기존 재고 이관', '시스템'
from public.inventory;

-- Keep quantity changes and their reasons in one transaction under a row lock.
create function public.change_inventory_stock(p_inventory_id uuid, p_change_qty integer, p_reason text)
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
  if next_qty < 0 or next_qty > item.standard_qty then
    raise exception '현재고는 0 이상 정수 이하이어야 합니다.' using errcode = '22023';
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
revoke all on function public.change_inventory_stock(uuid, integer, text) from public, anon;
grant execute on function public.change_inventory_stock(uuid, integer, text) to authenticated;

-- Browser users may edit descriptions and archive rows, but quantity must use the function.
revoke update, delete on public.inventory from authenticated;
grant update (category, item_name, item_code, spec, model_name, standard_qty,
  unit, location, is_archived, updated_by, updated_at) on public.inventory to authenticated;
