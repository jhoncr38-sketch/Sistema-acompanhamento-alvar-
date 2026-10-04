-- =====================================================================
-- Biblioteca de legislação: o documento original (FONTE DOCUMENTAL) ligado às regras (FONTE OPERACIONAL).
--  • legislation_documents: arquivo preservado (edição do Diário Oficial, extrato ou cópia de página HTML),
--    com URL oficial, hash, data de download e situação da conferência.
--  • cnae_rules.source_document_id / source_page: de onde veio cada regra (documento e página).
--  • publish_rule_import: grava também os efeitos nas licenças aprovados junto com a importação.
--  • bucket "legislacao": armazenamento privado dos originais (opcional; a biblioteca também é servida
--    com a aplicação em /legislacao).
-- Migração NÃO destrutiva: apenas acrescenta tipos, colunas, tabela, políticas e funções.
-- =====================================================================

create type public.legislation_document_status as enum ('oficial_confirmado', 'fonte_secundaria', 'copia_html', 'pendente_conferencia', 'nao_localizado');
create type public.legislation_document_kind as enum ('edicao_dom', 'extrato', 'copia_html', 'outro');

create table public.legislation_documents (
  id                uuid primary key default gen_random_uuid(),
  legislation_id    uuid not null references public.legislations (id) on delete restrict,
  title             text not null check (length(trim(title)) > 0),
  kind              public.legislation_document_kind not null default 'outro',
  edition           text,
  publication_date  date,
  pages             text,
  official_url      text,
  file_url          text,
  file_name         text,
  sha256            text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes        bigint check (size_bytes is null or size_bytes >= 0),
  downloaded_at     date,
  status            public.legislation_document_status not null default 'pendente_conferencia',
  notes             text,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (legislation_id, file_name)
);
create index legislation_documents_legislation_idx on public.legislation_documents (legislation_id);

alter table public.cnae_rules
  add column source_document_id uuid references public.legislation_documents (id) on delete restrict,
  add column source_page integer check (source_page is null or source_page >= 1);

create trigger legislation_documents_updated_at before update on public.legislation_documents
  for each row execute function public.set_updated_at();
create trigger legislation_documents_audit after insert or update or delete on public.legislation_documents
  for each row execute function public.audit_row();

alter table public.legislation_documents enable row level security;
revoke all on public.legislation_documents from anon;
create policy legislation_documents_select_members on public.legislation_documents for select to authenticated using (public.is_member());
create policy legislation_documents_insert_admin on public.legislation_documents for insert to authenticated with check (public.is_admin());
create policy legislation_documents_update_admin on public.legislation_documents for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Originais preservados: leitura para a equipe, envio só pelo administrador, sem alteração nem exclusão.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('legislacao', 'legislacao', false, 52428800, array['application/pdf', 'text/html', 'text/plain', 'text/csv', 'application/json'])
on conflict (id) do nothing;

create policy legislacao_read on storage.objects for select to authenticated
  using (bucket_id = 'legislacao' and public.is_member());
create policy legislacao_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'legislacao' and public.is_admin());

-- ---------------------------------------------------------------------
-- Funções atualizadas com a fonte da regra (mesmas assinaturas)
-- ---------------------------------------------------------------------

create or replace function public.copy_version_rules_except(p_from uuid, p_to uuid, p_exclude uuid[])
returns void language plpgsql security invoker set search_path = public as $$
declare
  r public.cnae_rules;
  v_new uuid;
begin
  for r in
    select * from public.cnae_rules
    where legislation_version_id = p_from and active and not (id = any (coalesce(p_exclude, '{}')))
  loop
    insert into public.cnae_rules (
      legislation_version_id, cnae_code, priority, classification_id, else_classification_id, article, annex, item, description,
      annex_id, license_type_id, cbo_code, notes, source_document_id, source_page
    )
    values (
      p_to, r.cnae_code, r.priority, r.classification_id, r.else_classification_id, r.article, r.annex, r.item, r.description,
      r.annex_id, r.license_type_id, r.cbo_code, r.notes, r.source_document_id, r.source_page
    )
    returning id into v_new;
    insert into public.rule_conditions (rule_id, question_id, operator, value, description, sort_order)
    select v_new, question_id, operator, value, description, sort_order from public.rule_conditions where rule_id = r.id;
  end loop;

  insert into public.license_rules (legislation_version_id, classification_id, license_type_id, outcome, notes)
  select p_to, classification_id, license_type_id, outcome, notes
  from public.license_rules where legislation_version_id = p_from and active;
end $$;

