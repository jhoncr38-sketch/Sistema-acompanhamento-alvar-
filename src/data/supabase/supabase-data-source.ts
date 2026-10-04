import type { SupabaseClient } from '@supabase/supabase-js'
import type { AlertDraft } from '@/domain/alert-rules'
import { normalizeCnae } from '@/domain/format'
import type { UserProfile } from '@/domain/types'
import { AppError } from '../errors'
import type { CompanyInput, DataSource, DocumentInput } from '../types'
import { createSupabaseBrowserClient } from './client'
import { run, runOne, selectAll } from './helpers'
import {
  ALERT_SELECT,
  COMPANY_SELECT,
  fromCompany,
  fromConsultation,
  fromLicenseType,
  fromSettings,
  toAlert,
  toAudit,
  toChange,
  toCnae,
  toCnaeLicenseRule,
  toCnaeSectorRule,
  toCompany,
  toConsultation,
  toDocument,
  toLicense,
  toLicenseType,
  toNotificationLog,
  toProfile,
  toProvider,
  toSector,
  toSectorRule,
  toSettings,
  type Row,
} from './mappers'
import { createSupabaseSimulationRepository } from './supabase-simulation-repository'

export { mapError } from './helpers'

const BUCKET = 'license-documents'

function safeFileName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(-80)
}

function cnaeArgs(input: CompanyInput) {
  return {
    p_main_cnae: input.mainCnae ? normalizeCnae(input.mainCnae) : null,
    p_secondary_cnaes: input.secondaryCnaes.map(normalizeCnae).filter((c) => c.length === 7),
  }
}

const alertToRow = (a: AlertDraft): Row => ({
  company_id: a.companyId,
  company_license_id: a.companyLicenseId,
  category: a.category,
  priority: a.priority,
  title: a.title,
  message: a.message,
  dedupe_key: a.dedupeKey,
  consultation_id: a.consultationId ?? null,
  change_id: a.changeId ?? null,
})

