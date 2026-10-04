-- =====================================================================
-- 0400: operações atômicas (RPC). Todas são SECURITY INVOKER: as políticas RLS continuam valendo.
-- =====================================================================

-- CNAEs da empresa (principal + secundários), criando códigos ainda não cadastrados.
create or replace function public.sync_company_cnaes(p_company_id uuid, p_main text, p_secondary text[])
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_code text;
  v_codes text[] := array_remove(array_prepend(nullif(p_main, ''), coalesce(p_secondary, '{}')), null);
begin
  foreach v_code in array v_codes loop
    insert into public.cnaes (code, description)
    values (v_code, 'CNAE ' || substr(v_code, 1, 4) || '-' || substr(v_code, 5, 1) || '/' || substr(v_code, 6, 2))
    on conflict (code) do nothing;
  end loop;

  delete from public.company_cnaes where company_id = p_company_id;
  insert into public.company_cnaes (company_id, cnae_id, is_primary)
  select p_company_id, c.id, c.code = p_main
  from public.cnaes c
  where c.code = any (v_codes)
  on conflict do nothing;
end $$;

-- Cadastro de empresa + CNAEs + licenças sugeridas, numa transação.
create or replace function public.create_company(p_company jsonb, p_main_cnae text, p_secondary_cnaes text[], p_licenses jsonb)
returns public.companies language plpgsql security invoker set search_path = public as $$
declare
  c public.companies := jsonb_populate_record(null::public.companies, p_company);
  v_row public.companies;
  v_lic jsonb;
begin
  insert into public.companies (
    legal_name, trade_name, cnpj, sector_id, address_street, address_number, address_complement, address_district,
    city, state, zip_code, phone, email, responsible_name, notes, status, photo_url
  ) values (
    c.legal_name, coalesce(c.trade_name, ''), c.cnpj, c.sector_id, coalesce(c.address_street, ''), coalesce(c.address_number, ''),
    coalesce(c.address_complement, ''), coalesce(c.address_district, ''), c.city, c.state, coalesce(c.zip_code, ''),
    coalesce(c.phone, ''), coalesce(c.email, ''), coalesce(c.responsible_name, ''), coalesce(c.notes, ''),
    coalesce(c.status, 'ativa'), c.photo_url
  ) returning * into v_row;

  perform public.sync_company_cnaes(v_row.id, p_main_cnae, p_secondary_cnaes);

  for v_lic in select * from jsonb_array_elements(coalesce(p_licenses, '[]'::jsonb)) loop
    insert into public.company_licenses (company_id, license_type_id, applicability, provider_code)
    values (v_row.id, (v_lic ->> 'license_type_id')::uuid, (v_lic ->> 'applicability')::public.license_applicability, v_lic ->> 'provider_code');
  end loop;

  return v_row;
end $$;

create or replace function public.update_company(p_id uuid, p_company jsonb, p_main_cnae text, p_secondary_cnaes text[])
returns public.companies language plpgsql security invoker set search_path = public as $$
declare
  c public.companies := jsonb_populate_record(null::public.companies, p_company);
  v_row public.companies;
begin
  update public.companies set
    legal_name = c.legal_name, trade_name = coalesce(c.trade_name, ''), cnpj = c.cnpj, sector_id = c.sector_id,
    address_street = coalesce(c.address_street, ''), address_number = coalesce(c.address_number, ''),
    address_complement = coalesce(c.address_complement, ''), address_district = coalesce(c.address_district, ''),
    city = c.city, state = c.state, zip_code = coalesce(c.zip_code, ''), phone = coalesce(c.phone, ''),
    email = coalesce(c.email, ''), responsible_name = coalesce(c.responsible_name, ''), notes = coalesce(c.notes, ''),
    status = coalesce(c.status, 'ativa'), photo_url = c.photo_url,
    updated_by = auth.uid()
  where id = p_id
  returning * into v_row;
  if not found then
    raise exception 'Empresa não encontrada' using errcode = 'P0002';
  end if;
  perform public.sync_company_cnaes(p_id, p_main_cnae, p_secondary_cnaes);
  return v_row;
end $$;

-- Alertas com deduplicação: ignora quando já existe alerta NÃO resolvido com a mesma dedupe_key.
create or replace function public.create_alerts(p_alerts jsonb)
returns setof public.alerts language plpgsql security invoker set search_path = public as $$
declare
  a jsonb;
  v_row public.alerts;
