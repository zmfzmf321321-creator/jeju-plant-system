-- Run in the Supabase SQL Editor as postgres; all fixtures are rolled back.
begin;
create temporary table approval_test_identities (kind text primary key, id uuid not null);
insert into approval_test_identities values
  ('pending', gen_random_uuid()), ('approved', gen_random_uuid()), ('revoked', gen_random_uuid());
insert into auth.users (id, email, raw_user_meta_data)
select id, 'approval-security-test-' || id::text || '@example.invalid',
  '{"name":"security test","role":"admin","is_approved":true}'::jsonb
from approval_test_identities;
do $$
begin
  if exists (
    select 1 from public.user_profiles p join approval_test_identities t on t.id = p.id
    where p.is_approved is distinct from false or p.role <> 'member'
  ) then raise exception 'FAIL: signup metadata granted approval or admin'; end if;
end;
$$;
update public.user_profiles set is_approved = true
where id in (select id from approval_test_identities where kind in ('approved','revoked'));
create temporary table approval_test_results (name text, passed boolean);
grant select on approval_test_identities to authenticated, anon;
grant insert, select on approval_test_results to authenticated, anon;
create temporary table approval_test_fixture (instrument_id bigint);
insert into approval_test_fixture values (-9000000000000000000);
grant select on approval_test_fixture to authenticated;
insert into public.instruments (id, tag_no, name, x_coord, y_coord, history_logs)
select instrument_id, 'SECURITY-TEST', 'transaction-only fixture', 0, 0, '[]'::jsonb
from approval_test_fixture;

-- Signed-out clients must have neither table privileges nor public photo serving.
do $$
declare tbl text;
begin
  foreach tbl in array array['user_profiles','instruments','Instrumnet_calibration',
    'inventory','settings','ai_chat_history','logic_change_logs','maintenance_todos',
    'maintenance_todo_progress','maintenance_materials','tms_equipment','ai_inspections']
  loop
    if has_table_privilege('anon', format('public.%I', tbl), 'SELECT')
       or has_table_privilege('anon', format('public.%I', tbl), 'INSERT')
       or has_table_privilege('anon', format('public.%I', tbl), 'UPDATE')
       or has_table_privilege('anon', format('public.%I', tbl), 'DELETE')
    then raise exception 'FAIL: anon privileges on %', tbl; end if;
  end loop;
  if exists (select 1 from storage.buckets
    where id in ('instrument-photos','maintenance-materials') and public)
  then raise exception 'FAIL: application bucket is public'; end if;
end;
$$;
insert into approval_test_results values ('anonymous business privileges and public files denied', true);

select set_config('request.jwt.claims',
  jsonb_build_object('sub',id,'role','authenticated','is_anonymous',false)::text, true)
from approval_test_identities where kind = 'pending';
set local role authenticated;
do $$
declare tbl text; visible bigint; changed bigint;
begin
  if private.is_approved_user() then raise exception 'FAIL: pending user approved'; end if;
  if (select count(*) from public.user_profiles) <> 1
  then raise exception 'FAIL: pending profile visibility'; end if;
  foreach tbl in array array['instruments','Instrumnet_calibration','inventory',
    'settings','ai_chat_history','logic_change_logs','maintenance_todos',
    'maintenance_todo_progress','maintenance_materials','tms_equipment','ai_inspections']
  loop
    execute format('select count(*) from public.%I', tbl) into visible;
    if visible <> 0 then raise exception 'FAIL: pending user reads %', tbl; end if;
  end loop;
  if (select count(*) from storage.objects) <> 0 then raise exception 'FAIL: pending files readable'; end if;
  begin
    insert into public.instruments (id,tag_no,name,x_coord,y_coord)
    values (-8999999999999999999,'DENIED','DENIED',0,0);
    raise exception 'FAIL: pending insert permitted';
  exception when insufficient_privilege then null;
  end;
  update public.instruments set name='DENIED' where id = (select instrument_id from approval_test_fixture);
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: pending update permitted'; end if;
  delete from public.instruments where id = (select instrument_id from approval_test_fixture);
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: pending delete permitted'; end if;
  begin
    update public.user_profiles set is_approved=true where id=(select auth.uid());
    raise exception 'FAIL: self approval permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.user_profiles set role='admin' where id=(select auth.uid());
    raise exception 'FAIL: self promotion permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_user_approval((select auth.uid()),true);
    raise exception 'FAIL: approval RPC available';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects(bucket_id,name,owner_id)
    values ('instrument-photos',(select auth.uid())::text || '/denied.png',(select auth.uid())::text);
    raise exception 'FAIL: pending upload permitted';
  exception when insufficient_privilege then null;
  end;
  insert into approval_test_results values ('pending read/write/upload/self-approval/admin escalation/RPC denied',true);