export function createSupabaseDataSource(url: string, anonKey: string, client?: SupabaseClient): DataSource {
  const sb = client ?? createSupabaseBrowserClient(url, anonKey)
  let profile: UserProfile | null = null

  async function loadProfile(userId: string | undefined): Promise<UserProfile | null> {
    if (!userId) return (profile = null)
    const row = await run(sb.from('profiles').select('*').eq('id', userId).maybeSingle())
    profile = row ? toProfile(row) : null
    if (profile && !profile.active) {
      await sb.auth.signOut()
      throw new AppError('FORBIDDEN', 'Usuário desativado. Fale com o administrador.')
    }
    return profile
  }

  async function uid(): Promise<string> {
    const { data } = await sb.auth.getUser()
    if (!data.user) throw new AppError('UNAUTHENTICATED', 'Sessão expirada. Entre novamente.')
    return data.user.id
  }

  async function uploadFile(companyId: string, licenseId: string, file: File) {
    const path = `${companyId}/${licenseId}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false })
    if (error) throw new AppError('UNKNOWN', `Falha ao enviar o arquivo: ${error.message}`, error)
    return path
  }

  function documentRow(input: DocumentInput, file: File | null, path: string | null): Row {
    return {
      company_license_id: input.companyLicenseId,
      company_id: input.companyId,
      consultation_id: input.consultationId,
      document_type: input.documentType,
      name: input.name,
      number: input.number,
      issuing_agency: input.issuingAgency,
      issued_at: input.issuedAt,
      expires_at: input.expiresAt,
      storage_path: path,
      file_name: file?.name ?? null,
      mime_type: file?.type || null,
      size_bytes: file?.size ?? null,
      uploaded_by_name: profile?.fullName ?? '',
    }
  }

  return {
    mode: 'supabase',

    auth: {
      requiresLogin: true,
      async getCurrentUser() {
        const { data } = await sb.auth.getSession()
        return loadProfile(data.session?.user.id)
      },
      async signIn(email, password) {
        const { data, error } = await sb.auth.signInWithPassword({ email, password })
        if (error) {
          throw new AppError('UNAUTHENTICATED', /invalid/i.test(error.message) ? 'E-mail ou senha inválidos.' : error.message, error)
        }
        const p = await loadProfile(data.user?.id)
        if (!p) throw new AppError('FORBIDDEN', 'Usuário sem perfil de acesso. Fale com o administrador.')
        return p
      },
      async signOut() {
        await sb.auth.signOut()
        profile = null
      },
      onChange(listener) {
        const { data } = sb.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_OUT') listener(null)
          else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            // fora do callback para não bloquear o cliente de autenticação
            setTimeout(() => {
              loadProfile(session?.user.id).then(listener, () => listener(null))
            }, 0)
          }
        })
        return () => data.subscription.unsubscribe()
      },
    },

    catalog: {
      async getCatalog() {
        const [sectors, licenseTypes, sectorRules, cnaes, cnaeSector, cnaeLicense, providers, settings] = await Promise.all([
          run(sb.from('sectors').select('*').order('sort_order')),
          run(sb.from('license_types').select('*').order('sort_order')),
          run(sb.from('sector_license_rules').select('*').order('sort_order')),
          selectAll(() => sb.from('cnaes').select('*').order('code')),
          run(sb.from('cnae_sector_rules').select('*')),
          run(sb.from('cnae_license_rules').select('*')),
          run(sb.from('integration_providers').select('*').order('name')),
          run(sb.from('system_settings').select('*')),
        ])
        return {
          sectors: (sectors ?? []).map(toSector),
          licenseTypes: (licenseTypes ?? []).map(toLicenseType),
          sectorLicenseRules: (sectorRules ?? []).map(toSectorRule),
          cnaes: cnaes.map(toCnae),
          cnaeSectorRules: (cnaeSector ?? []).map(toCnaeSectorRule),
          cnaeLicenseRules: (cnaeLicense ?? []).map(toCnaeLicenseRule),
          providers: (providers ?? []).map(toProvider),
          settings: toSettings(settings ?? []),
        }
      },
      async saveSettings(settings) {
        await run(sb.from('system_settings').upsert(fromSettings(settings), { onConflict: 'key' }).select('key'))
      },
      async saveLicenseType(input) {
        const row = await runOne(sb.from('license_types').upsert(fromLicenseType(input)).select('*').single())
        return toLicenseType(row)
      },
      async saveSectorLicenseRule(input) {
        await run(
          sb
            .from('sector_license_rules')
            .upsert(
              {
                sector_id: input.sectorId,
                license_type_id: input.licenseTypeId,
                default_applicability: input.defaultApplicability,
                show_in_table: input.showInTable,
                sort_order: input.sortOrder,
                notes: input.notes,
              },
              { onConflict: 'sector_id,license_type_id' },
            )
            .select('id'),
        )
      },
      async deleteSectorLicenseRule(id) {
        await run(sb.from('sector_license_rules').delete().eq('id', id))
      },
      async saveCnae({ code, description }) {
        const normalized = normalizeCnae(code)
        if (normalized.length !== 7) throw new AppError('VALIDATION', 'CNAE deve ter 7 dígitos.')
        await run(
          sb
            .from('cnaes')
            .upsert({ code: normalized, description: description.trim() || `CNAE ${normalized}` }, { onConflict: 'code', ignoreDuplicates: true })
            .select('id'),
        )
        if (description.trim()) await run(sb.from('cnaes').update({ description: description.trim() }).eq('code', normalized))
        return toCnae(await runOne(sb.from('cnaes').select('*').eq('code', normalized).single()))
      },
      async saveCnaeSectorRule({ cnaeId, sectorId, priority }) {
        await run(sb.from('cnae_sector_rules').delete().eq('cnae_id', cnaeId).neq('sector_id', sectorId))
        await run(sb.from('cnae_sector_rules').upsert({ cnae_id: cnaeId, sector_id: sectorId, priority }, { onConflict: 'cnae_id,sector_id' }).select('id'))
      },
      async deleteCnaeSectorRule(id) {
        await run(sb.from('cnae_sector_rules').delete().eq('id', id))
      },
      async saveCnaeLicenseRule(input) {
        await run(
          sb
            .from('cnae_license_rules')
            .upsert(
              { cnae_id: input.cnaeId, license_type_id: input.licenseTypeId, applicability: input.applicability, notes: input.notes },
              { onConflict: 'cnae_id,license_type_id' },
            )
            .select('id'),
        )
      },
      async deleteCnaeLicenseRule(id) {
        await run(sb.from('cnae_license_rules').delete().eq('id', id))
      },
      async updateProvider(code, patch) {
        const rows = await run(sb.from('integration_providers').update({ status: patch.status, notes: patch.notes }).eq('code', code).select('id'))
        if (!rows?.length) throw new AppError('FORBIDDEN', 'Seu perfil de acesso não permite esta operação.')
      },
    },

    companies: {
      async list() {
        return (await selectAll(() => sb.from('companies').select(COMPANY_SELECT).order('created_at'))).map(toCompany)
      },
      async get(id) {
        const row = await run(sb.from('companies').select(COMPANY_SELECT).eq('id', id).maybeSingle())
        return row ? toCompany(row) : null
      },
      async create(input, licenses) {
        const row = await runOne(
          sb
            .rpc('create_company', {
              p_company: fromCompany(input),
              ...cnaeArgs(input),
              p_licenses: licenses.map((l) => ({ license_type_id: l.licenseTypeId, applicability: l.applicability, provider_code: l.providerCode })),
            })
            .single<Row>(),
        )
        return toCompany(await runOne(sb.from('companies').select(COMPANY_SELECT).eq('id', row.id).single()))
      },
      async update(id, input) {
        await run(sb.rpc('update_company', { p_id: id, p_company: fromCompany(input), ...cnaeArgs(input) }).single())
        return toCompany(await runOne(sb.from('companies').select(COMPANY_SELECT).eq('id', id).single()))
      },
      async remove(id) {
        const rows = await run(sb.from('companies').delete().eq('id', id).select('id'))
        if (!rows?.length) throw new AppError('FORBIDDEN', 'Seu perfil de acesso não permite excluir empresas.')
      },
    },

    licenses: {
      async listAll() {
        return (await selectAll(() => sb.from('company_licenses').select('*').order('created_at'))).map(toLicense)
      },
      async listByCompany(companyId) {
        return ((await run(sb.from('company_licenses').select('*').eq('company_id', companyId))) ?? []).map(toLicense)
      },
      async get(id) {
        const row = await run(sb.from('company_licenses').select('*').eq('id', id).maybeSingle())
        return row ? toLicense(row) : null
      },
      async add(companyId, input) {
        const row = await runOne(
          sb
            .from('company_licenses')
            .insert({ company_id: companyId, license_type_id: input.licenseTypeId, applicability: input.applicability, provider_code: input.providerCode })
            .select('*')
            .single(),
        )
        return toLicense(row)
      },
      async update(id, patch) {
        const row: Row = {}
        if (patch.applicability !== undefined) row.applicability = patch.applicability
        if (patch.providerCode !== undefined) row.provider_code = patch.providerCode
        if (patch.notes !== undefined) row.notes = patch.notes
        const updated = await run(sb.from('company_licenses').update(row).eq('id', id).select('*').maybeSingle())
        if (!updated) throw new AppError('FORBIDDEN', 'Seu perfil de acesso não permite alterar licenças.')
        return toLicense(updated)
      },
    },

    consultations: {
      async list(filter = {}) {
        const make = () => {
          let q = sb.from('license_consultations').select('*').order('consulted_at', { ascending: false })
          if (filter.companyId) q = q.eq('company_id', filter.companyId)
          if (filter.companyLicenseId) q = q.eq('company_license_id', filter.companyLicenseId)
          if (filter.type) q = q.eq('type', filter.type)
          if (filter.from) q = q.gte('consulted_at', filter.from)
          if (filter.to) q = q.lte('consulted_at', filter.to)
          return q
        }
        const rows = filter.limit ? ((await run(make().limit(filter.limit))) ?? []) : await selectAll(make)
        return rows.map(toConsultation)
      },
      async latestSuccessful(companyLicenseId) {
        const row = await run(
          sb
            .from('license_consultations')
            .select('*')
            .eq('company_license_id', companyLicenseId)
            .eq('outcome', 'sucesso')
            .order('consulted_at', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        )
        return row ? toConsultation(row) : null
      },
      async record(bundle, expectedPreviousId) {
        let document: Row | null = null
        if (bundle.document) {
          // O arquivo sobe antes; se a transação falhar, sobra apenas um arquivo órfão (nunca um registro sem arquivo).
          const path = await uploadFile(bundle.document.input.companyId, bundle.document.input.companyLicenseId, bundle.document.file)
          document = documentRow(bundle.document.input, bundle.document.file, path)
        }
        const u = bundle.licenseUpdate
        const row = await runOne(
          sb
            .rpc('record_consultation', {
              p_consultation: fromConsultation(bundle.consultation),
              p_change: bundle.change ? { id: bundle.change.id, changes: bundle.change.changes } : null,
              p_license_update: u
                ? {
                    situation: u.situation,
                    expires_at: u.expiresAt,
                    issued_at: u.issuedAt,
                    document_number: u.documentNumber,
                    protocol_number: u.protocolNumber,
                    provider_code: u.providerCode,
                  }
                : null,
              p_alerts: bundle.alerts.map(alertToRow),
              p_document: document,
              p_expected_previous: expectedPreviousId,
            })
            .single<Row>(),
        )
        return toConsultation(row)
      },
      async listChanges(filter = {}) {
        let q = sb.from('license_changes').select('*').order('detected_at', { ascending: false })
        if (filter.companyId) q = q.eq('company_id', filter.companyId)
        if (filter.limit) q = q.limit(filter.limit)
        return ((await run(q)) ?? []).map(toChange)
      },
    },

    documents: {
      async list(filter = {}) {
        let q = sb.from('license_documents').select('*').order('uploaded_at', { ascending: false })
        if (filter.companyId) q = q.eq('company_id', filter.companyId)
        if (filter.companyLicenseId) q = q.eq('company_license_id', filter.companyLicenseId)
        if (!filter.includeArchived) q = q.is('archived_at', null)
        return ((await run(q)) ?? []).map(toDocument)
      },
      async upload(input, file) {
        const path = file ? await uploadFile(input.companyId, input.companyLicenseId, file) : null
        const row = await runOne(sb.from('license_documents').insert(documentRow(input, file, path)).select('*').single())
        return toDocument(row)
      },
      async archive(id) {
        const rows = await run(sb.from('license_documents').update({ archived_at: new Date().toISOString() }).eq('id', id).select('id'))
        if (!rows?.length) throw new AppError('FORBIDDEN', 'Seu perfil de acesso não permite arquivar documentos.')
      },
      async getFileUrl(document) {
        if (!document.storagePath) return null
        const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(document.storagePath, 300)
        if (error) throw new AppError('NOT_FOUND', 'Arquivo não encontrado no armazenamento.', error)
        return data.signedUrl
      },
    },

    alerts: {
      async list(filter = {}) {
        const make = () => {
          let q = sb.from('alerts').select(ALERT_SELECT).order('created_at', { ascending: false })
          if (filter.companyId) q = q.eq('company_id', filter.companyId)
          if (filter.status === 'pendentes') q = q.neq('status', 'resolvido')
          else if (filter.status) q = q.eq('status', filter.status)
          return q
        }
        return (await selectAll(make)).map(toAlert)
      },
      async createMany(drafts) {
        if (!drafts.length) return []
        return ((await run(sb.rpc('create_alerts', { p_alerts: drafts.map(alertToRow) }))) as Row[]).map((r) => toAlert({ ...r, alert_notes: [] }))
      },
      async markRead(id) {
        await run(sb.from('alerts').update({ status: 'lido', read_at: new Date().toISOString(), read_by: await uid() }).eq('id', id).eq('status', 'aberto'))
      },
      async resolve(id, note) {
        const now = new Date().toISOString()
        const user = await uid()
        const rows = await run(
          sb.from('alerts').update({ status: 'resolvido', resolved_at: now, resolved_by: user, resolution_note: note }).eq('id', id).select('id, read_at'),
        )
        if (!rows?.length) throw new AppError('FORBIDDEN', 'Seu perfil de acesso não permite resolver alertas.')
        if (!rows[0]?.read_at) await run(sb.from('alerts').update({ read_at: now, read_by: user }).eq('id', id))
      },
      async reopen(id) {
        await run(sb.from('alerts').update({ status: 'lido', resolved_at: null, resolved_by: null }).eq('id', id))
      },
      async addNote(id, note) {
        await run(sb.from('alert_notes').insert({ alert_id: id, note, author_name: profile?.fullName ?? '' }))
      },
    },

    notifications: {
      async list(limit = 100) {
        return ((await run(sb.from('notification_logs').select('*').order('created_at', { ascending: false }).limit(limit))) ?? []).map(toNotificationLog)
      },
      async create(log) {
        await run(
          sb.from('notification_logs').insert({
            alert_id: log.alertId,
            channel: log.channel,
            template: log.template,
            recipient: log.recipient,
            status: log.status,
            error: log.error,
          }),
        )
      },
    },

    audit: {
      async list(filter = {}) {
        let q = sb.from('audit_logs').select('*').order('occurred_at', { ascending: false }).limit(filter.limit ?? 200)
        if (filter.companyId) q = q.eq('company_id', filter.companyId)
        return ((await run(q)) ?? []).map(toAudit)
      },
    },

    users: {
      async list() {
        return ((await run(sb.from('profiles').select('*').order('full_name'))) ?? []).map(toProfile)
      },
      async updateRole(id, role) {
        const rows = await run(sb.from('profiles').update({ role }).eq('id', id).select('id'))
        if (!rows?.length) throw new AppError('FORBIDDEN', 'Somente administradores alteram perfis de acesso.')
      },
      async setActive(id, active) {
        const rows = await run(sb.from('profiles').update({ active }).eq('id', id).select('id'))
        if (!rows?.length) throw new AppError('FORBIDDEN', 'Somente administradores ativam ou desativam usuários.')
      },
    },

    search: {
      async global(query) {
        const rows = ((await run(sb.rpc('global_search', { q: query }))) ?? []) as Row[]
        return rows.map((r) => ({
          kind: r.kind,
          companyId: r.company_id,
          companyLicenseId: r.company_license_id,
          title: r.title,
          subtitle: r.subtitle,
        }))
      },
    },

    simulation: createSupabaseSimulationRepository(sb),
  }
}
