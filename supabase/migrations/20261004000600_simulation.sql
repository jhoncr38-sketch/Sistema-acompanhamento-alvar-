-- =====================================================================
-- 0600: Simulação de Licenciamento
-- Legislação versionada por vigência, motor de regras e histórico de simulações.
-- SOMENTE INCLUSÕES: nenhuma tabela, coluna, política ou função existente é alterada.
-- O conteúdo (normas e regras) é cadastrado pelo administrador; nada vem pré-carregado.
-- =====================================================================

create extension if not exists btree_gist;

create type public.jurisdiction_level as enum ('municipal', 'estadual', 'federal');
create type public.legislation_kind as enum ('lei', 'lei_complementar', 'decreto', 'resolucao', 'portaria', 'instrucao_normativa', 'outro');
create type public.rule_question_type as enum ('numero', 'sim_nao', 'opcoes');
create type public.rule_operator as enum ('lte', 'lt', 'gte', 'gt', 'eq', 'neq', 'in');
create type public.license_rule_outcome as enum ('dispensada', 'exigivel', 'necessita_analise', 'analise_separada');
create type public.simulation_status as enum ('classificada', 'necessita_analise', 'regra_nao_cadastrada');
create type public.simulation_confidence as enum ('completa', 'condicionada', 'nao_cadastrada');

-- ---------------------------------------------------------------------
-- Normas e versões
-- ---------------------------------------------------------------------
create table public.legislations (
  id                              uuid primary key default gen_random_uuid(),
  kind                            public.legislation_kind not null,
  number                          text not null check (length(trim(number)) > 0),
  year                            integer not null check (year between 1900 and 2200),
  title                           text not null check (length(trim(title)) > 0),
  issuing_body                    text not null default '',
  level                           public.jurisdiction_level not null,
  uf                              char(2),
  city                            text,
  -- true: define o enquadramento geral da atividade; false: norma de um órgão/licença específica
  defines_general_classification  boolean not null default true,
  official_url                    text,
  notes                           text,
  active                          boolean not null default true,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  created_by                      uuid default auth.uid() references public.profiles (id) on delete set null,
  check (
    (level = 'federal' and uf is null and city is null) or
    (level = 'estadual' and uf is not null and city is null) or
    (level = 'municipal' and uf is not null and city is not null)
  )
);

-- Uma alteração legislativa cria NOVA versão; a anterior permanece com sua vigência.
create table public.legislation_versions (
  id                     uuid primary key default gen_random_uuid(),
  legislation_id         uuid not null references public.legislations (id) on delete restrict,
  label                  text not null check (length(trim(label)) > 0),
  valid_from             date not null,
  valid_to               date,
  -- a norma determina que a atividade de maior risco define o enquadramento geral
  highest_risk_prevails  boolean not null default false,
  source_url             text,
  notes                  text,
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid default auth.uid() references public.profiles (id) on delete set null,
  check (valid_to is null or valid_to >= valid_from),
  -- nunca duas versões ativas da mesma norma vigentes na mesma data
  constraint legislation_versions_no_overlap
    exclude using gist (legislation_id with =, daterange(valid_from, valid_to, '[]') with &&) where (active)
);
create index legislation_versions_legislation_idx on public.legislation_versions (legislation_id, valid_from);

-- ---------------------------------------------------------------------
-- Classificações, perguntas e regras
-- ---------------------------------------------------------------------
create table public.risk_classifications (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z0-9_]+$'),
  name        text not null,
  severity    integer not null,
  tone        text not null default 'gray' check (tone in ('green', 'blue', 'orange', 'red', 'yellow', 'gray')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.rule_questions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z0-9_]+$'),
  text        text not null check (length(trim(text)) > 0),
  type        public.rule_question_type not null,
  unit        text,
  options     jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  help_text   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Regra do CNAE numa versão. cnae_code nulo = regra padrão da norma (CNAEs sem regra específica).
