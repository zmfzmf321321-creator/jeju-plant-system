-- Add inventory classification and descriptive fields for CSV imports and editing.
alter table public.inventory
  add column major_category text not null,
  add column purpose text,
  add column service_life text;

alter table public.inventory
  add constraint inventory_major_category_allowed
    check (major_category in ('기력', '내연', '환경')),
  add constraint inventory_purpose_length
    check (purpose is null or char_length(purpose) <= 500),
  add constraint inventory_service_life_length
    check (service_life is null or char_length(service_life) <= 100);

grant update (major_category, purpose, service_life)
  on public.inventory to authenticated;
