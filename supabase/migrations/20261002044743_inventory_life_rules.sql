-- Fixed replacement periods transcribed from the supplied instrument schedule.
-- Manufacturer Life Cycle and condition-dependent periods remain manual.
create function public.infer_inventory_service_life(
  p_item_name text, p_category text, p_spec text, p_model_name text
)
returns text language plpgsql immutable set search_path = ''
as $$
declare
  term text;
  normalized text;
begin
  foreach term in array array[p_item_name, p_category, p_spec, p_model_name] loop
    normalized := upper(regexp_replace(coalesce(term, ''), '[[:space:]_-]+', '', 'g'));
    if normalized = '' then continue; end if;
    if normalized ~ '제어카드|CONTROLCARD|CONTROLIO|GPS수신기|GPSRECEIVER|네트워크스위치|NETWORKSWITCH' then
      return null;
    elsif normalized ~ '포지셔너|POSITIONER|RVDT' then return '6년';
    elsif normalized ~ 'LVDT' then return '10년';
    elsif normalized ~ '로드셀|LOADCELL' then return '15년';
    elsif normalized ~ '운전원용(컴퓨터|PC)' then return '6년';
    elsif normalized ~ '서버(컴퓨터|PC)' then return '6년';
    elsif normalized ~ 'LCD모니터|LCDMONITOR' then return '6년';
    elsif normalized ~ 'PLC' then return '8년';
    elsif normalized ~ '릴레이|RELAY' then return '6년';
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.infer_inventory_service_life(text, text, text, text)
  from public, anon, authenticated;

create function public.set_inventory_service_life()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.service_life is null or btrim(new.service_life) = '' then
      new.service_life := public.infer_inventory_service_life(
        new.item_name, new.category, new.spec, new.model_name);
    end if;
  elsif (new.item_name, new.category, new.spec, new.model_name)
     is distinct from (old.item_name, old.category, old.spec, old.model_name)
     and (new.service_life is null or btrim(new.service_life) = ''
       or (new.service_life is not distinct from old.service_life
         and old.service_life is not distinct from public.infer_inventory_service_life(
           old.item_name, old.category, old.spec, old.model_name))) then
    new.service_life := public.infer_inventory_service_life(
      new.item_name, new.category, new.spec, new.model_name);
  end if;
  return new;
end;
$$;
revoke all on function public.set_inventory_service_life() from public, anon, authenticated;
create trigger inventory_service_life_auto
  before insert or update on public.inventory for each row
  execute function public.set_inventory_service_life();

update public.inventory
  set service_life = public.infer_inventory_service_life(item_name, category, spec, model_name)
  where service_life is null
    and public.infer_inventory_service_life(item_name, category, spec, model_name) is not null;