create table public.cnae_rules (
  id                      uuid primary key default gen_random_uuid(),
  legislation_version_id  uuid not null references public.legislation_versions (id) on delete restrict,
  cnae_code               text references public.cnaes (code) on update cascade on delete restrict,
  priority                integer not null default 1 check (priority >= 1),
  classification_id       uuid not null references public.risk_classifications (id) on delete restrict,
  -- condição não atendida: classificação alternativa; nulo = avaliar a próxima regra (sem próxima: necessita análise)
  else_classification_id  uuid references public.risk_classifications (id) on delete restrict,
  article                 text,
  annex                   text,
  item                    text,
  description             text not null default '',
  active                  boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid default auth.uid() references public.profiles (id) on delete set null
);
create index cnae_rules_lookup_idx on public.cnae_rules (legislation_version_id, cnae_code) where active;

create table public.rule_conditions (
  id           uuid primary key default gen_random_uuid(),
  rule_id      uuid not null references public.cnae_rules (id) on delete cascade,
  question_id  uuid not null references public.rule_questions (id) on delete restrict,
  operator     public.rule_operator not null,
  value        jsonb not null,
  description  text not null default '',
  sort_order   integer not null default 0
);
create index rule_conditions_rule_idx on public.rule_conditions (rule_id, sort_order);

-- Efeito de cada classificação sobre cada licença, conforme a própria norma.
-- Sem linha aqui, a licença NÃO é dispensada nem exigida por esta norma (cada órgão tem sua regra).
create table public.license_rules (
  id                      uuid primary key default gen_random_uuid(),
  legislation_version_id  uuid not null references public.legislation_versions (id) on delete restrict,
  classification_id       uuid not null references public.risk_classifications (id) on delete restrict,
  license_type_id         uuid not null references public.license_types (id) on delete restrict,
  outcome                 public.license_rule_outcome not null,
  notes                   text,
  active                  boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (legislation_version_id, classification_id, license_type_id)
);

-- ---------------------------------------------------------------------
-- Histórico de simulações (imutável)
-- ---------------------------------------------------------------------
create table public.simulation_runs (
  id                   uuid primary key default gen_random_uuid(),
  number               bigint generated always as identity unique,
  created_at           timestamptz not null default now(),
  created_by           uuid default auth.uid() references public.profiles (id) on delete set null,
  user_name            text not null default '',
  company_id           uuid references public.companies (id) on delete restrict,
  company_name         text,
  cnpj                 text,
  uf                   char(2) not null,
  city                 text not null,
  reference_date       date not null,
  overall_status       public.simulation_status not null,
  classification_id    uuid references public.risk_classifications (id) on delete restrict,
  classification_name  text,
  classification_tone  text,
  confidence           public.simulation_confidence not null,
  engine_version       text not null,
  cnaes                jsonb not null check (jsonb_typeof(cnaes) = 'array'),
  -- cópia completa do resultado: regras, condições, respostas, normas e versões utilizadas
  result               jsonb not null
);
create index simulation_runs_date_idx on public.simulation_runs (created_at desc);
create index simulation_runs_company_idx on public.simulation_runs (company_id, created_at desc);

-- Um registro por CNAE × norma avaliada (ou um registro sem norma quando não há regra).
create table public.simulation_cnaes (
  id                      uuid primary key default gen_random_uuid(),
  run_id                  uuid not null references public.simulation_runs (id) on delete restrict,
  position                integer not null,
  cnae_code               text not null,
  description             text,
  is_primary              boolean not null default false,
  general                 boolean not null default true,
  status                  public.simulation_status not null,
  classification_id       uuid references public.risk_classifications (id) on delete restrict,
  cnae_rule_id            uuid references public.cnae_rules (id) on delete restrict,
  legislation_version_id  uuid references public.legislation_versions (id) on delete restrict
);
create index simulation_cnaes_run_idx on public.simulation_cnaes (run_id, position);
create index simulation_cnaes_code_idx on public.simulation_cnaes (cnae_code);

