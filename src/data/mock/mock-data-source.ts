import { deserializeDb, serializeDb } from './compact-storage'
import type { AlertDraft } from '@/domain/alert-rules'
import { todayISO } from '@/domain/dates'
import { formatCnae, normalizeCnae } from '@/domain/format'
import { normalizeCnpj } from '@/domain/cnpj'
import { can, type Permission } from '@/domain/permissions'
import type { Alert, AuditLog, Company, CompanyLicense, LicenseConsultation, UserProfile, UserRole } from '@/domain/types'
import { AppError } from '../errors'
import type {
  AlertFilter,
  CompanyInput,
  CompanyLicenseInput,
  ConsultationBundle,
  ConsultationFilter,
  DataSource,
  DocumentInput,
  SearchResult,
} from '../types'
import { createDemoDatabase } from './demo-seed'
import { createDemoSimulationData } from './demo-simulation-seed'
import { createMockSimulationRepository } from './mock-simulation-repository'
import { MOCK_DB_VERSION, type MockDb, type StoredDocument } from './mock-db'

const STORAGE_KEY = 'alexandre-alvaras:demo-db'
const MAX_DEMO_FILE_BYTES = 750 * 1024

export interface MockDataSourceOptions {
  /** Atraso artificial para exibir estados de carregamento como num servidor real. */
  latencyMs?: number
  storage?: Storage | null
  today?: () => string
}

const uid = () => crypto.randomUUID()
const nowISO = () => new Date().toISOString()
const clone = <T>(value: T): T => structuredClone(value)
const asRecord = (value: object): Record<string, unknown> => ({ ...value })

