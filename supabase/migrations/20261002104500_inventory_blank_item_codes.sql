-- Dashboard CSV imports commonly use blank cells for optional item codes.
alter table public.inventory drop constraint inventory_item_code_length;
alter table public.inventory add constraint inventory_item_code_length
  check (item_code is null or char_length(item_code) <= 100);
drop index public.inventory_item_code_unique;
create unique index inventory_item_code_unique
  on public.inventory (lower(btrim(item_code)))
  where item_code is not null and btrim(item_code) <> '';
