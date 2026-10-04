-- =====================================================================
-- Base legal da Simulação: normas relacionadas (alterações), anexos, regras por área (ex.: risco
-- sanitário/ambiental) e por CBO, condições com o texto da norma, enquadramento condicionado e
-- publicação de importações revisadas pelo administrador.
--
-- Migração NÃO destrutiva: apenas acrescenta tipos, colunas, tabelas, gatilhos e funções.
-- Nenhuma regra, versão ou simulação existente é alterada ou excluída.
-- =====================================================================

create type public.legislation_relation as enum ('altera', 'revoga', 'regulamenta', 'consolida');
create type public.annex_kind as enum ('classificacao', 'baixo_risco_a', 'cbo', 'outro');
alter type public.simulation_status add value if not exists 'condicionada' after 'classificada';

-- ---------------------------------------------------------------------
-- Normas relacionadas e anexos
-- ---------------------------------------------------------------------
alter table public.legislations
  add column norm_date date,
  -- norma alterada/revogada/regulamentada por esta (ex.: decreto que altera o decreto-base)
  add column parent_legislation_id uuid references public.legislations (id) on delete restrict,
  add column relation public.legislation_relation,
  add constraint legislations_relation_check check (
    (parent_legislation_id is null) = (relation is null) and parent_legislation_id is distinct from id
  );
create index legislations_parent_idx on public.legislations (parent_legislation_id) where parent_legislation_id is not null;

-- norma cuja publicação deu origem a esta redação (ex.: "redação dada pelo Decreto nº ...")
alter table public.legislation_versions
  add column amended_by_legislation_id uuid references public.legislations (id) on delete restrict;

create table public.legislation_annexes (
  id              uuid primary key default gen_random_uuid(),
  legislation_id  uuid not null references public.legislations (id) on delete restrict,
  code            text not null check (length(trim(code)) > 0),
  title           text not null check (length(trim(title)) > 0),
  kind            public.annex_kind not null default 'outro',
  description     text,
  sort_order      integer not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (legislation_id, code)
);

-- ---------------------------------------------------------------------
-- Regras: anexo de origem, classificação por área, CBO e observações da norma
-- ---------------------------------------------------------------------
alter table public.cnae_rules
  add column annex_id uuid references public.legislation_annexes (id) on delete restrict,
  -- nulo = enquadramento geral; preenchido = classificação específica daquela licença/área
  add column license_type_id uuid references public.license_types (id) on delete restrict,
  add column cbo_code text check (cbo_code ~ '^[0-9]{6}$'),
  add column notes text,
  add constraint cnae_rules_cnae_or_cbo check (cnae_code is null or cbo_code is null);
create index cnae_rules_annex_idx on public.cnae_rules (annex_id) where active;

-- O anexo precisa pertencer à norma da versão da regra.
create or replace function public.check_rule_annex()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.annex_id is not null and not exists (
    select 1
    from public.legislation_annexes a
    join public.legislation_versions v on v.legislation_id = a.legislation_id
    where a.id = new.annex_id and v.id = new.legislation_version_id
  ) then
    raise exception 'Anexo não pertence à norma desta versão.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger cnae_rules_annex_check
  before insert or update of annex_id, legislation_version_id on public.cnae_rules
  for each row execute function public.check_rule_annex();

-- Condição sem pergunta = condição transcrita da norma (respondida com Sim/Não na simulação).
alter table public.rule_conditions
  alter column question_id drop not null,
  add constraint rule_conditions_question_or_text check (question_id is not null or length(trim(description)) > 0);

-- Respostas a condições transcritas da norma não têm pergunta cadastrada (question_code guarda a chave).
alter table public.simulation_answers alter column question_id drop not null;