function normalizeText(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${file.type || 'application/octet-stream'};base64,${btoa(binary)}`
}

/** Liga a coluna da Licença de Acessibilidade nos setores que ainda têm espaço (até 5 colunas). */
function showAccessibilityColumn(db: MockDb): MockDb {
  const type = db.licenseTypes.find((t) => t.code === 'acessibilidade')
  if (!type) return db
  const shown = (sectorId: string) => db.sectorLicenseRules.filter((r) => r.sectorId === sectorId && r.showInTable).length
  return {
    ...db,
    sectorLicenseRules: db.sectorLicenseRules.map((r) => (r.licenseTypeId === type.id && !r.showInTable && shown(r.sectorId) < 5 ? { ...r, showInTable: true } : r)),
  }
}

export function createMockDataSource(options: MockDataSourceOptions = {}): DataSource {
  const latency = options.latencyMs ?? 150
  const storage = options.storage === undefined ? defaultStorage() : options.storage
  const today = options.today ?? (() => todayISO())
  const listeners = new Set<(user: UserProfile | null) => void>()

  function load(): MockDb {
    try {
      const raw = storage?.getItem(STORAGE_KEY)
      if (raw) {
        let parsed = deserializeDb<MockDb>(raw)
        // Até a v4: atualiza a base de regras da Simulação e preserva empresas, licenças, consultas e o
        // histórico de simulações já feito na demonstração.
        if (parsed.version >= 2 && parsed.version < 5) {
          const { simulationRuns: _runs, simulationApplications: _applications, ...rules } = createDemoSimulationData(parsed.licenseTypes)
          parsed = { ...parsed, ...rules, simulationRuns: parsed.simulationRuns ?? [], simulationApplications: parsed.simulationApplications ?? [], version: 5 }
        }
        // v5 → v6: Licença de Acessibilidade passa a aparecer na tabela dos setores (nada mais é alterado).
        if (parsed.version === 5) parsed = { ...showAccessibilityColumn(parsed), version: 6 }
        if (parsed.version === MOCK_DB_VERSION) return parsed
      }
    } catch {
      // armazenamento indisponível ou corrompido: recomeça com o seed
    }
    return createDemoDatabase(today())
  }

  let db = load()

  function persist() {
    try {
      storage?.setItem(STORAGE_KEY, serializeDb(db))
    } catch (error) {
      console.warn('[demo] não foi possível salvar no navegador', error)
    }
  }
  persist()

  const wait = () => (latency > 0 ? new Promise<void>((r) => setTimeout(r, latency)) : Promise.resolve())

  function currentUser(): UserProfile {
    const user = db.users.find((u) => u.id === db.currentUserId)
    if (!user) throw new AppError('UNAUTHENTICATED', 'Sessão expirada.')
    return user
  }

  function authorize(permission: Permission) {
    if (!can(currentUser().role, permission)) {
      throw new AppError('FORBIDDEN', 'Seu perfil de acesso não permite esta operação.')
    }
  }

  function audit(entry: Pick<AuditLog, 'action' | 'tableName' | 'recordId' | 'companyId' | 'oldValues' | 'newValues'>) {
    const user = currentUser()
    db.audit.unshift({ id: uid(), occurredAt: nowISO(), userId: user.id, userName: user.fullName, origin: 'app', ...entry })
  }

  function diff(before: object, after: object) {
    const oldValues: Record<string, unknown> = {}
    const newValues: Record<string, unknown> = {}
    const b = before as Record<string, unknown>
    const a = after as Record<string, unknown>
    for (const key of Object.keys(a)) {
      if (JSON.stringify(b[key]) !== JSON.stringify(a[key])) {
        oldValues[key] = b[key]
        newValues[key] = a[key]
      }
    }
    return { oldValues, newValues, changed: Object.keys(newValues).length > 0 }
  }

  function findCompany(id: string): Company {
    const company = db.companies.find((c) => c.id === id)
    if (!company) throw new AppError('NOT_FOUND', 'Empresa não encontrada.')
    return company
  }

  function findLicense(id: string): CompanyLicense {
    const license = db.licenses.find((l) => l.id === id)
    if (!license) throw new AppError('NOT_FOUND', 'Licença não encontrada.')
    return license
  }

  function assertUniqueCnpj(cnpj: string, ignoreId?: string) {
    if (db.companies.some((c) => c.cnpj === cnpj && c.id !== ignoreId)) {
      throw new AppError('CONFLICT', 'Já existe uma empresa cadastrada com este CNPJ.')
    }
  }

  function ensureCnae(code: string) {
    const normalized = normalizeCnae(code)
    if (normalized.length === 7 && !db.cnaes.some((c) => normalizeCnae(c.code) === normalized)) {
      db.cnaes.push({ id: uid(), code: normalized, description: `CNAE ${formatCnae(normalized)}` })
    }
  }

  function latestSuccessful(companyLicenseId: string): LicenseConsultation | null {
    return (
      db.consultations
        .filter((c) => c.companyLicenseId === companyLicenseId && c.outcome === 'sucesso')
        .sort((a, b) => b.consultedAt.localeCompare(a.consultedAt) || b.createdAt.localeCompare(a.createdAt))[0] ?? null
    )
  }

  function insertAlerts(drafts: AlertDraft[]): Alert[] {
    const created: Alert[] = []
    for (const d of drafts) {
      if (d.dedupeKey && db.alerts.some((a) => a.dedupeKey === d.dedupeKey && a.status !== 'resolvido')) continue
      const alert: Alert = {
        id: uid(),
        companyId: d.companyId,
        companyLicenseId: d.companyLicenseId,
        category: d.category,
        priority: d.priority,
        title: d.title,
        message: d.message,
        status: 'aberto',
        dedupeKey: d.dedupeKey,
        consultationId: d.consultationId ?? null,
        changeId: d.changeId ?? null,
        readAt: null,
        resolvedAt: null,
        resolutionNote: null,
        notes: [],
        createdAt: nowISO(),
      }
      db.alerts.unshift(alert)
      created.push(alert)
    }
    return created
  }

  async function storeDocument(input: DocumentInput, file: File | null): Promise<StoredDocument> {
    if (file && file.size > MAX_DEMO_FILE_BYTES) {
      throw new AppError('VALIDATION', 'No modo demonstração, anexe arquivos de até 750 KB.')
    }
    const user = currentUser()
    const doc: StoredDocument = {
      id: uid(),
      ...input,
      fileName: file?.name ?? null,
      mimeType: file?.type || null,
      sizeBytes: file?.size ?? null,
      storagePath: null,
      uploadedAt: nowISO(),
      uploadedBy: user.id,
      uploadedByName: user.fullName,
      archivedAt: null,
      dataUrl: file ? await fileToDataUrl(file) : null,
    }
    db.documents.unshift(doc)
    return doc
  }

  function stripDocument({ dataUrl: _dataUrl, ...doc }: StoredDocument) {
    return clone(doc)
  }

  function notify() {
    const user = db.users.find((u) => u.id === db.currentUserId) ?? null
    listeners.forEach((l) => l(user))
  }

  return {
    mode: 'demo',

    auth: {
      requiresLogin: false,
      async getCurrentUser() {
        return clone(currentUser())
      },
      async signIn() {
        return clone(currentUser())
      },
      async signOut() {
        // No modo demonstração a sessão é sempre do usuário de demonstração.
      },
      onChange(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },

    catalog: {
      async getCatalog() {
        await wait()
        return clone({
          sectors: db.sectors,
          licenseTypes: db.licenseTypes,
          sectorLicenseRules: db.sectorLicenseRules,
          cnaes: db.cnaes,
          cnaeSectorRules: db.cnaeSectorRules,
          cnaeLicenseRules: db.cnaeLicenseRules,
          providers: db.providers,
          settings: db.settings,
        })
      },
      async saveSettings(settings) {
        await wait()
        authorize('settings:manage')
        const { oldValues, newValues } = diff(db.settings, settings)
        db.settings = clone(settings)
        audit({ action: 'configuracoes_alteradas', tableName: 'system_settings', recordId: null, companyId: null, oldValues, newValues })
        persist()
      },
      async saveLicenseType(input) {
        await wait()
        authorize('settings:manage')
        if (db.licenseTypes.some((t) => t.code === input.code && t.id !== input.id)) {
          throw new AppError('CONFLICT', 'Já existe uma licença com este código.')
        }
        const existing = input.id ? db.licenseTypes.find((t) => t.id === input.id) : undefined
        const saved = { ...input, id: existing?.id ?? uid() }
        const before = existing ? asRecord(existing) : null
        if (existing) Object.assign(existing, saved)
        else db.licenseTypes.push(saved)
        audit({ action: existing ? 'licenca_tipo_alterada' : 'licenca_tipo_criada', tableName: 'license_types', recordId: saved.id, companyId: null, oldValues: before, newValues: asRecord(saved) })
        persist()
        return clone(saved)
      },
      async saveSectorLicenseRule(input) {
        await wait()
        authorize('settings:manage')
        const existing = db.sectorLicenseRules.find(
          (r) => r.id === input.id || (r.sectorId === input.sectorId && r.licenseTypeId === input.licenseTypeId),
        )
        if (existing) Object.assign(existing, { ...input, id: existing.id })
        else db.sectorLicenseRules.push({ ...input, id: uid() })
        audit({ action: 'perfil_setor_alterado', tableName: 'sector_license_rules', recordId: existing?.id ?? null, companyId: null, oldValues: null, newValues: clone(input) })
        persist()
      },
      async deleteSectorLicenseRule(id) {
        await wait()
        authorize('settings:manage')
        db.sectorLicenseRules = db.sectorLicenseRules.filter((r) => r.id !== id)
        persist()
      },
      async saveCnae(input) {
        await wait()
        authorize('company:write')
        const code = normalizeCnae(input.code)
        if (code.length !== 7) throw new AppError('VALIDATION', 'CNAE deve ter 7 dígitos.')
        const existing = db.cnaes.find((c) => normalizeCnae(c.code) === code)
        if (existing) {
          if (input.description.trim()) {
            authorize('settings:manage')
            existing.description = input.description.trim()
          }
          persist()
          return clone(existing)
        }
        const cnae = { id: uid(), code, description: input.description.trim() || `CNAE ${formatCnae(code)}` }
        db.cnaes.push(cnae)
        persist()
        return clone(cnae)
      },
      async saveCnaeSectorRule(input) {
        await wait()
        authorize('settings:manage')
        const existing = db.cnaeSectorRules.find((r) => r.cnaeId === input.cnaeId)
        if (existing) Object.assign(existing, input)
        else db.cnaeSectorRules.push({ ...input, id: uid() })
        persist()
      },
      async deleteCnaeSectorRule(id) {
        await wait()
        authorize('settings:manage')
        db.cnaeSectorRules = db.cnaeSectorRules.filter((r) => r.id !== id)
        persist()
      },
      async saveCnaeLicenseRule(input) {
        await wait()
        authorize('settings:manage')
        const existing = db.cnaeLicenseRules.find((r) => r.cnaeId === input.cnaeId && r.licenseTypeId === input.licenseTypeId)
        if (existing) Object.assign(existing, input)
        else db.cnaeLicenseRules.push({ ...input, id: uid() })
        persist()
      },
      async deleteCnaeLicenseRule(id) {
        await wait()
        authorize('settings:manage')
        db.cnaeLicenseRules = db.cnaeLicenseRules.filter((r) => r.id !== id)
        persist()
      },
      async updateProvider(code, patch) {
        await wait()
        authorize('settings:manage')
        const provider = db.providers.find((p) => p.code === code)
        if (!provider) throw new AppError('NOT_FOUND', 'Fonte não encontrada.')
        const before = clone(provider)
        Object.assign(provider, patch)
        audit({ action: 'integracao_alterada', tableName: 'integration_providers', recordId: provider.id, companyId: null, oldValues: { status: before.status }, newValues: { status: provider.status } })
        persist()
      },
    },

    companies: {
      async list() {
        await wait()
        return clone(db.companies)
      },
      async get(id) {
        await wait()
        return clone(db.companies.find((c) => c.id === id) ?? null)
      },
      async create(input: CompanyInput, licenseInputs: CompanyLicenseInput[]) {
        await wait()
        authorize('company:write')
        const cnpj = normalizeCnpj(input.cnpj)
        assertUniqueCnpj(cnpj)
        const user = currentUser()
        const ts = nowISO()
        const company: Company = { ...clone(input), cnpj, id: uid(), createdAt: ts, updatedAt: ts, createdBy: user.id }
        db.companies.push(company)
        ;[input.mainCnae, ...input.secondaryCnaes].forEach((c) => c && ensureCnae(c))
        for (const li of licenseInputs) {
          db.licenses.push({
            id: uid(),
            companyId: company.id,
            licenseTypeId: li.licenseTypeId,
            applicability: li.applicability,
            providerCode: li.providerCode,
            situation: null,
            issuedAt: null,
            expiresAt: null,
            documentNumber: null,
            protocolNumber: null,
            lastConsultationId: null,
            lastCheckedAt: null,
            notes: null,
            createdAt: ts,
            updatedAt: ts,
          })
        }
        audit({ action: 'empresa_criada', tableName: 'companies', recordId: company.id, companyId: company.id, oldValues: null, newValues: { razao_social: company.legalName, cnpj } })
        persist()
        return clone(company)
      },
      async update(id, input) {
        await wait()
        authorize('company:write')
        const company = findCompany(id)
        const cnpj = normalizeCnpj(input.cnpj)
        assertUniqueCnpj(cnpj, id)
        const next = { ...clone(input), cnpj }
        const { oldValues, newValues, changed } = diff(company, next)
        Object.assign(company, next, { updatedAt: nowISO() })
        ;[input.mainCnae, ...input.secondaryCnaes].forEach((c) => c && ensureCnae(c))
        if (changed) audit({ action: 'empresa_alterada', tableName: 'companies', recordId: id, companyId: id, oldValues, newValues })
        persist()
        return clone(company)
      },
      async remove(id) {
        await wait()
        authorize('company:delete')
        const company = findCompany(id)
        const hasHistory =
          db.consultations.some((c) => c.companyId === id) ||
          db.documents.some((d) => d.companyId === id) ||
          db.alerts.some((a) => a.companyId === id) ||
          db.simulationRuns.some((r) => r.companyId === id)
        if (hasHistory) {
          throw new AppError('CONFLICT', 'A empresa possui histórico e não pode ser excluída. Altere o status para Inativa.')
        }
        db.companies = db.companies.filter((c) => c.id !== id)
        db.licenses = db.licenses.filter((l) => l.companyId !== id)
        audit({ action: 'empresa_excluida', tableName: 'companies', recordId: id, companyId: null, oldValues: { razao_social: company.legalName, cnpj: company.cnpj }, newValues: null })
        persist()
      },
    },

    licenses: {
      async listAll() {
        await wait()
        return clone(db.licenses)
      },
      async listByCompany(companyId) {
        await wait()
        return clone(db.licenses.filter((l) => l.companyId === companyId))
      },
      async get(id) {
        await wait()
        return clone(db.licenses.find((l) => l.id === id) ?? null)
      },
      async add(companyId, input) {
        await wait()
        authorize('license:write')
        findCompany(companyId)
        if (db.licenses.some((l) => l.companyId === companyId && l.licenseTypeId === input.licenseTypeId)) {
          throw new AppError('CONFLICT', 'Esta licença já está sendo monitorada para a empresa.')
        }
        const ts = nowISO()
        const license: CompanyLicense = {
          id: uid(),
          companyId,
          ...input,
          situation: null,
          issuedAt: null,
          expiresAt: null,
          documentNumber: null,
          protocolNumber: null,
          lastConsultationId: null,
          lastCheckedAt: null,
          notes: null,
          createdAt: ts,
          updatedAt: ts,
        }
        db.licenses.push(license)
        audit({ action: 'licenca_adicionada', tableName: 'company_licenses', recordId: license.id, companyId, oldValues: null, newValues: { tipo: input.licenseTypeId, aplicabilidade: input.applicability } })
        persist()
        return clone(license)
      },
      async update(id, patch) {
        await wait()
        authorize('license:write')
        const license = findLicense(id)
        const { oldValues, newValues, changed } = diff(license, patch)
        Object.assign(license, patch, { updatedAt: nowISO() })
        if (changed) audit({ action: 'licenca_alterada', tableName: 'company_licenses', recordId: id, companyId: license.companyId, oldValues, newValues })
        persist()
        return clone(license)
      },
    },

    consultations: {
      async list(filter: ConsultationFilter = {}) {
        await wait()
        let rows = db.consultations
        if (filter.companyId) rows = rows.filter((c) => c.companyId === filter.companyId)
        if (filter.companyLicenseId) rows = rows.filter((c) => c.companyLicenseId === filter.companyLicenseId)
        if (filter.type) rows = rows.filter((c) => c.type === filter.type)
        if (filter.from) rows = rows.filter((c) => c.consultedAt >= filter.from!)
        if (filter.to) rows = rows.filter((c) => c.consultedAt <= filter.to!)
        rows = [...rows].sort((a, b) => b.consultedAt.localeCompare(a.consultedAt))
        return clone(filter.limit ? rows.slice(0, filter.limit) : rows)
      },
      async latestSuccessful(companyLicenseId) {
        await wait()
        return clone(latestSuccessful(companyLicenseId))
      },
      async record(bundle: ConsultationBundle, expectedPreviousId) {
        await wait()
        authorize('consultation:create')
        const license = findLicense(bundle.consultation.companyLicenseId)
        const latest = latestSuccessful(license.id)
        if ((latest?.id ?? null) !== expectedPreviousId) {
          throw new AppError('CONCURRENT_UPDATE', 'Outra consulta desta licença foi registrada enquanto você preenchia. Revise e tente novamente.')
        }
        const consultation: LicenseConsultation = { ...clone(bundle.consultation), createdAt: nowISO() }
        db.consultations.push(consultation)
        if (bundle.change && consultation.previousConsultationId) {
          db.changes.unshift({
            id: bundle.change.id,
            companyLicenseId: license.id,
            companyId: license.companyId,
            consultationId: consultation.id,
            previousConsultationId: consultation.previousConsultationId,
            changes: clone(bundle.change.changes),
            detectedAt: consultation.consultedAt,
          })
        }
        const before = { situation: license.situation, expiresAt: license.expiresAt }
        Object.assign(license, bundle.licenseUpdate, { updatedAt: nowISO() })
        insertAlerts(bundle.alerts)
        if (bundle.document) await storeDocument(bundle.document.input, bundle.document.file)
        audit({
          action: 'consulta_registrada',
          tableName: 'license_consultations',
          recordId: consultation.id,
          companyId: license.companyId,
          oldValues: before,
          newValues: { situation: license.situation, expiresAt: license.expiresAt },
        })
        persist()
        return clone(consultation)
      },
      async listChanges(filter = {}) {
        await wait()
        let rows = db.changes
        if (filter.companyId) rows = rows.filter((c) => c.companyId === filter.companyId)
        rows = [...rows].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
        return clone(filter.limit ? rows.slice(0, filter.limit) : rows)
      },
    },

    documents: {
      async list(filter = {}) {
        await wait()
        return db.documents
          .filter(
            (d) =>
              (!filter.companyId || d.companyId === filter.companyId) &&
              (!filter.companyLicenseId || d.companyLicenseId === filter.companyLicenseId) &&
              (filter.includeArchived || !d.archivedAt),
          )
          .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
          .map(stripDocument)
      },
      async upload(input, file) {
        await wait()
        authorize('document:write')
        const doc = await storeDocument(input, file)
        audit({ action: 'documento_anexado', tableName: 'license_documents', recordId: doc.id, companyId: doc.companyId, oldValues: null, newValues: { nome: doc.name, arquivo: doc.fileName } })
        persist()
        return stripDocument(doc)
      },
      async archive(id) {
        await wait()
        authorize('document:write')
        const doc = db.documents.find((d) => d.id === id)
        if (!doc) throw new AppError('NOT_FOUND', 'Documento não encontrado.')
        doc.archivedAt = nowISO()
        audit({ action: 'documento_arquivado', tableName: 'license_documents', recordId: id, companyId: doc.companyId, oldValues: null, newValues: { arquivado: true } })
        persist()
      },
      async getFileUrl(document) {
        return db.documents.find((d) => d.id === document.id)?.dataUrl ?? null
      },
    },

    alerts: {
      async list(filter: AlertFilter = {}) {
        await wait()
        return clone(
          db.alerts
            .filter(
              (a) =>
                (!filter.companyId || a.companyId === filter.companyId) &&
                (!filter.status ||
                  (filter.status === 'pendentes' ? a.status !== 'resolvido' : a.status === filter.status)),
            )
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        )
      },
      async createMany(drafts) {
        await wait()
        authorize('alert:manage')
        const created = insertAlerts(drafts)
        persist()
        return clone(created)
      },
      async markRead(id) {
        await wait()
        authorize('alert:manage')
        const alert = db.alerts.find((a) => a.id === id)
        if (alert && alert.status === 'aberto') {
          alert.status = 'lido'
          alert.readAt = nowISO()
          persist()
        }
      },
      async resolve(id, note) {
        await wait()
        authorize('alert:manage')
        const alert = db.alerts.find((a) => a.id === id)
        if (!alert) throw new AppError('NOT_FOUND', 'Alerta não encontrado.')
        alert.status = 'resolvido'
        alert.resolvedAt = nowISO()
        alert.readAt ??= alert.resolvedAt
        alert.resolutionNote = note
        audit({ action: 'alerta_resolvido', tableName: 'alerts', recordId: id, companyId: alert.companyId, oldValues: null, newValues: { observacao: note } })
        persist()
      },
      async reopen(id) {
        await wait()
        authorize('alert:manage')
        const alert = db.alerts.find((a) => a.id === id)
        if (!alert) throw new AppError('NOT_FOUND', 'Alerta não encontrado.')
        alert.status = 'lido'
        alert.resolvedAt = null
        persist()
      },
      async addNote(id, note) {
        await wait()
        authorize('alert:manage')
        const alert = db.alerts.find((a) => a.id === id)
        if (!alert) throw new AppError('NOT_FOUND', 'Alerta não encontrado.')
        alert.notes.push({ id: uid(), alertId: id, note, authorName: currentUser().fullName, createdAt: nowISO() })
        persist()
      },
    },

    notifications: {
      async list(limit = 100) {
        await wait()
        return clone(db.notificationLogs.slice(0, limit))
      },
      async create(log) {
        db.notificationLogs.unshift({ ...log, id: uid(), createdAt: nowISO() })
        persist()
      },
    },

    audit: {
      async list(filter = {}) {
        await wait()
        authorize('audit:view')
        const rows = db.audit.filter((a) => !filter.companyId || a.companyId === filter.companyId)
        return clone(rows.slice(0, filter.limit ?? 200))
      },
    },

    users: {
      async list() {
        await wait()
        return clone(db.users)
      },
      async updateRole(id, role) {
        await wait()
        authorize('users:manage')
        if (id === db.currentUserId) throw new AppError('FORBIDDEN', 'Você não pode alterar o próprio perfil de acesso.')
        const user = db.users.find((u) => u.id === id)
        if (!user) throw new AppError('NOT_FOUND', 'Usuário não encontrado.')
        audit({ action: 'perfil_alterado', tableName: 'profiles', recordId: id, companyId: null, oldValues: { role: user.role }, newValues: { role } })
        user.role = role
        persist()
      },
      async setActive(id, active) {
        await wait()
        authorize('users:manage')
        if (id === db.currentUserId) throw new AppError('FORBIDDEN', 'Você não pode desativar o próprio usuário.')
        const user = db.users.find((u) => u.id === id)
        if (!user) throw new AppError('NOT_FOUND', 'Usuário não encontrado.')
        user.active = active
        persist()
      },
    },

    search: {
      async global(query) {
        await wait()
        const q = normalizeText(query.trim())
        if (q.length < 2) return []
        const qAlnum = normalizeCnpj(query)
        const companies = new Map(db.companies.map((c) => [c.id, c]))
        const typeName = new Map(db.licenseTypes.map((t) => [t.id, t.name]))
        const results: SearchResult[] = []
        const seen = new Set<string>()
        const push = (r: SearchResult) => {
          const key = `${r.kind}:${r.companyLicenseId ?? r.companyId}:${r.title}`
          if (!seen.has(key)) {
            seen.add(key)
            results.push(r)
          }
        }

        for (const c of db.companies) {
          const byName = normalizeText(`${c.legalName} ${c.tradeName}`).includes(q)
          const byCnpj = qAlnum.length >= 3 && c.cnpj.includes(qAlnum)
          if (byName || byCnpj) push({ kind: 'empresa', companyId: c.id, companyLicenseId: null, title: c.legalName, subtitle: c.cnpj })
        }
        for (const l of db.licenses) {
          const company = companies.get(l.companyId)
          if (!company) continue
          if (l.documentNumber && normalizeText(l.documentNumber).includes(q)) {
            push({ kind: 'licenca', companyId: company.id, companyLicenseId: l.id, title: l.documentNumber, subtitle: `${typeName.get(l.licenseTypeId)} · ${company.legalName}` })
          }
          if (l.protocolNumber && normalizeText(l.protocolNumber).includes(q)) {
            push({ kind: 'protocolo', companyId: company.id, companyLicenseId: l.id, title: l.protocolNumber, subtitle: `${typeName.get(l.licenseTypeId)} · ${company.legalName}` })
          }
        }
        for (const c of db.consultations) {
          const company = companies.get(c.companyId)
          if (!company || !c.protocolNumber || !normalizeText(c.protocolNumber).includes(q)) continue
          push({ kind: 'protocolo', companyId: company.id, companyLicenseId: c.companyLicenseId, title: c.protocolNumber, subtitle: `${typeName.get(c.licenseTypeId)} · ${company.legalName}` })
        }
        for (const d of db.documents) {
          const company = companies.get(d.companyId)
          if (!company || d.archivedAt) continue
          if (normalizeText(`${d.name} ${d.number ?? ''} ${d.fileName ?? ''}`).includes(q)) {
            push({ kind: 'documento', companyId: company.id, companyLicenseId: d.companyLicenseId, title: d.name, subtitle: company.legalName })
          }
        }
        return results.slice(0, 12)
      },
    },

    simulation: createMockSimulationRepository({ db: () => db, persist, wait, authorize, currentUser, audit }),

    demo: {
      async reset() {
        const currentUserId = db.currentUserId
        db = createDemoDatabase(today())
        if (db.users.some((u) => u.id === currentUserId)) db.currentUserId = currentUserId
        persist()
        notify()
      },
      async switchUser(role: UserRole) {
        const user = db.users.find((u) => u.role === role)
        if (!user) throw new AppError('NOT_FOUND', 'Usuário de demonstração não encontrado.')
        db.currentUserId = user.id
        persist()
        notify()
        return clone(user)
      },
    },
  }
}
