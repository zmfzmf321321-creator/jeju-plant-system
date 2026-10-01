-- Approval is granted only by a trusted operator in the Supabase dashboard.
-- Preserve existing users, approvals, records and object paths.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_approved_user()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select coalesce(
    (select p.is_approved from public.user_profiles p where p.id = (select auth.uid())),
    false
  ) and not coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;
create or replace function private.is_current_user_admin()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid()) and p.is_approved = true and p.role = 'admin'
  );
$$;
revoke all on function private.is_approved_user() from public, anon;
revoke all on function private.is_current_user_admin() from public, anon;
grant execute on function private.is_approved_user() to authenticated, service_role;
grant execute on function private.is_current_user_admin() to authenticated, service_role;

-- Remove overlapping permissive policies, then add a restrictive approval gate.
do $$
declare item record; table_name text;
begin
  for item in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename = any(array[
      'user_profiles','instruments','Instrumnet_calibration','inventory','settings',
      'ai_chat_history','logic_change_logs','maintenance_todos',
      'maintenance_todo_progress','maintenance_materials','tms_equipment','ai_inspections'
    ])
  loop
    execute format('drop policy %I on %I.%I', item.policyname, item.schemaname, item.tablename);
  end loop;
  for table_name in select unnest(array[
    'instruments','Instrumnet_calibration','inventory','settings','ai_chat_history',
    'logic_change_logs','maintenance_todos','maintenance_todo_progress',
    'maintenance_materials','tms_equipment','ai_inspections'
  ])
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format(
      'create policy dashboard_approval_required on public.%I as restrictive for all to authenticated using ((select private.is_approved_user())) with check ((select private.is_approved_user()))',
      table_name
    );
  end loop;
end;
$$;

-- Pending users can inspect only their own approval status and submit identity fields.
alter table public.user_profiles enable row level security;
alter table public.user_profiles alter column is_approved set default false;
alter table public.user_profiles alter column role set default 'member';
revoke all on table public.user_profiles from public, anon, authenticated;
do $$
declare col record;
begin
  for col in select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'user_profiles'
  loop
    execute format('revoke all (%I) on public.user_profiles from public, anon, authenticated', col.column_name);
  end loop;
end;
$$;
grant select on public.user_profiles to authenticated;
grant insert (id, email, name) on public.user_profiles to authenticated;
create policy own_approval_status on public.user_profiles for select to authenticated
using (id = (select auth.uid()));
create policy submit_pending_profile on public.user_profiles for insert to authenticated
with check (id = (select auth.uid()) and role = 'member' and is_approved = false);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.user_profiles (id, email, name, role, is_approved)
  values (new.id, new.email, new.raw_user_meta_data->>'name', 'member', false);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.prevent_profile_privilege_change() from public, anon, authenticated;
-- No browser account, including an app admin, may approve users through RPC.
revoke all on function public.admin_list_approval_users() from public, anon, authenticated;
revoke all on function public.set_user_approval(uuid, boolean) from public, anon, authenticated;

grant select, insert, update, delete on public.instruments, public.inventory to authenticated;
create policy approved_team_instruments on public.instruments for all to authenticated
using (true) with check (true);
create policy approved_team_inventory on public.inventory for all to authenticated
using (true) with check (true);

grant select, insert, update on public."Instrumnet_calibration" to authenticated;
create policy approved_team_calibration on public."Instrumnet_calibration" for all to authenticated
using (true) with check (true);
-- Existing imported IDs are retained; new IDs no longer need a client-side MAX(id).
alter table public."Instrumnet_calibration"
  alter column "구분" add generated by default as identity;
select setval(pg_get_serial_sequence('public."Instrumnet_calibration"', '구분'),
  greatest(coalesce((select max("구분") from public."Instrumnet_calibration"), 0) + 1, 1), false);

grant select on public.settings to authenticated;
create policy approved_settings_read on public.settings for select to authenticated using (true);

grant select, insert on public.logic_change_logs to authenticated;
create policy approved_logic_read on public.logic_change_logs for select to authenticated using (true);
create policy approved_logic_insert on public.logic_change_logs for insert to authenticated
with check (created_by = (select auth.uid()));