-- ---------------------------------------------------------------------
-- Registro das importações publicadas (imutável)
-- ---------------------------------------------------------------------
create table public.legislation_import_batches (
  id                 uuid primary key default gen_random_uuid(),
  legislation_id     uuid not null references public.legislations (id) on delete restrict,
  version_id         uuid not null references public.legislation_versions (id) on delete restrict,
  file_name          text not null,
  source_kind        text not null check (source_kind in ('csv', 'xlsx')),
  mode               text not null check (mode in ('completo', 'parcial')),
  rows_total         integer not null check (rows_total >= 0),
  counts             jsonb not null check (jsonb_typeof(counts) = 'object'),
  published_at       timestamptz not null default now(),
  published_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  published_by_name  text not null default ''
);
create index legislation_import_batches_legislation_idx on public.legislation_import_batches (legislation_id, published_at desc);

create trigger legislation_annexes_updated_at before update on public.legislation_annexes
  for each row execute function public.set_updated_at();
create trigger legislation_import_batches_immutable before update or delete on public.legislation_import_batches
  for each row execute function public.forbid_history_mutation();
create trigger legislation_annexes_audit after insert or update or delete on public.legislation_annexes
  for each row execute function public.audit_row();
create trigger legislation_import_batches_audit after insert or update or delete on public.legislation_import_batches
  for each row execute function public.audit_row();

alter table public.legislation_annexes enable row level security;
alter table public.legislation_import_batches enable row level security;
revoke all on public.legislation_annexes from anon;
revoke all on public.legislation_import_batches from anon;
create policy legislation_annexes_select_members on public.legislation_annexes for select to authenticated using (public.is_member());
create policy legislation_annexes_insert_admin on public.legislation_annexes for insert to authenticated with check (public.is_admin());
create policy legislation_annexes_update_admin on public.legislation_annexes for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy legislation_import_batches_select_members on public.legislation_import_batches for select to authenticated using (public.is_member());
create policy legislation_import_batches_insert_admin on public.legislation_import_batches for insert to authenticated with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Funções atualizadas com os novos campos (mesmas assinaturas)
-- ---------------------------------------------------------------------

-- Copia as regras ativas (exceto as indicadas) e os efeitos nas licenças de uma versão para outra.
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
      annex_id, license_type_id, cbo_code, notes
    )
    values (
      p_to, r.cnae_code, r.priority, r.classification_id, r.else_classification_id, r.article, r.annex, r.item, r.description,
      r.annex_id, r.license_type_id, r.cbo_code, r.notes
    )
    returning id into v_new;
    insert into public.rule_conditions (rule_id, question_id, operator, value, description, sort_order)
    select v_new, question_id, operator, value, description, sort_order from public.rule_conditions where rule_id = r.id;
  end loop;

  insert into public.license_rules (legislation_version_id, classification_id, license_type_id, outcome, notes)
  select p_to, classification_id, license_type_id, outcome, notes
  from public.license_rules where legislation_version_id = p_from and active;
end $$;