begin
  for a in select * from jsonb_array_elements(coalesce(p_alerts, '[]'::jsonb)) loop
    insert into public.alerts (company_id, company_license_id, category, priority, title, message, dedupe_key, consultation_id, change_id)
    values (
      (a ->> 'company_id')::uuid, (a ->> 'company_license_id')::uuid, (a ->> 'category')::public.alert_category,
      (a ->> 'priority')::public.alert_priority, a ->> 'title', a ->> 'message', a ->> 'dedupe_key',
      (a ->> 'consultation_id')::uuid, (a ->> 'change_id')::uuid
    )
    on conflict (dedupe_key) where dedupe_key is not null and status <> 'resolvido' do nothing
    returning * into v_row;
    if v_row.id is not null then
      return next v_row;
    end if;
    v_row := null;
  end loop;
end $$;

-- Registra uma consulta e seus efeitos numa única transação:
-- histórico (append-only) + alteração detectada + estado atual da licença + alertas + documento.
-- A comparação é feita pelo serviço (src/services/consultation-service.ts); aqui garantimos atomicidade
-- e concorrência: se outra consulta bem-sucedida entrou depois de p_expected_previous, nada é gravado.
create or replace function public.record_consultation(
  p_consultation jsonb,
  p_change jsonb,
  p_license_update jsonb,
  p_alerts jsonb,
  p_document jsonb,
  p_expected_previous uuid
)
returns public.license_consultations language plpgsql security invoker set search_path = public as $$
declare
  v_license public.company_licenses;
  v_latest uuid;
  v_row public.license_consultations;
begin
  select * into v_license
  from public.company_licenses
  where id = (p_consultation ->> 'company_license_id')::uuid
  for update;
  if not found then
    raise exception 'Licença não encontrada' using errcode = 'P0002';
  end if;

  select id into v_latest
  from public.license_consultations
  where company_license_id = v_license.id and outcome = 'sucesso'
  order by consulted_at desc, created_at desc
  limit 1;

  if v_latest is distinct from p_expected_previous then
    raise exception 'CONCURRENT_UPDATE' using errcode = 'P0001', hint = 'Outra consulta desta licença foi registrada.';
  end if;

  insert into public.license_consultations (
    id, company_license_id, company_id, license_type_id, consulted_at, type, outcome, error_message, situation,
    issued_at, expires_at, provider_code, source_label, document_number, protocol_number, notes, responsible_id,
    responsible_name, previous_consultation_id, change_detected, raw_payload
  ) values (
    coalesce((p_consultation ->> 'id')::uuid, gen_random_uuid()),
    v_license.id,
    v_license.company_id,
    v_license.license_type_id,
    (p_consultation ->> 'consulted_at')::timestamptz,
    (p_consultation ->> 'type')::public.consultation_type,
    (p_consultation ->> 'outcome')::public.consultation_outcome,
    p_consultation ->> 'error_message',
    (p_consultation ->> 'situation')::public.license_situation,
    (p_consultation ->> 'issued_at')::date,
    (p_consultation ->> 'expires_at')::date,
    p_consultation ->> 'provider_code',
    p_consultation ->> 'source_label',
    p_consultation ->> 'document_number',
    p_consultation ->> 'protocol_number',
    p_consultation ->> 'notes',
    auth.uid(),
    p_consultation ->> 'responsible_name',
    v_latest,
    coalesce((p_consultation ->> 'change_detected')::boolean, false),
    p_consultation -> 'raw_payload'
  ) returning * into v_row;

  if p_change is not null and jsonb_typeof(p_change) = 'object' and v_latest is not null then
    insert into public.license_changes (id, company_license_id, company_id, consultation_id, previous_consultation_id, changes, detected_at)
    values (
      coalesce((p_change ->> 'id')::uuid, gen_random_uuid()), v_license.id, v_license.company_id, v_row.id, v_latest,
      p_change -> 'changes', v_row.consulted_at
    );
  end if;

  if p_license_update is not null and jsonb_typeof(p_license_update) = 'object' then
    update public.company_licenses set
      situation = (p_license_update ->> 'situation')::public.license_situation,
      expires_at = (p_license_update ->> 'expires_at')::date,
      issued_at = (p_license_update ->> 'issued_at')::date,
      document_number = p_license_update ->> 'document_number',
      protocol_number = p_license_update ->> 'protocol_number',
      provider_code = p_license_update ->> 'provider_code',
      last_consultation_id = v_row.id,
      last_checked_at = v_row.consulted_at,
      updated_by = auth.uid()
    where id = v_license.id;
  end if;

  perform public.create_alerts(p_alerts);

  if p_document is not null and jsonb_typeof(p_document) = 'object' then
    insert into public.license_documents (
      company_license_id, company_id, consultation_id, document_type, name, number, issuing_agency, issued_at,
      expires_at, storage_path, file_name, mime_type, size_bytes, uploaded_by_name
    ) values (
      v_license.id, v_license.company_id, v_row.id, p_document ->> 'document_type', p_document ->> 'name',
      p_document ->> 'number', p_document ->> 'issuing_agency', (p_document ->> 'issued_at')::date,
      (p_document ->> 'expires_at')::date, p_document ->> 'storage_path', p_document ->> 'file_name',
      p_document ->> 'mime_type', (p_document ->> 'size_bytes')::bigint, coalesce(p_document ->> 'uploaded_by_name', '')
    );
  end if;

  return v_row;