grant select, insert on public.maintenance_todos to authenticated;
grant update (task_text, completed_at, completed_by) on public.maintenance_todos to authenticated;
create policy approved_todo_read on public.maintenance_todos for select to authenticated using (true);
create policy approved_todo_insert on public.maintenance_todos for insert to authenticated
with check (created_by = (select auth.uid()) and completed_at is null and completed_by is null);
create policy approved_todo_update on public.maintenance_todos for update to authenticated
using (true) with check (
  (completed_at is null and completed_by is null)
  or (completed_at is not null and completed_by = (select auth.uid()))
);
grant select, insert on public.maintenance_todo_progress to authenticated;
create policy approved_progress_read on public.maintenance_todo_progress for select to authenticated using (true);
create policy approved_progress_insert on public.maintenance_todo_progress for insert to authenticated
with check (created_by = (select auth.uid()));

grant select, insert, delete on public.maintenance_materials to authenticated;
create policy approved_material_read on public.maintenance_materials for select to authenticated using (true);
create policy approved_material_insert on public.maintenance_materials for insert to authenticated
with check (uploaded_by = (select auth.uid()));
create policy approved_material_delete on public.maintenance_materials for delete to authenticated
using (uploaded_by = (select auth.uid()) or (select private.is_current_user_admin()));

grant select, insert, update, delete on public.tms_equipment to authenticated;
create policy approved_tms_read on public.tms_equipment for select to authenticated using (true);
create policy approved_tms_insert on public.tms_equipment for insert to authenticated
with check (created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy approved_tms_update on public.tms_equipment for update to authenticated
using (true) with check (updated_by = (select auth.uid()));
create policy approved_tms_delete on public.tms_equipment for delete to authenticated using (true);

grant select, insert, delete on public.ai_inspections to authenticated;
grant update (major_category, unit, title, question, ai_summary, checklist, photo_urls,
  result_summary, status, created_by_name, updated_at, completed_at)
on public.ai_inspections to authenticated;
create policy approved_inspection_read on public.ai_inspections for select to authenticated using (true);
create policy approved_inspection_insert on public.ai_inspections for insert to authenticated
with check (created_by = (select auth.uid()));
create policy approved_inspection_update on public.ai_inspections for update to authenticated
using (true) with check (true);
create policy approved_inspection_delete on public.ai_inspections for delete to authenticated using (true);

alter table public.ai_chat_history
  add column user_id uuid default auth.uid() references auth.users(id) on delete set null;
-- Link legacy histories only when their name identifies exactly one existing profile.
-- Ambiguous histories are retained and accessible to approved admins only.
update public.ai_chat_history h set user_id = p.id
from public.user_profiles p
where h.user_id is null and h.user_name = p.name
  and (select count(*) from public.user_profiles other where other.name = h.user_name) = 1;
create index ai_chat_history_user_created_idx on public.ai_chat_history (user_id, created_at desc);
grant select, insert on public.ai_chat_history to authenticated;
create policy approved_own_chat_read on public.ai_chat_history for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_current_user_admin()));
create policy approved_own_chat_insert on public.ai_chat_history for insert to authenticated
with check (user_id = (select auth.uid()));

-- Keep identity generation usable without granting clients ALTER/TRUNCATE privileges.
grant usage, select on sequence public.instruments_id_seq,
  public.ai_chat_history_id_seq, public.logic_change_logs_id_seq to authenticated;
do $$
begin
  execute format('grant usage, select on sequence %s to authenticated',
    pg_get_serial_sequence('public."Instrumnet_calibration"', '구분'));
end;
$$;

-- Public image serving bypasses RLS: both application buckets must be private.
update storage.buckets set public = false where id in ('instrument-photos', 'maintenance-materials');
update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
where id = 'instrument-photos';
do $$
declare item record;
begin
  for item in select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy %I on storage.objects', item.policyname);
  end loop;
end;
$$;
create policy dashboard_approval_required on storage.objects as restrictive for all to authenticated
using ((select private.is_approved_user())) with check ((select private.is_approved_user()));
create policy approved_application_files_read on storage.objects for select to authenticated
using (bucket_id in ('instrument-photos','maintenance-materials'));
create policy approved_application_files_insert on storage.objects for insert to authenticated
with check (
  bucket_id in ('instrument-photos','maintenance-materials')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy approved_application_files_delete on storage.objects for delete to authenticated
using (
  bucket_id in ('instrument-photos','maintenance-materials')
  and (owner_id = (select auth.uid())::text or (select private.is_current_user_admin()))
);