create or replace function public.copy_version_rules(p_from uuid, p_to uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  perform public.copy_version_rules_except(p_from, p_to, '{}');
end $$;

create or replace function public.save_legislation_version(p jsonb, p_close_previous uuid default null, p_copy_from uuid default null)
returns public.legislation_versions language plpgsql security invoker set search_path = public as $$
declare
  v public.legislation_versions;
  v_id uuid := (p ->> 'id')::uuid;
  v_from date := (p ->> 'valid_from')::date;
begin
  if p_close_previous is not null then
    update public.legislation_versions set valid_to = v_from - 1 where id = p_close_previous;
  end if;

  if v_id is not null and exists (select 1 from public.legislation_versions where id = v_id) then
    update public.legislation_versions set
      label = p ->> 'label',
      valid_from = v_from,
      valid_to = (p ->> 'valid_to')::date,
      highest_risk_prevails = coalesce((p ->> 'highest_risk_prevails')::boolean, false),
      source_url = p ->> 'source_url',
      notes = p ->> 'notes',
      active = coalesce((p ->> 'active')::boolean, true),
      amended_by_legislation_id = (p ->> 'amended_by_legislation_id')::uuid
    where id = v_id
    returning * into v;
    if not found then
      raise exception 'Somente administradores alteram a legislação.' using errcode = '42501';
    end if;
  else
    insert into public.legislation_versions (legislation_id, label, valid_from, valid_to, highest_risk_prevails, source_url, notes, active, amended_by_legislation_id)
    values (
      (p ->> 'legislation_id')::uuid, p ->> 'label', v_from, (p ->> 'valid_to')::date,
      coalesce((p ->> 'highest_risk_prevails')::boolean, false), p ->> 'source_url', p ->> 'notes',
      coalesce((p ->> 'active')::boolean, true), (p ->> 'amended_by_legislation_id')::uuid
    )
    returning * into v;
    if p_copy_from is not null then
      perform public.copy_version_rules(p_copy_from, v.id);
    end if;
  end if;
  return v;
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
      notes = nullif(p ->> 'notes', '')
    where id = v_id;
    if not found then
      raise exception 'Somente administradores alteram regras.' using errcode = '42501';
    end if;
    delete from public.rule_conditions where rule_id = v_id;
  else
    insert into public.cnae_rules (
      legislation_version_id, cnae_code, priority, classification_id, else_classification_id, article, annex, item, description, active,
      annex_id, license_type_id, cbo_code, notes
    )
    values (
      (p ->> 'legislation_version_id')::uuid, v_code, coalesce((p ->> 'priority')::integer, 1),
      (p ->> 'classification_id')::uuid, (p ->> 'else_classification_id')::uuid,
      p ->> 'article', p ->> 'annex', p ->> 'item', coalesce(p ->> 'description', ''), coalesce((p ->> 'active')::boolean, true),
      (p ->> 'annex_id')::uuid, (p ->> 'license_type_id')::uuid, nullif(p ->> 'cbo_code', ''), nullif(p ->> 'notes', '')
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

-- ---------------------------------------------------------------------
-- Publicação de uma importação revisada (DOCUMENTO → EXTRAÇÃO → COMPARAÇÃO → REVISÃO →
-- APROVAÇÃO DO ADMINISTRADOR → PUBLICAÇÃO). Tudo numa transação: cria a nova versão (ou
-- complementa uma existente), copia as regras inalteradas, desativa as substituídas e registra o lote.
-- Nada é excluído: as versões e regras anteriores continuam disponíveis para o histórico.
-- ---------------------------------------------------------------------
create or replace function public.publish_rule_import(p jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_legislation uuid := (p ->> 'legislation_id')::uuid;
  v_target jsonb := p -> 'target';
  v_copy_from uuid := nullif(p ->> 'copy_from_version_id', '')::uuid;
  v_exclude uuid[] := array(select jsonb_array_elements_text(coalesce(p -> 'exclude_rule_ids', '[]'::jsonb))::uuid);
  v_deactivate uuid[] := array(select jsonb_array_elements_text(coalesce(p -> 'deactivate_rule_ids', '[]'::jsonb))::uuid);
  v_rules jsonb := coalesce(p -> 'insert_rules', '[]'::jsonb);
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
  if jsonb_array_length(v_rules) = 0 and cardinality(v_exclude) = 0 and cardinality(v_deactivate) = 0 then
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

  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.legislation_import_batches (legislation_id, version_id, file_name, source_kind, mode, rows_total, counts, published_by_name)
  values (
    v_legislation, v_version, coalesce(p -> 'batch' ->> 'file_name', ''), p -> 'batch' ->> 'source_kind', p -> 'batch' ->> 'mode',
    coalesce((p -> 'batch' ->> 'rows_total')::integer, 0), coalesce(p -> 'batch' -> 'counts', '{}'::jsonb), coalesce(v_name, '')
  )
  returning id into v_batch;

  return jsonb_build_object('version_id', v_version, 'inserted', n, 'batch_id', v_batch);
end $$;

grant execute on function
  public.copy_version_rules_except(uuid, uuid, uuid[]),
  public.publish_rule_import(jsonb)
to authenticated;

revoke execute on function
  public.copy_version_rules_except(uuid, uuid, uuid[]),
  public.publish_rule_import(jsonb),
  public.check_rule_annex()
from anon, public;
