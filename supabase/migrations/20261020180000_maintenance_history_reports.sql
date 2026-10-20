create table if not exists public.maintenance_history_reports (
  id uuid primary key default gen_random_uuid(),
  email_message_id text unique,
  title text not null,
  inspection_type text not null default 'planned_preventive'
    check (inspection_type in ('routine', 'planned_preventive', 'special')),
  major_category text not null check (major_category in ('기력', '내연')),
  unit text not null default '',
  department text not null default '',
  work_date date,
  received_date date not null,
  summary text not null default '',
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now()
);

create index if not exists maintenance_history_reports_received_idx
  on public.maintenance_history_reports (received_date desc);

alter table public.maintenance_history_reports enable row level security;
revoke all on public.maintenance_history_reports from anon;
grant select on public.maintenance_history_reports to authenticated;

create policy maintenance_history_reports_approved_read
  on public.maintenance_history_reports for select to authenticated
  using ((select private.is_approved_user()));
