-- =====================================================================
-- Alexandre Alvarás — Monitor de Licenças & Alvarás
-- 0100: tipos, tabelas, índices e imutabilidade do histórico
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.user_role as enum ('administrador', 'contador', 'colaborador', 'consulta');
create type public.company_status as enum ('ativa', 'inativa', 'em_implantacao');
create type public.license_applicability as enum ('aplicavel', 'nao_aplicavel', 'dispensada', 'em_analise');
create type public.license_situation as enum ('regular', 'vencida', 'pendente', 'em_renovacao', 'em_analise');
create type public.consultation_type as enum ('automatica', 'manual');
create type public.consultation_outcome as enum ('sucesso', 'erro');
create type public.alert_category as enum (
  'vencimento_proximo', 'licenca_vencida', 'alteracao_detectada',
  'consulta_com_erro', 'documento_pendente', 'renovacao_em_andamento'
);
create type public.alert_priority as enum ('baixa', 'media', 'alta', 'critica');
create type public.alert_status as enum ('aberto', 'lido', 'resolvido');
create type public.integration_status as enum ('pendente', 'ativa', 'inativa', 'erro');
create type public.agency_scope as enum ('municipal', 'estadual', 'federal', 'conselho');
create type public.notification_channel as enum ('interna', 'email', 'whatsapp');
create type public.notification_status as enum ('pendente', 'enviado', 'falha', 'ignorado');
create type public.audit_origin as enum ('app', 'rotina', 'integracao', 'sistema');

-- ---------------------------------------------------------------------
-- Funções utilitárias
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Histórico é imutável: correções entram como NOVO registro.
create or replace function public.forbid_history_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Histórico imutável: % não permite %', tg_table_name, tg_op
    using errcode = '42501', hint = 'Registre uma nova consulta em vez de alterar a anterior.';
end $$;