create table public.simulation_answers (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references public.simulation_runs (id) on delete restrict,
  question_id    uuid not null references public.rule_questions (id) on delete restrict,
  question_code  text not null,
  question_text  text not null,
  value          jsonb not null
);
create index simulation_answers_run_idx on public.simulation_answers (run_id);

create table public.simulation_results (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references public.simulation_runs (id) on delete restrict,
  license_type_id  uuid not null references public.license_types (id) on delete restrict,
  outcome          text not null check (outcome in ('dispensada', 'exigivel', 'necessita_analise', 'analise_separada', 'sem_regra')),
  summary          text not null default ''
);
create index simulation_results_run_idx on public.simulation_results (run_id);

create table public.simulation_applications (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references public.simulation_runs (id) on delete restrict,
  company_id       uuid not null references public.companies (id) on delete restrict,
  applied_at       timestamptz not null default now(),
  applied_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  applied_by_name  text not null default '',
  changes          jsonb not null check (jsonb_typeof(changes) = 'array')
);
create index simulation_applications_run_idx on public.simulation_applications (run_id);

-- ---------------------------------------------------------------------
-- Triggers: updated_at, imutabilidade do histórico e auditoria
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['legislations', 'legislation_versions', 'risk_classifications', 'rule_questions', 'cnae_rules', 'license_rules'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;

  foreach t in array array['simulation_runs', 'simulation_cnaes', 'simulation_answers', 'simulation_results', 'simulation_applications'] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.forbid_history_mutation()', t || '_immutable', t);
  end loop;

  foreach t in array array[
    'legislations', 'legislation_versions', 'risk_classifications', 'rule_questions', 'cnae_rules', 'rule_conditions',
    'license_rules', 'simulation_applications'
  ] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RLS: equipe lê; somente ADMINISTRADOR altera normas e regras; equipe grava simulações.
-- Sem políticas de DELETE: regras são desativadas, nunca excluídas (exceto condições, que fazem
-- parte do conteúdo da regra e são regravadas quando o administrador a edita).
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'legislations', 'legislation_versions', 'risk_classifications', 'rule_questions', 'cnae_rules', 'rule_conditions',
    'license_rules', 'simulation_runs', 'simulation_cnaes', 'simulation_answers', 'simulation_results', 'simulation_applications'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member())', t || '_select_members', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;

  foreach t in array array['legislations', 'legislation_versions', 'risk_classifications', 'rule_questions', 'cnae_rules', 'rule_conditions', 'license_rules'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t || '_insert_admin', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_update_admin', t);
  end loop;

  foreach t in array array['simulation_runs', 'simulation_cnaes', 'simulation_answers', 'simulation_results', 'simulation_applications'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_staff())', t || '_insert_staff', t);
  end loop;
end $$;

create policy rule_conditions_delete_admin on public.rule_conditions for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- Operações atômicas (SECURITY INVOKER: as políticas RLS continuam valendo)
-- ---------------------------------------------------------------------

-- Copia regras ativas e efeitos nas licenças de uma versão para outra (nova redação da norma).
create or replace function public.copy_version_rules(p_from uuid, p_to uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  r public.cnae_rules;
  v_new uuid;
begin
  for r in select * from public.cnae_rules where legislation_version_id = p_from and active loop
    insert into public.cnae_rules (legislation_version_id, cnae_code, priority, classification_id, else_classification_id, article, annex, item, description)
    values (p_to, r.cnae_code, r.priority, r.classification_id, r.else_classification_id, r.article, r.annex, r.item, r.description)
    returning id into v_new;
    insert into public.rule_conditions (rule_id, question_id, operator, value, description, sort_order)
    select v_new, question_id, operator, value, description, sort_order from public.rule_conditions where rule_id = r.id;
  end loop;

  insert into public.license_rules (legislation_version_id, classification_id, license_type_id, outcome, notes)
  select p_to, classification_id, license_type_id, outcome, notes
  from public.license_rules where legislation_version_id = p_from and active;
end $$;

-- Cria/altera uma versão. Opcionalmente encerra a versão anterior na véspera e copia as regras dela.
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
      active = coalesce((p ->> 'active')::boolean, true)
    where id = v_id
    returning * into v;
    if not found then
      raise exception 'Somente administradores alteram a legislação.' using errcode = '42501';
    end if;
  else
    insert into public.legislation_versions (legislation_id, label, valid_from, valid_to, highest_risk_prevails, source_url, notes, active)
    values (
      (p ->> 'legislation_id')::uuid, p ->> 'label', v_from, (p ->> 'valid_to')::date,
      coalesce((p ->> 'highest_risk_prevails')::boolean, false), p ->> 'source_url', p ->> 'notes',
      coalesce((p ->> 'active')::boolean, true)
    )
    returning * into v;
    if p_copy_from is not null then
      perform public.copy_version_rules(p_copy_from, v.id);
    end if;
  end if;
  return v;
end $$;

-- Cria/altera uma regra com suas condições. Inclui o CNAE no catálogo se ainda não existir.
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
      active = coalesce((p ->> 'active')::boolean, true)
    where id = v_id;
    if not found then
      raise exception 'Somente administradores alteram regras.' using errcode = '42501';
    end if;
    delete from public.rule_conditions where rule_id = v_id;
  else
    insert into public.cnae_rules (legislation_version_id, cnae_code, priority, classification_id, else_classification_id, article, annex, item, description, active)
    values (
      (p ->> 'legislation_version_id')::uuid, v_code, coalesce((p ->> 'priority')::integer, 1),
      (p ->> 'classification_id')::uuid, (p ->> 'else_classification_id')::uuid,
      p ->> 'article', p ->> 'annex', p ->> 'item', coalesce(p ->> 'description', ''), coalesce((p ->> 'active')::boolean, true)
    )
    returning id into v_id;
  end if;

  for c in select * from jsonb_array_elements(coalesce(p -> 'conditions', '[]'::jsonb)) loop
    insert into public.rule_conditions (rule_id, question_id, operator, value, description, sort_order)
    values (v_id, (c ->> 'question_id')::uuid, (c ->> 'operator')::public.rule_operator, c -> 'value', coalesce(c ->> 'description', ''), i);
    i := i + 1;
  end loop;
  return v_id;
end $$;

-- Importação em lote para uma versão. p_replace desativa (não exclui) as regras atuais dos CNAEs importados.
create or replace function public.import_cnae_rules(p_version uuid, p_rules jsonb, p_replace boolean default true)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  r jsonb;
  n integer := 0;
begin
  if p_replace then
    update public.cnae_rules cr set active = false
    where cr.legislation_version_id = p_version and cr.active
      and exists (
        select 1 from jsonb_array_elements(p_rules) x
        where nullif(x ->> 'cnae_code', '') is not distinct from cr.cnae_code
      );
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb)) loop
    perform public.save_cnae_rule(r || jsonb_build_object('id', null, 'legislation_version_id', p_version));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Grava uma simulação e seus detalhes numa única transação.
