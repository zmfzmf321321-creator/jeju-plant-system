create table if not exists public.ai_inspections (
  id uuid primary key default gen_random_uuid(),
  major_category text not null check (major_category in ('기력', '내연')),
  unit text not null default '',
  title text not null,
  question text not null,
  ai_summary text not null default '',
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  result_summary text not null default '',
  status text not null default '진행중' check (status in ('진행중', '완료')),
  photo_urls jsonb not null default '[]'::jsonb check (jsonb_typeof(photo_urls) = 'array'),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ai_inspections_major_created_idx
  on public.ai_inspections (major_category, created_at desc);
create index if not exists ai_inspections_status_idx
  on public.ai_inspections (status);
create index if not exists ai_inspections_created_by_idx
  on public.ai_inspections (created_by);

alter table public.ai_inspections enable row level security;
revoke all on table public.ai_inspections from anon;
grant select, insert, update, delete on table public.ai_inspections to authenticated;

drop policy if exists "approved users can read ai inspections" on public.ai_inspections;
create policy "approved users can read ai inspections"
on public.ai_inspections for select to authenticated
using (
  exists (
    select 1 from public.user_profiles profile
    where profile.id = auth.uid() and profile.is_approved = true
  )
);

drop policy if exists "approved users can create ai inspections" on public.ai_inspections;
create policy "approved users can create ai inspections"
on public.ai_inspections for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.user_profiles profile
    where profile.id = auth.uid() and profile.is_approved = true
  )
);

drop policy if exists "approved users can update ai inspections" on public.ai_inspections;
create policy "approved users can update ai inspections"
on public.ai_inspections for update to authenticated
using (
  exists (
    select 1 from public.user_profiles profile
    where profile.id = auth.uid() and profile.is_approved = true
  )
)
with check (
  exists (
    select 1 from public.user_profiles profile
    where profile.id = auth.uid() and profile.is_approved = true
  )
);

drop policy if exists "approved users can delete ai inspections" on public.ai_inspections;
create policy "approved users can delete ai inspections"
on public.ai_inspections for delete to authenticated
using (
  exists (
    select 1 from public.user_profiles profile
    where profile.id = auth.uid() and profile.is_approved = true
  )
);
