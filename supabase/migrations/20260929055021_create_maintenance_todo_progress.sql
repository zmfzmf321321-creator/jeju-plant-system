create table public.maintenance_todo_progress (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references public.maintenance_todos(id) on delete cascade,
  update_text text not null check (length(btrim(update_text)) > 0),
  created_by uuid not null default auth.uid(),
  created_by_name text not null default '작업자',
  created_at timestamptz not null default now()
);

alter table public.maintenance_todo_progress enable row level security;
revoke all on table public.maintenance_todo_progress from public, anon;
grant select, insert on table public.maintenance_todo_progress to authenticated;
grant all on table public.maintenance_todo_progress to service_role;

create policy "Authenticated team members can read todo progress"
on public.maintenance_todo_progress
for select
to authenticated
using (true);

create policy "Authenticated team members can add own todo progress"
on public.maintenance_todo_progress
for insert
to authenticated
with check ((select auth.uid()) = created_by);
