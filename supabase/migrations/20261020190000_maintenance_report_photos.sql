create table if not exists public.maintenance_report_photos (
  report_id uuid not null references public.maintenance_history_reports(id) on delete cascade,
  item_index integer not null check (item_index between 0 and 99),
  phase text not null check (phase in ('작업 전', '작업 후')),
  image_base64 text not null,
  primary key (report_id, item_index, phase)
);

alter table public.maintenance_report_photos enable row level security;
revoke all on public.maintenance_report_photos from anon;
grant select on public.maintenance_report_photos to authenticated;

create policy maintenance_report_photos_approved_read
  on public.maintenance_report_photos for select to authenticated
  using ((select private.is_approved_user()));