create or replace function public.save_simulation(p jsonb)
returns public.simulation_runs language plpgsql security invoker set search_path = public as $$
declare
  v_run public.simulation_runs;
  v_name text;
  x jsonb;
  i integer := 0;
begin
  select full_name into v_name from public.profiles where id = auth.uid();

  insert into public.simulation_runs (
    user_name, company_id, company_name, cnpj, uf, city, reference_date, overall_status, classification_id,
    classification_name, classification_tone, confidence, engine_version, cnaes, result
  ) values (
    coalesce(v_name, ''), (p ->> 'company_id')::uuid, p ->> 'company_name', p ->> 'cnpj', p ->> 'uf', p ->> 'city',
    (p ->> 'reference_date')::date, (p ->> 'overall_status')::public.simulation_status, (p ->> 'classification_id')::uuid,
    p ->> 'classification_name', p ->> 'classification_tone', (p ->> 'confidence')::public.simulation_confidence,
    p ->> 'engine_version', coalesce(p -> 'cnaes', '[]'::jsonb), p -> 'result'
  ) returning * into v_run;

  for x in select * from jsonb_array_elements(coalesce(p -> 'evaluations', '[]'::jsonb)) loop
    insert into public.simulation_cnaes (run_id, position, cnae_code, description, is_primary, general, status, classification_id, cnae_rule_id, legislation_version_id)
    values (
      v_run.id, i, x ->> 'cnae_code', x ->> 'description', coalesce((x ->> 'is_primary')::boolean, false),
      coalesce((x ->> 'general')::boolean, true), (x ->> 'status')::public.simulation_status,
      (x ->> 'classification_id')::uuid, (x ->> 'cnae_rule_id')::uuid, (x ->> 'legislation_version_id')::uuid
    );
    i := i + 1;
  end loop;

  for x in select * from jsonb_array_elements(coalesce(p -> 'answers', '[]'::jsonb)) loop
    insert into public.simulation_answers (run_id, question_id, question_code, question_text, value)
    values (v_run.id, (x ->> 'question_id')::uuid, x ->> 'question_code', x ->> 'question_text', x -> 'value');
  end loop;

  for x in select * from jsonb_array_elements(coalesce(p -> 'licenses', '[]'::jsonb)) loop
    insert into public.simulation_results (run_id, license_type_id, outcome, summary)
    values (v_run.id, (x ->> 'license_type_id')::uuid, x ->> 'outcome', coalesce(x ->> 'summary', ''));
  end loop;

  return v_run;