create or replace function public.save_cnae_rule(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_code text := nullif(p ->> 'cnae_code', '');
  c jsonb;
  i integer := 0;
begin
  if v_code is not null then
    insert into public.cnaes (code, description)
    values (
      v_code,
      coalesce(nullif(trim(p ->> 'cnae_description'), ''), 'CNAE ' || substr(v_code, 1, 4) || '-' || substr(v_code, 5, 1) || '/' || substr(v_code, 6, 2))
    )
    on conflict (code) do nothing;
  end if;

  if v_id is not null and exists (select 1 from public.cnae_rules where id = v_id) then
    update public.cnae_rules set
      legislation_version_id = (p ->> 'legislation_version_id')::uuid,
      cnae_code = v_code,
      priority = coalesce((p ->> 'priority')::integer, 1),
      classification_id = (p ->> 'classification_id')::uuid,
      else_classification_id = (p ->> 'else_classification_id')::uuid,
      article = p ->> 'article',
      annex = p ->> 'annex',
      item = p ->> 'item',
      description = coalesce(p ->> 'description', ''),
      active = coalesce((p ->> 'active')::boolean, true),
      annex_id = (p ->> 'annex_id')::uuid,
      license_type_id = (p ->> 'license_type_id')::uuid,
      cbo_code = nullif(p ->> 'cbo_code', ''),
      notes = nullif(p ->> 'notes', ''),
      source_document_id = (p ->> 'source_document_id')::uuid,
      source_page = (p ->> 'source_page')::integer
    where id = v_id;
    if not found then
      raise exception 'Somente administradores alteram regras.' using errcode = '42501';
    end if;
    delete from public.rule_conditions where rule_id = v_id;
  else
    insert into public.cnae_rules (
      legislation_version_id, cnae_code, priority, classification_id, else_classification_id, article, annex, item, description, active,
      annex_id, license_type_id, cbo_code, notes, source_document_id, source_page
    )
    values (
      (p ->> 'legislation_version_id')::uuid, v_code, coalesce((p ->> 'priority')::integer, 1),
      (p ->> 'classification_id')::uuid, (p ->> 'else_classification_id')::uuid,
      p ->> 'article', p ->> 'annex', p ->> 'item', coalesce(p ->> 'description', ''), coalesce((p ->> 'active')::boolean, true),
      (p ->> 'annex_id')::uuid, (p ->> 'license_type_id')::uuid, nullif(p ->> 'cbo_code', ''), nullif(p ->> 'notes', ''),
      (p ->> 'source_document_id')::uuid, (p ->> 'source_page')::integer
    )
    returning id into v_id;
  end if;

  for c in select * from jsonb_array_elements(coalesce(p -> 'conditions', '[]'::jsonb)) loop
    insert into public.rule_conditions (rule_id, question_id, operator, value, description, sort_order)
    values (v_id, nullif(c ->> 'question_id', '')::uuid, (c ->> 'operator')::public.rule_operator, c -> 'value', coalesce(c ->> 'description', ''), i);
    i := i + 1;
  end loop;
  return v_id;
end $$;

-- Publicação da importação revisada, agora também com os efeitos nas licenças aprovados (com o fundamento em notes).
create or replace function public.publish_rule_import(p jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_legislation uuid := (p ->> 'legislation_id')::uuid;
  v_target jsonb := p -> 'target';
  v_copy_from uuid := nullif(p ->> 'copy_from_version_id', '')::uuid;
  v_exclude uuid[] := array(select jsonb_array_elements_text(coalesce(p -> 'exclude_rule_ids', '[]'::jsonb))::uuid);
  v_deactivate uuid[] := array(select jsonb_array_elements_text(coalesce(p -> 'deactivate_rule_ids', '[]'::jsonb))::uuid);
  v_rules jsonb := coalesce(p -> 'insert_rules', '[]'::jsonb);
  v_effects jsonb := coalesce(p -> 'license_effects', '[]'::jsonb);
  v_version uuid;
  v_name text;
  v_batch uuid;
  r jsonb;
  n integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores publicam legislação.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.legislations where id = v_legislation) then
    raise exception 'Norma não encontrada' using errcode = 'P0002';
  end if;
  if jsonb_array_length(v_rules) = 0 and cardinality(v_exclude) = 0 and cardinality(v_deactivate) = 0 and jsonb_array_length(v_effects) = 0 then
    raise exception 'A importação não tem alterações a publicar.' using errcode = '22023';
  end if;

  if v_target ->> 'kind' = 'nova_versao' then
    select id into v_version
    from public.save_legislation_version(
      (v_target -> 'version') || jsonb_build_object('id', null, 'legislation_id', v_legislation),
      case when coalesce((v_target ->> 'close_base_version')::boolean, false) then v_copy_from end,
      null
    );
    if v_copy_from is not null then
      perform public.copy_version_rules_except(v_copy_from, v_version, v_exclude);
    end if;
  elsif v_target ->> 'kind' = 'versao_existente' then
    v_version := (v_target ->> 'version_id')::uuid;
    if not exists (select 1 from public.legislation_versions where id = v_version and legislation_id = v_legislation) then
      raise exception 'Versão da norma não encontrada' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.cnae_rules where id = any (v_deactivate) and legislation_version_id <> v_version) then
      raise exception 'Regra a substituir não pertence à versão de destino.' using errcode = '22023';
    end if;
    update public.cnae_rules set active = false where id = any (v_deactivate) and active;
  else
    raise exception 'Destino da importação inválido.' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(v_rules) loop
    perform public.save_cnae_rule(r || jsonb_build_object('id', null, 'legislation_version_id', v_version, 'active', true));
    n := n + 1;
  end loop;

  for r in select * from jsonb_array_elements(v_effects) loop
    insert into public.license_rules as lr (legislation_version_id, classification_id, license_type_id, outcome, notes, active)
    values (v_version, (r ->> 'classification_id')::uuid, (r ->> 'license_type_id')::uuid, (r ->> 'outcome')::public.license_rule_outcome, r ->> 'notes', true)
    on conflict (legislation_version_id, classification_id, license_type_id) do update set
      outcome = excluded.outcome, notes = excluded.notes, active = true;
  end loop;

  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.legislation_import_batches (legislation_id, version_id, file_name, source_kind, mode, rows_total, counts, published_by_name)
  values (
    v_legislation, v_version, coalesce(p -> 'batch' ->> 'file_name', ''), p -> 'batch' ->> 'source_kind', p -> 'batch' ->> 'mode',
    coalesce((p -> 'batch' ->> 'rows_total')::integer, 0), coalesce(p -> 'batch' -> 'counts', '{}'::jsonb), coalesce(v_name, '')
  )
  returning id into v_batch;

  return jsonb_build_object('version_id', v_version, 'inserted', n, 'batch_id', v_batch);
end $$;