end $$;

-- Pesquisa global: razão social, nome fantasia, CNPJ, nº de licença, protocolo e documentos.
create or replace function public.global_search(q text)
returns table (kind text, company_id uuid, company_license_id uuid, title text, subtitle text)
language sql stable security invoker set search_path = public as $$
  with term as (
    select '%' || trim(q) || '%' as like_q, upper(regexp_replace(q, '[^0-9A-Za-z]', '', 'g')) as cnpj_q
  )
  (
    select 'empresa', c.id, null::uuid, c.legal_name, c.cnpj
    from public.companies c, term
    where c.legal_name ilike term.like_q or c.trade_name ilike term.like_q
       or (length(term.cnpj_q) >= 3 and c.cnpj like '%' || term.cnpj_q || '%')
    order by c.legal_name
    limit 8
  )
  union all
  (
    select 'licenca', l.company_id, l.id, l.document_number, t.name || ' · ' || c.legal_name
    from public.company_licenses l
    join public.license_types t on t.id = l.license_type_id
    join public.companies c on c.id = l.company_id, term
    where l.document_number ilike term.like_q
    limit 5
  )
  union all
  (
    select distinct on (x.protocol_number) 'protocolo', x.company_id, x.company_license_id, x.protocol_number, x.label
    from (
      select l.protocol_number, l.company_id, l.id as company_license_id, t.name || ' · ' || c.legal_name as label
      from public.company_licenses l
      join public.license_types t on t.id = l.license_type_id
      join public.companies c on c.id = l.company_id
      union all
      select k.protocol_number, k.company_id, k.company_license_id, t.name || ' · ' || c.legal_name
      from public.license_consultations k
      join public.license_types t on t.id = k.license_type_id
      join public.companies c on c.id = k.company_id
    ) x, term
    where x.protocol_number ilike term.like_q
    limit 5
  )
  union all
  (
    select 'documento', d.company_id, d.company_license_id, d.name, c.legal_name
    from public.license_documents d
    join public.companies c on c.id = d.company_id, term
    where d.archived_at is null
      and (d.name ilike term.like_q or d.number ilike term.like_q or d.file_name ilike term.like_q)
    limit 5
  )
$$;

grant execute on function
  public.sync_company_cnaes(uuid, text, text[]),
  public.create_company(jsonb, text, text[], jsonb),
  public.update_company(uuid, jsonb, text, text[]),
  public.create_alerts(jsonb),
  public.record_consultation(jsonb, jsonb, jsonb, jsonb, jsonb, uuid),
  public.global_search(text)
to authenticated;

revoke execute on function
  public.sync_company_cnaes(uuid, text, text[]),
  public.create_company(jsonb, text, text[], jsonb),
  public.update_company(uuid, jsonb, text, text[]),
  public.create_alerts(jsonb),
  public.record_consultation(jsonb, jsonb, jsonb, jsonb, jsonb, uuid),
  public.global_search(text)
from anon, public;
