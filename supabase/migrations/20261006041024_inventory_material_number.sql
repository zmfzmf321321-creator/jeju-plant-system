-- Preserve the source workbook's 자재번호 as its own editable inventory field.
alter table public.inventory
  add column material_number text;

alter table public.inventory
  add constraint inventory_material_number_length
  check (material_number is null or char_length(btrim(material_number)) <= 100);

-- Both 2026 source workbooks label the imported code column 자재번호.
update public.inventory
   set material_number = item_code
 where updated_by = '2026 원본 자료 이관'
   and item_code is not null
   and btrim(item_code) <> '';

grant update (material_number) on public.inventory to authenticated;