-- ---------------------------------------------------------------------
-- Usuários (estende auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  email       text not null default '',
  role        public.user_role not null default 'consulta',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Catálogo / configuração
-- ---------------------------------------------------------------------
create table public.sectors (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name             text not null,
  color            text not null default 'slate' check (color in ('orange', 'green', 'purple', 'blue', 'pink', 'slate')),
  icon             text not null default 'store' check (icon in ('utensils', 'stethoscope', 'scale', 'factory', 'paw', 'store')),
  cover_image_url  text,
  sort_order       integer not null default 0,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid() references public.profiles (id) on delete set null
);

-- Fontes/órgãos. `config` guarda apenas parâmetros não sensíveis; segredos ficam nas Edge Functions.
create table public.integration_providers (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z0-9_]+$'),
  name        text not null,
  short_name  text not null,
  agency      text not null,
  status      public.integration_status not null default 'pendente',
  notes       text,
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.license_types (
  id                     uuid primary key default gen_random_uuid(),
  code                   text not null unique check (code ~ '^[a-z0-9_]+$'),
  name                   text not null,
  short_name             text not null,
  agency                 text not null,
  agency_scope           public.agency_scope not null,
  default_provider_code  text references public.integration_providers (code) on update cascade on delete set null,
  has_expiration         boolean not null default true,
  sort_order             integer not null default 0,
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid default auth.uid() references public.profiles (id) on delete set null
);

-- Perfil de licenciamento do setor (sugestão inicial, nunca obrigação legal).
create table public.sector_license_rules (
  id                     uuid primary key default gen_random_uuid(),
  sector_id              uuid not null references public.sectors (id) on delete cascade,
  license_type_id        uuid not null references public.license_types (id) on delete cascade,
  default_applicability  public.license_applicability not null default 'em_analise',
  show_in_table          boolean not null default false,
  sort_order             integer not null default 0,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (sector_id, license_type_id)
);

create table public.cnaes (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (code ~ '^[0-9]{7}$'),
  description  text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Matriz CNAE → setor.
create table public.cnae_sector_rules (
  id          uuid primary key default gen_random_uuid(),
  cnae_id     uuid not null references public.cnaes (id) on delete cascade,
  sector_id   uuid not null references public.sectors (id) on delete cascade,
  priority    integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (cnae_id, sector_id)
);

-- Ajuste fino por CNAE (ex.: atividade veterinária → CRMV aplicável).
create table public.cnae_license_rules (
  id               uuid primary key default gen_random_uuid(),
  cnae_id          uuid not null references public.cnaes (id) on delete cascade,
  license_type_id  uuid not null references public.license_types (id) on delete cascade,
  applicability    public.license_applicability not null,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (cnae_id, license_type_id)
);

create table public.system_settings (
  key          text primary key,
  value        jsonb not null,
  description  text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid default auth.uid() references public.profiles (id) on delete set null
);

create table public.notification_templates (
  code         text primary key check (code in ('d90', 'd60', 'd30', 'd15', 'd7', 'vencida')),
  days_before  integer not null,
  channel      public.notification_channel not null default 'email',
  subject      text not null,
  body         text not null default '',
  active       boolean not null default false,
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Empresas e licenças
-- ---------------------------------------------------------------------
create table public.companies (
  id                  uuid primary key default gen_random_uuid(),
  legal_name          text not null check (length(trim(legal_name)) >= 2),
  trade_name          text not null default '',
  cnpj                text not null unique check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  sector_id           uuid not null references public.sectors (id) on delete restrict,
  address_street      text not null default '',
  address_number      text not null default '',
  address_complement  text not null default '',
  address_district    text not null default '',
  city                text not null,
  state               char(2) not null,
  zip_code            text not null default '',
  phone               text not null default '',
  email               text not null default '',
  responsible_name    text not null default '',
  notes               text not null default '',
  status              public.company_status not null default 'ativa',
  photo_url           text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_by          uuid default auth.uid() references public.profiles (id) on delete set null
);
create index companies_sector_idx on public.companies (sector_id);
create index companies_status_idx on public.companies (status);
create index companies_name_trgm on public.companies using gin ((legal_name || ' ' || trade_name) gin_trgm_ops);

create table public.company_cnaes (
  company_id  uuid not null references public.companies (id) on delete cascade,
  cnae_id     uuid not null references public.cnaes (id) on delete restrict,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (company_id, cnae_id)
);
create unique index company_cnaes_one_primary on public.company_cnaes (company_id) where is_primary;

-- Ao excluir uma empresa SEM histórico, suas licenças saem junto (cascade). Com histórico,
-- as FKs RESTRICT de consultas/documentos/alertas impedem a exclusão — use status 'inativa'.
create table public.company_licenses (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies (id) on delete cascade,
  license_type_id       uuid not null references public.license_types (id) on delete restrict,
  applicability         public.license_applicability not null default 'em_analise',
  situation             public.license_situation,
  issued_at             date,
  expires_at            date,
  document_number       text,
  protocol_number       text,
  provider_code         text references public.integration_providers (code) on update cascade on delete set null,
  last_consultation_id  uuid,
  last_checked_at       timestamptz,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_by            uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (company_id, license_type_id),
  check (expires_at is null or issued_at is null or expires_at >= issued_at)
);
create index company_licenses_expires_idx on public.company_licenses (expires_at);
create index company_licenses_doc_trgm on public.company_licenses using gin (coalesce(document_number, '') gin_trgm_ops);
create index company_licenses_protocol_trgm on public.company_licenses using gin (coalesce(protocol_number, '') gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Histórico de consultas (append-only)
-- ---------------------------------------------------------------------
create table public.license_consultations (
  id                        uuid primary key default gen_random_uuid(),
  company_license_id        uuid not null references public.company_licenses (id) on delete restrict,
  company_id                uuid not null references public.companies (id) on delete restrict,
  license_type_id           uuid not null references public.license_types (id) on delete restrict,
  consulted_at              timestamptz not null,
  type                      public.consultation_type not null,
  outcome                   public.consultation_outcome not null,
  error_message             text,
  situation                 public.license_situation,
  issued_at                 date,
  expires_at                date,
  provider_code             text,
  source_label              text,
  document_number           text,
  protocol_number           text,
  notes                     text,
  responsible_id            uuid references public.profiles (id) on delete set null,
  responsible_name          text not null,
  previous_consultation_id  uuid references public.license_consultations (id) on delete restrict,
  change_detected           boolean not null default false,
  -- resumo da resposta de integração automática (sem dados sensíveis)
  raw_payload               jsonb,
  created_at                timestamptz not null default now(),
  created_by                uuid default auth.uid() references public.profiles (id) on delete set null,
  check (outcome = 'erro' or situation is not null),
  check (outcome = 'sucesso' or error_message is not null)
);
create index license_consultations_license_idx on public.license_consultations (company_license_id, consulted_at desc);
create index license_consultations_company_idx on public.license_consultations (company_id, consulted_at desc);
create index license_consultations_date_idx on public.license_consultations (consulted_at desc);
create index license_consultations_protocol_trgm on public.license_consultations using gin (coalesce(protocol_number, '') gin_trgm_ops);

create trigger license_consultations_immutable
  before update or delete on public.license_consultations
  for each row execute function public.forbid_history_mutation();

alter table public.company_licenses
  add constraint company_licenses_last_consultation_fk
  foreign key (last_consultation_id) references public.license_consultations (id) on delete set null;

create table public.license_changes (
  id                        uuid primary key default gen_random_uuid(),
  company_license_id        uuid not null references public.company_licenses (id) on delete restrict,
  company_id                uuid not null references public.companies (id) on delete restrict,
  consultation_id           uuid not null unique references public.license_consultations (id) on delete restrict,
  previous_consultation_id  uuid not null references public.license_consultations (id) on delete restrict,
  changes                   jsonb not null check (jsonb_typeof(changes) = 'array'),
  detected_at               timestamptz not null,
  created_at                timestamptz not null default now()
);
create index license_changes_company_idx on public.license_changes (company_id, detected_at desc);

create trigger license_changes_immutable
  before update or delete on public.license_changes
  for each row execute function public.forbid_history_mutation();

-- ---------------------------------------------------------------------
-- Documentos (arquivo no Storage privado; exclusão apenas lógica)
-- ---------------------------------------------------------------------
create table public.license_documents (
  id                  uuid primary key default gen_random_uuid(),
  company_license_id  uuid not null references public.company_licenses (id) on delete restrict,
  company_id          uuid not null references public.companies (id) on delete restrict,
  consultation_id     uuid references public.license_consultations (id) on delete restrict,
  document_type       text not null,
  name                text not null,
  number              text,
  issuing_agency      text,
  issued_at           date,
  expires_at          date,
  storage_path        text,
  file_name           text,
  mime_type           text,
  size_bytes          bigint,
  uploaded_at         timestamptz not null default now(),
  uploaded_by         uuid default auth.uid() references public.profiles (id) on delete set null,
  uploaded_by_name    text not null default '',
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (expires_at is null or issued_at is null or expires_at >= issued_at)
);
create index license_documents_company_idx on public.license_documents (company_id, uploaded_at desc);
create index license_documents_search_trgm on public.license_documents using gin ((name || ' ' || coalesce(number, '') || ' ' || coalesce(file_name, '')) gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Alertas e notificações
-- ---------------------------------------------------------------------
create table public.alerts (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete restrict,
  company_license_id  uuid references public.company_licenses (id) on delete restrict,
  category            public.alert_category not null,
  priority            public.alert_priority not null,
  title               text not null,
  message             text not null,
  status              public.alert_status not null default 'aberto',
  dedupe_key          text,
  consultation_id     uuid references public.license_consultations (id) on delete restrict,
  change_id           uuid references public.license_changes (id) on delete restrict,
  read_at             timestamptz,
  read_by             uuid references public.profiles (id) on delete set null,
  resolved_at         timestamptz,
  resolved_by         uuid references public.profiles (id) on delete set null,
  resolution_note     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- Um único alerta não resolvido por situação (a rotina diária não duplica).
create unique index alerts_open_dedupe on public.alerts (dedupe_key) where dedupe_key is not null and status <> 'resolvido';
create index alerts_status_idx on public.alerts (status, created_at desc);
create index alerts_company_idx on public.alerts (company_id, created_at desc);

create table public.alert_notes (
  id           uuid primary key default gen_random_uuid(),
  alert_id     uuid not null references public.alerts (id) on delete restrict,
  note         text not null check (length(trim(note)) > 0),
  author_id    uuid default auth.uid() references public.profiles (id) on delete set null,
  author_name  text not null default '',
  created_at   timestamptz not null default now()
);
create index alert_notes_alert_idx on public.alert_notes (alert_id, created_at);

create table public.notification_logs (
  id                   uuid primary key default gen_random_uuid(),
  alert_id             uuid references public.alerts (id) on delete restrict,
  channel              public.notification_channel not null,
  template             text,
  recipient            text,
  status               public.notification_status not null default 'pendente',
  provider_message_id  text,
  error                text,
  payload              jsonb,
  sent_at              timestamptz,
  created_at           timestamptz not null default now()
);
create index notification_logs_date_idx on public.notification_logs (created_at desc);

create table public.integration_logs (
  id                  uuid primary key default gen_random_uuid(),
  provider_code       text references public.integration_providers (code) on update cascade on delete set null,
  company_license_id  uuid references public.company_licenses (id) on delete set null,
  consultation_id     uuid references public.license_consultations (id) on delete set null,
  operation           text not null,
  status              text not null check (status in ('sucesso', 'erro', 'pendente')),
  request_summary     jsonb,
  response_summary    jsonb,
  error_message       text,
  duration_ms         integer,
  created_at          timestamptz not null default now()
);
create index integration_logs_date_idx on public.integration_logs (created_at desc);

-- ---------------------------------------------------------------------
-- Auditoria (sem FKs para sobreviver à remoção de registros)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  user_id      uuid,
  user_name    text,
  action       text not null,
  table_name   text not null,
  record_id    text,
  company_id   uuid,
  old_values   jsonb,
  new_values   jsonb,
  origin       public.audit_origin not null default 'app'
);
create index audit_logs_date_idx on public.audit_logs (occurred_at desc);
create index audit_logs_company_idx on public.audit_logs (company_id, occurred_at desc);

create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.forbid_history_mutation();

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'sectors', 'integration_providers', 'license_types', 'sector_license_rules', 'cnaes',
    'cnae_sector_rules', 'cnae_license_rules', 'system_settings', 'notification_templates', 'companies',
    'company_licenses', 'license_documents', 'alerts'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;
