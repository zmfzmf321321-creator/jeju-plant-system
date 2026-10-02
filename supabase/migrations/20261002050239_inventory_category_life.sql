-- Prefer the selected instrument category. Fall back to names only for CSV rows
-- with no category, and never guess a fixed period for custom categories.
create or replace function public.infer_inventory_service_life(
  p_item_name text, p_category text, p_spec text, p_model_name text
)
returns text language plpgsql immutable set search_path = ''
as $$
declare
  term text;
  normalized text;
begin
  if nullif(btrim(p_category), '') is not null then
    normalized := upper(regexp_replace(p_category, '[[:space:]_-]+', '', 'g'));
    case normalized
      when 'PLC' then return '8년';
      when '서버컴퓨터' then return '6년';
      when '운전원용컴퓨터' then return '6년';
      when 'LCD모니터' then return '6년';
      when 'LVDT' then return '10년';
      when '포지셔너(RVDT)' then return '6년';
      when '릴레이' then return '6년';
      when '로드셀' then return '15년';
      else return null;
    end case;
  end if;

  foreach term in array array[p_item_name, p_spec, p_model_name] loop
    normalized := upper(regexp_replace(coalesce(term, ''), '[[:space:]_-]+', '', 'g'));
    if normalized = '' then continue; end if;
    if normalized ~ '제어카드|CONTROLCARD|CONTROLIO|GPS수신기|GPSRECEIVER|네트워크스위치|NETWORKSWITCH' then
      return null;
    elsif normalized ~ '레벨전송기|압력전송기|온도전송기|유량전송기|레벨스위치|압력스위치|유량스위치|유압스위치|솔레노이드|서보밸브' then
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