end;
$$;
reset role;

select set_config('request.jwt.claims',
  jsonb_build_object('sub',id,'role','authenticated','is_anonymous',false)::text, true)
from approval_test_identities where kind = 'approved';
set local role authenticated;
do $$
declare changed bigint; calibration_id bigint;
begin
  if not private.is_approved_user() then raise exception 'FAIL: approved user denied'; end if;
  if (select count(*) from public.instruments where id=(select instrument_id from approval_test_fixture)) <> 1
  then raise exception 'FAIL: approved read denied'; end if;
  update public.instruments set name='APPROVED' where id=(select instrument_id from approval_test_fixture);
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'FAIL: approved update denied'; end if;
  insert into public.instruments (id,tag_no,name,x_coord,y_coord)
  values (-8999999999999999998,'ALLOWED','ALLOWED',0,0);
  delete from public.instruments where id=-8999999999999999998;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'FAIL: approved insert/delete denied'; end if;
  insert into public."Instrumnet_calibration" ("Tag No","기기명")
  values ('SECURITY-TEST','identity test') returning "구분" into calibration_id;
  if calibration_id is null then raise exception 'FAIL: calibration identity missing'; end if;
  insert into public.ai_chat_history(user_id,user_name,prompt,response)
  values ((select auth.uid()),'security test','allowed','allowed');
  begin
    insert into public.ai_chat_history(user_id,user_name,prompt,response)
    values ((select id from approval_test_identities where kind='pending'),'forged','denied','denied');
    raise exception 'FAIL: chat owner forgery allowed';
  exception when insufficient_privilege then null;
  end;
  insert into storage.objects(bucket_id,name,owner_id)
  values ('instrument-photos',(select auth.uid())::text || '/allowed.png',(select auth.uid())::text);
  begin
    insert into storage.objects(bucket_id,name,owner_id)
    values ('instrument-photos','other-user/denied.png',(select auth.uid())::text);
    raise exception 'FAIL: upload path forgery allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_user_approval((select id from approval_test_identities where kind='pending'),true);
    raise exception 'FAIL: approved user can approve via RPC';
  exception when insufficient_privilege then null;
  end;
  insert into approval_test_results values ('approved CRUD/calibration identity/own chat/own upload allowed; forgery denied',true);
end;
$$;
reset role;

-- The same JWT claims cease granting access as soon as dashboard approval is revoked.
select set_config('request.jwt.claims',
  jsonb_build_object('sub',id,'role','authenticated','is_anonymous',false)::text, true)
from approval_test_identities where kind = 'revoked';
update public.user_profiles set is_approved=false where id in
  (select id from approval_test_identities where kind='revoked');
set local role authenticated;
do $$
begin
  if private.is_approved_user() or (select count(*) from public.instruments) <> 0
    or (select count(*) from storage.objects) <> 0
  then raise exception 'FAIL: stale JWT bypasses revoked approval'; end if;
  insert into approval_test_results values ('revoked approval denies existing JWT claims',true);
end;
$$;
reset role;
-- Approved anonymous sign-ins are not accepted as team identities.
select set_config('request.jwt.claims',
  jsonb_build_object('sub',id,'role','authenticated','is_anonymous',true)::text, true)
from approval_test_identities where kind = 'approved';
set local role authenticated;
do $$
begin
  if private.is_approved_user() or (select count(*) from public.instruments) <> 0
  then raise exception 'FAIL: anonymous Auth user accepted'; end if;
  insert into approval_test_results values ('anonymous Auth sign-in denied',true);
end;
$$;
reset role;
select name, passed from approval_test_results order by name;
rollback;