end $$;

-- Aplica o resultado ao perfil de licenciamento da empresa. Nunca exclui: inclui ou atualiza a
-- aplicabilidade e acrescenta o fundamento às observações da licença.
create or replace function public.apply_simulation(p_run uuid, p_company uuid, p_changes jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare
  c jsonb;
  v_name text;
begin
  if not exists (select 1 from public.simulation_runs where id = p_run) then
    raise exception 'Simulação não encontrada' using errcode = 'P0002';
  end if;

  for c in select * from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) loop
    if (c ->> 'applicability') not in ('aplicavel', 'dispensada', 'em_analise') then
      raise exception 'Aplicabilidade inválida' using errcode = '23514';
    end if;
    insert into public.company_licenses as cl (company_id, license_type_id, applicability, provider_code, notes)
    select p_company, t.id, (c ->> 'applicability')::public.license_applicability, t.default_provider_code, c ->> 'note'
    from public.license_types t
    where t.id = (c ->> 'license_type_id')::uuid
    on conflict (company_id, license_type_id) do update set
      applicability = excluded.applicability,
      notes = concat_ws(E'\n', nullif(cl.notes, ''), excluded.notes),
      updated_by = auth.uid();
  end loop;

  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.simulation_applications (run_id, company_id, applied_by_name, changes)
  values (p_run, p_company, coalesce(v_name, ''), coalesce(p_changes, '[]'::jsonb));
end $$;

grant execute on function
  public.copy_version_rules(uuid, uuid),
  public.save_legislation_version(jsonb, uuid, uuid),
  public.save_cnae_rule(jsonb),
  public.import_cnae_rules(uuid, jsonb, boolean),
  public.save_simulation(jsonb),
  public.apply_simulation(uuid, uuid, jsonb)
to authenticated;

revoke execute on function
  public.copy_version_rules(uuid, uuid),
  public.save_legislation_version(jsonb, uuid, uuid),
  public.save_cnae_rule(jsonb),
  public.import_cnae_rules(uuid, jsonb, boolean),
  public.save_simulation(jsonb),
  public.apply_simulation(uuid, uuid, jsonb)
from anon, public;
