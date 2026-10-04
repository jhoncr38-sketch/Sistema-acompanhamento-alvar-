-- =====================================================================
-- 0300: auditoria automática das operações importantes
-- Registra usuário, ação, empresa, registro, valores anterior/novo (somente campos alterados) e origem.
-- Origem: cabeçalho `x-app-origin` enviado pelo cliente (app/rotina/integracao); sem usuário → 'sistema'.
-- =====================================================================

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row      jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old      jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new      jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_user     uuid := auth.uid();
  v_header   text;
  v_origin   public.audit_origin;
  v_company  uuid;
  v_name     text;
  k          text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if (v_new -> k) is not distinct from (v_old -> k) then
        v_new := v_new - k;
        v_old := v_old - k;
      end if;
    end loop;
    v_new := v_new - 'updated_at' - 'updated_by';
    v_old := v_old - 'updated_at' - 'updated_by';
    if v_new = '{}'::jsonb then
      return new;
    end if;
  end if;

  begin
    v_header := nullif(current_setting('request.headers', true), '')::json ->> 'x-app-origin';
  exception when others then
    v_header := null;
  end;
  v_origin := case
    when v_header in ('app', 'rotina', 'integracao', 'sistema') then v_header::public.audit_origin
    when v_user is null then 'sistema'
    else 'app'
  end;

  v_company := case when tg_table_name = 'companies' then (v_row ->> 'id')::uuid else (v_row ->> 'company_id')::uuid end;
  select full_name into v_name from public.profiles where id = v_user;

  insert into public.audit_logs (user_id, user_name, action, table_name, record_id, company_id, old_values, new_values, origin)
  values (
    v_user,
    v_name,
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'key', v_row ->> 'code'),
    v_company,
    v_old,
    v_new,
    v_origin
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'company_licenses', 'license_consultations', 'license_documents', 'alerts',
    'system_settings', 'sectors', 'license_types', 'sector_license_rules', 'cnae_sector_rules',
    'cnae_license_rules', 'integration_providers', 'notification_templates', 'profiles'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()',
      t || '_audit', t
    );
  end loop;
end $$;
