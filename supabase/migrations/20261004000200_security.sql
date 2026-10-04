-- =====================================================================
-- 0200: perfis de acesso e Row Level Security
--   administrador: tudo, inclusive configurações e usuários
--   contador / colaborador: operação (empresas, licenças, consultas, documentos, alertas)
--   consulta: somente leitura
-- =====================================================================

create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.has_role(variadic roles public.user_role[])
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = any (roles) from public.profiles p where p.id = auth.uid() and p.active), false)
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

create or replace function public.is_staff() returns boolean
language sql stable as $$ select public.has_role('administrador', 'contador', 'colaborador') $$;

create or replace function public.is_admin() returns boolean
language sql stable as $$ select public.has_role('administrador') $$;

-- Novo usuário do Supabase Auth ganha perfil "consulta" (menor privilégio).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Ninguém altera o próprio perfil de acesso; só administradores alteram o de outros.
-- Sem usuário autenticado (SQL Editor / service role) a alteração é permitida para o primeiro administrador.
create or replace function public.guard_profile_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (new.role is distinct from old.role or new.active is distinct from old.active) then
    if new.id = auth.uid() then
      raise exception 'Você não pode alterar o próprio perfil de acesso.' using errcode = '42501';
    end if;
    if not public.is_admin() then
      raise exception 'Somente administradores alteram perfis de acesso.' using errcode = '42501';
    end if;
  end if;
  if new.email is distinct from old.email and auth.uid() is not null and not public.is_admin() then
    raise exception 'O e-mail é gerenciado pelo login.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_changes();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'sectors', 'integration_providers', 'license_types', 'sector_license_rules', 'cnaes',
    'cnae_sector_rules', 'cnae_license_rules', 'system_settings', 'notification_templates', 'companies',
    'company_cnaes', 'company_licenses', 'license_consultations', 'license_changes', 'license_documents',
    'alerts', 'alert_notes', 'notification_logs', 'integration_logs', 'audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Leitura para qualquer membro ativo.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'sectors', 'integration_providers', 'license_types', 'sector_license_rules', 'cnaes',
    'cnae_sector_rules', 'cnae_license_rules', 'system_settings', 'notification_templates', 'companies',
    'company_cnaes', 'company_licenses', 'license_consultations', 'license_changes', 'license_documents',
    'alerts', 'alert_notes'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member())', t || '_select_members', t);
  end loop;
end $$;

-- Configurações críticas: somente administrador escreve.
do $$
declare t text;
begin
  foreach t in array array[
    'sectors', 'integration_providers', 'license_types', 'sector_license_rules',
    'cnae_sector_rules', 'cnae_license_rules', 'system_settings', 'notification_templates'
  ] loop
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t || '_insert_admin', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_update_admin', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t || '_delete_admin', t);
  end loop;
end $$;

-- CNAE: a equipe pode incluir códigos novos no cadastro; editar/remover é do administrador.
create policy cnaes_insert_staff on public.cnaes for insert to authenticated with check (public.is_staff());
create policy cnaes_update_admin on public.cnaes for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy cnaes_delete_admin on public.cnaes for delete to authenticated using (public.is_admin());

-- Perfis.
create policy profiles_update_self_or_admin on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- Empresas.
create policy companies_insert_staff on public.companies for insert to authenticated with check (public.is_staff());
create policy companies_update_staff on public.companies for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy companies_delete_admin on public.companies for delete to authenticated using (public.is_admin());

create policy company_cnaes_insert_staff on public.company_cnaes for insert to authenticated with check (public.is_staff());
create policy company_cnaes_update_staff on public.company_cnaes for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy company_cnaes_delete_staff on public.company_cnaes for delete to authenticated using (public.is_staff());

-- Licenças da empresa.
create policy company_licenses_insert_staff on public.company_licenses for insert to authenticated with check (public.is_staff());
create policy company_licenses_update_staff on public.company_licenses for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy company_licenses_delete_admin on public.company_licenses for delete to authenticated using (public.is_admin());

-- Histórico: só inclusão (UPDATE/DELETE também são barrados por trigger).
create policy license_consultations_insert_staff on public.license_consultations for insert to authenticated
  with check (public.is_staff() and (responsible_id is null or responsible_id = auth.uid()));
create policy license_changes_insert_staff on public.license_changes for insert to authenticated with check (public.is_staff());

-- Documentos: inclusão e arquivamento (sem exclusão).
create policy license_documents_insert_staff on public.license_documents for insert to authenticated with check (public.is_staff());
create policy license_documents_update_staff on public.license_documents for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- Alertas.
create policy alerts_insert_staff on public.alerts for insert to authenticated with check (public.is_staff());
create policy alerts_update_staff on public.alerts for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy alert_notes_insert_staff on public.alert_notes for insert to authenticated with check (public.is_staff());

-- Logs.
create policy notification_logs_select_staff on public.notification_logs for select to authenticated using (public.is_staff());
create policy notification_logs_insert_staff on public.notification_logs for insert to authenticated with check (public.is_staff());
create policy integration_logs_select_admin on public.integration_logs for select to authenticated using (public.is_admin());
-- integration_logs: inclusão apenas pelas Edge Functions (service role ignora RLS).
create policy audit_logs_select on public.audit_logs for select to authenticated using (public.has_role('administrador', 'contador'));
-- audit_logs: inclusão apenas pelo trigger de auditoria (security definer).

-- Acesso anônimo: nenhum.
revoke all on all tables in schema public from anon;
