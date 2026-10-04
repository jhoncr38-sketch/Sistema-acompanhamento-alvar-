import { addDays } from '@/domain/dates'
import { formatCnae, normalizeCnae } from '@/domain/format'
import type { Permission } from '@/domain/permissions'
import { findOverlappingVersion } from '@/domain/simulation/engine'
import type { CnaeRule, LegislationImportBatch, LegislationVersion, SimulationRun, SimulationRunSummary } from '@/domain/simulation/types'
import type { AuditLog, UserProfile } from '@/domain/types'
import { AppError } from '../errors'
import type { CnaeRuleInput, SimulationRepository } from '../types'
import type { MockDb } from './mock-db'

export interface MockRepositoryDeps {
  db(): MockDb
  persist(): void
  wait(): Promise<void>
  authorize(permission: Permission): void
  currentUser(): UserProfile
  audit(entry: Pick<AuditLog, 'action' | 'tableName' | 'recordId' | 'companyId' | 'oldValues' | 'newValues'>): void
}

const uid = () => crypto.randomUUID()
const clone = <T>(value: T): T => structuredClone(value)
const snapshot = (value: object): Record<string, unknown> => ({ ...structuredClone(value) })
const OVERLAP_MESSAGE = 'Já existe outra versão ativa desta norma com vigência no mesmo período.'
const RELATIONS = ['altera', 'revoga', 'regulamenta', 'consolida']

function toSummary(run: Omit<SimulationRun, 'applications'>): SimulationRunSummary {
  const { result: _result, ...summary } = run
  return clone(summary)
}

export function createMockSimulationRepository(deps: MockRepositoryDeps): SimulationRepository {
  const { db, persist, wait, authorize, audit } = deps

  // Índice dos códigos do catálogo: a importação de um anexo completo inclui milhares de regras de uma vez.
  let cnaeIndex: { list: unknown; size: number; codes: Set<string> } | null = null
  function ensureCnae(code: string, description?: string | null) {
    const cnaes = db().cnaes
    if (!cnaeIndex || cnaeIndex.list !== cnaes || cnaeIndex.size !== cnaes.length) {
      cnaeIndex = { list: cnaes, size: cnaes.length, codes: new Set(cnaes.map((c) => normalizeCnae(c.code))) }
    }
    if (!cnaeIndex.codes.has(code)) {
      cnaes.push({ id: uid(), code, description: description?.trim() || `CNAE ${formatCnae(code)}` })
      cnaeIndex.codes.add(code)
      cnaeIndex.size = cnaes.length
    }
  }

  /** `legislationId` informado = versão ainda não gravada (publicação de importação). */
  function buildRule(input: CnaeRuleInput, id: string, legislationId?: string): CnaeRule {
    const base = db()
    const cnaeCode = input.cnaeCode === null ? null : normalizeCnae(input.cnaeCode)
    const cboCode = input.cboCode ? input.cboCode.replace(/\D/g, '') : null
    if (cnaeCode !== null && cnaeCode.length !== 7) throw new AppError('VALIDATION', 'CNAE deve ter 7 dígitos.')
    if (cboCode !== null && cboCode.length !== 6) throw new AppError('VALIDATION', 'CBO deve ter 6 dígitos.')
    if (cnaeCode !== null && cboCode !== null) throw new AppError('VALIDATION', 'A regra deve ser por CNAE ou por CBO, não pelos dois.')
    const ownerId = legislationId ?? base.legislationVersions.find((v) => v.id === input.legislationVersionId)?.legislationId
    if (!ownerId) throw new AppError('NOT_FOUND', 'Versão da norma não encontrada.')
    if (input.annexId && !base.legislationAnnexes.some((a) => a.id === input.annexId && a.legislationId === ownerId)) {
      throw new AppError('VALIDATION', 'Anexo não pertence a esta norma.')
    }
    if (input.licenseTypeId && !base.licenseTypes.some((t) => t.id === input.licenseTypeId)) throw new AppError('VALIDATION', 'Tipo de licença não cadastrado.')
    if (input.sourceDocumentId && !base.legislationDocuments.some((d) => d.id === input.sourceDocumentId)) {
      throw new AppError('VALIDATION', 'Documento-fonte não está na biblioteca de legislação.')
    }
    if (input.sourcePage !== null && (!Number.isInteger(input.sourcePage) || input.sourcePage < 1)) throw new AppError('VALIDATION', 'Página do documento inválida.')
    if (!base.riskClassifications.some((c) => c.id === input.classificationId)) throw new AppError('VALIDATION', 'Classificação não cadastrada.')
    if (input.elseClassificationId && !base.riskClassifications.some((c) => c.id === input.elseClassificationId)) {
      throw new AppError('VALIDATION', 'Classificação alternativa não cadastrada.')
    }
    for (const condition of input.conditions) {
      if (condition.questionId === null) {
        if (!condition.description.trim()) throw new AppError('VALIDATION', 'Condição sem pergunta precisa do texto da norma.')
      } else if (!base.ruleQuestions.some((q) => q.id === condition.questionId)) {
        throw new AppError('VALIDATION', 'Condição usa pergunta não cadastrada.')
      }
    }
    if (!Number.isInteger(input.priority) || input.priority < 1) throw new AppError('VALIDATION', 'Ordem de avaliação inválida.')
    if (cnaeCode) ensureCnae(cnaeCode, input.cnaeDescription)
    return {
      id,
      legislationVersionId: input.legislationVersionId,
      cnaeCode,
      priority: input.priority,
      classificationId: input.classificationId,
      elseClassificationId: input.elseClassificationId,
      conditions: input.conditions.map((c) => ({ ...clone(c), id: uid() })),
      article: input.article?.trim() || null,
      annex: input.annex?.trim() || null,
      item: input.item?.trim() || null,
      description: input.description.trim(),
      active: input.active,
      annexId: input.annexId,
      licenseTypeId: input.licenseTypeId,
      cboCode,
      notes: input.notes?.trim() || null,
      sourceDocumentId: input.sourceDocumentId,
      sourcePage: input.sourceDocumentId ? input.sourcePage : null,
    }
  }

  /** Validação comum de vigência (criação manual ou publicação de importação). */
  function prepareVersion(input: Omit<LegislationVersion, 'id'> & { id?: string }, closePreviousVersionId: string | null | undefined) {
    const base = db()
    if (!base.legislations.some((l) => l.id === input.legislationId)) throw new AppError('NOT_FOUND', 'Norma não encontrada.')
    if (!input.label.trim() || !input.validFrom) throw new AppError('VALIDATION', 'Informe a identificação e o início da vigência.')
    if (input.validTo && input.validTo < input.validFrom) throw new AppError('VALIDATION', 'O fim da vigência não pode ser anterior ao início.')
    if (input.amendedByLegislationId && !base.legislations.some((l) => l.id === input.amendedByLegislationId)) {
      throw new AppError('VALIDATION', 'Norma modificadora não cadastrada.')
    }
    const previous = closePreviousVersionId ? base.legislationVersions.find((v) => v.id === closePreviousVersionId) : undefined
    const previousEnd = previous ? addDays(input.validFrom, -1) : null
    if (previous && previousEnd && previous.validFrom > previousEnd) {
      throw new AppError('VALIDATION', 'A nova versão precisa começar depois do início da versão anterior.')
    }
    const others = base.legislationVersions.map((v) => (previous && v.id === previous.id ? { ...v, validTo: previousEnd } : v))
    if (findOverlappingVersion(others, input)) throw new AppError('CONFLICT', OVERLAP_MESSAGE)
    return () => {
      if (previous && previousEnd) {
        audit({ action: 'versao_encerrada', tableName: 'legislation_versions', recordId: previous.id, companyId: null, oldValues: { validTo: previous.validTo }, newValues: { validTo: previousEnd } })
        previous.validTo = previousEnd
      }
    }
  }

  return {
    async getRuleBase() {
      await wait()
      const base = db()
      return clone({
        legislations: base.legislations,
        versions: base.legislationVersions,
        annexes: base.legislationAnnexes,
        documents: base.legislationDocuments,
        classifications: base.riskClassifications,
        questions: base.ruleQuestions,
        cnaeRules: base.cnaeRules,
        licenseRules: base.licenseRules,
      })
    },

    async saveLegislation(input) {
      await wait()
      authorize('settings:manage')
      if (!input.number.trim() || !input.title.trim()) throw new AppError('VALIDATION', 'Informe o número e o título da norma.')
      if (input.level !== 'federal' && !input.uf) throw new AppError('VALIDATION', 'Informe a UF da norma.')
      if (input.level === 'municipal' && !input.city?.trim()) throw new AppError('VALIDATION', 'Informe o município da norma.')
      if (input.parentLegislationId && (input.parentLegislationId === input.id || !db().legislations.some((l) => l.id === input.parentLegislationId))) {
        throw new AppError('VALIDATION', 'Norma relacionada inválida.')
      }
      if (input.relation && !RELATIONS.includes(input.relation)) throw new AppError('VALIDATION', 'Tipo de relação inválido.')
      if (!!input.parentLegislationId !== !!input.relation) throw new AppError('VALIDATION', 'Informe a norma relacionada e o tipo de relação juntos.')
      const normalized = {
        ...input,
        uf: input.level === 'federal' ? null : input.uf,
        city: input.level === 'municipal' ? (input.city?.trim() ?? null) : null,
      }
      const existing = input.id ? db().legislations.find((l) => l.id === input.id) : undefined
      const saved = { ...normalized, id: existing?.id ?? uid() }
      const before = existing ? { ...existing } : null
      if (existing) Object.assign(existing, saved)
      else db().legislations.push(saved)
      audit({ action: existing ? 'norma_alterada' : 'norma_criada', tableName: 'legislations', recordId: saved.id, companyId: null, oldValues: before, newValues: { ...saved } })
      persist()
      return clone(saved)
    },

    async saveVersion(input, options = {}) {
      await wait()
      authorize('settings:manage')
      const base = db()
      const closePrevious = prepareVersion(input, options.closePreviousVersionId)
      closePrevious()
      const existing = input.id ? base.legislationVersions.find((v) => v.id === input.id) : undefined
      const saved = { ...input, label: input.label.trim(), id: existing?.id ?? uid() }
      const before = existing ? { ...existing } : null
      if (existing) Object.assign(existing, saved)
      else base.legislationVersions.push(saved)

      if (!existing && options.copyRulesFromVersionId) {
        for (const rule of base.cnaeRules.filter((r) => r.active && r.legislationVersionId === options.copyRulesFromVersionId)) {
          base.cnaeRules.push({ ...clone(rule), id: uid(), legislationVersionId: saved.id, conditions: rule.conditions.map((c) => ({ ...clone(c), id: uid() })) })
        }
        for (const rule of base.licenseRules.filter((r) => r.active && r.legislationVersionId === options.copyRulesFromVersionId)) {
          base.licenseRules.push({ ...clone(rule), id: uid(), legislationVersionId: saved.id })
        }
      }
      audit({ action: existing ? 'versao_alterada' : 'versao_criada', tableName: 'legislation_versions', recordId: saved.id, companyId: null, oldValues: before, newValues: { ...saved } })
      persist()
      return clone(saved)
    },

    async saveClassification(input) {
      await wait()
      authorize('settings:manage')
      if (!input.name.trim() || !input.code.trim()) throw new AppError('VALIDATION', 'Informe o nome da classificação.')
      if (db().riskClassifications.some((c) => c.code === input.code && c.id !== input.id)) throw new AppError('CONFLICT', 'Já existe uma classificação com este código.')
      const existing = input.id ? db().riskClassifications.find((c) => c.id === input.id) : undefined
      const saved = { ...input, name: input.name.trim(), id: existing?.id ?? uid() }
      const before = existing ? { ...existing } : null
      if (existing) Object.assign(existing, saved)
      else db().riskClassifications.push(saved)
      audit({ action: existing ? 'classificacao_alterada' : 'classificacao_criada', tableName: 'risk_classifications', recordId: saved.id, companyId: null, oldValues: before, newValues: { ...saved } })
      persist()
      return clone(saved)
    },

    async saveQuestion(input) {
      await wait()
      authorize('settings:manage')
      if (!input.text.trim() || !input.code.trim()) throw new AppError('VALIDATION', 'Informe o código e o texto da pergunta.')
      if (!/^[a-z0-9_]+$/.test(input.code)) throw new AppError('VALIDATION', 'O código aceita apenas letras minúsculas, números e "_".')
      if (db().ruleQuestions.some((q) => q.code === input.code && q.id !== input.id)) throw new AppError('CONFLICT', 'Já existe uma pergunta com este código.')
      if (input.type === 'opcoes' && input.options.length < 2) throw new AppError('VALIDATION', 'Informe ao menos duas opções.')
      const existing = input.id ? db().ruleQuestions.find((q) => q.id === input.id) : undefined
      const saved = { ...clone(input), text: input.text.trim(), options: input.type === 'opcoes' ? clone(input.options) : [], id: existing?.id ?? uid() }
      const before = existing ? snapshot(existing) : null
      if (existing) Object.assign(existing, saved)
      else db().ruleQuestions.push(saved)
      audit({ action: existing ? 'pergunta_alterada' : 'pergunta_criada', tableName: 'rule_questions', recordId: saved.id, companyId: null, oldValues: before, newValues: snapshot(saved) })
      persist()
      return clone(saved)
    },

    async saveCnaeRule(input) {
      await wait()
      authorize('settings:manage')
      const existing = input.id ? db().cnaeRules.find((r) => r.id === input.id) : undefined
      const saved = buildRule(input, existing?.id ?? uid())
      const before = existing ? snapshot(existing) : null
      if (existing) Object.assign(existing, saved)
      else db().cnaeRules.push(saved)
      audit({ action: existing ? 'regra_alterada' : 'regra_criada', tableName: 'cnae_rules', recordId: saved.id, companyId: null, oldValues: before, newValues: snapshot(saved) })
      persist()
      return clone(saved)
    },

    async setCnaeRuleActive(id, active) {
      await wait()
      authorize('settings:manage')
      const rule = db().cnaeRules.find((r) => r.id === id)
      if (!rule) throw new AppError('NOT_FOUND', 'Regra não encontrada.')
      audit({ action: active ? 'regra_reativada' : 'regra_desativada', tableName: 'cnae_rules', recordId: id, companyId: null, oldValues: { active: rule.active }, newValues: { active } })
      rule.active = active
      persist()
    },

    async saveLicenseRule(input) {
      await wait()
      authorize('settings:manage')
      const existing = db().licenseRules.find(
        (r) => r.legislationVersionId === input.legislationVersionId && r.classificationId === input.classificationId && r.licenseTypeId === input.licenseTypeId,
      )
      const before = existing ? { outcome: existing.outcome, active: existing.active } : null
      if (input.outcome === null) {
        if (!existing || !existing.active) return
        existing.active = false
      } else if (existing) {
        Object.assign(existing, { outcome: input.outcome, notes: input.notes ?? existing.notes, active: true })
      } else {
        db().licenseRules.push({ id: uid(), ...input, outcome: input.outcome, notes: input.notes ?? null, active: true })
      }
      audit({ action: 'efeito_licenca_alterado', tableName: 'license_rules', recordId: existing?.id ?? null, companyId: null, oldValues: before, newValues: { outcome: input.outcome } })
      persist()
    },

    async saveAnnex(input) {
      await wait()
      authorize('settings:manage')
      const code = input.code.trim()
      if (!code || !input.title.trim()) throw new AppError('VALIDATION', 'Informe o código e o título do anexo.')
      if (!db().legislations.some((l) => l.id === input.legislationId)) throw new AppError('NOT_FOUND', 'Norma não encontrada.')
      if (db().legislationAnnexes.some((a) => a.legislationId === input.legislationId && a.code === code && a.id !== input.id)) {
        throw new AppError('CONFLICT', 'Esta norma já tem um anexo com este código.')
      }
      const existing = input.id ? db().legislationAnnexes.find((a) => a.id === input.id) : undefined
      const saved = { ...input, code, title: input.title.trim(), description: input.description?.trim() || null, id: existing?.id ?? uid() }
      const before = existing ? { ...existing } : null
      if (existing) Object.assign(existing, saved)
      else db().legislationAnnexes.push(saved)
      audit({ action: existing ? 'anexo_alterado' : 'anexo_criado', tableName: 'legislation_annexes', recordId: saved.id, companyId: null, oldValues: before, newValues: { ...saved } })
      persist()
      return clone(saved)
    },

    async publishImport(publication) {
      await wait()
      authorize('settings:manage')
      const base = db()
      const { target, legislationId } = publication
      if (!base.legislations.some((l) => l.id === legislationId)) throw new AppError('NOT_FOUND', 'Norma não encontrada.')
      const effects = publication.licenseEffects ?? []
      for (const effect of effects) {
        if (!base.riskClassifications.some((c) => c.id === effect.classificationId) || !base.licenseTypes.some((t) => t.id === effect.licenseTypeId)) {
          throw new AppError('VALIDATION', 'Efeito nas licenças com classificação ou licença não cadastrada.')
        }
      }
      if (publication.insertRules.length === 0 && publication.excludeRuleIds.length === 0 && publication.deactivateRuleIds.length === 0 && effects.length === 0) {
        throw new AppError('VALIDATION', 'A importação não tem alterações a publicar.')
      }

      // 1. Valida tudo antes de gravar qualquer coisa (publicação atômica).
      let versionId: string
      let commitVersion = () => {}
      if (target.kind === 'nova_versao') {
        const version = { ...target.version, legislationId, label: target.version.label.trim() }
        const closePrevious = prepareVersion(version, target.closeBaseVersion ? publication.copyFromVersionId : null)
        versionId = uid()
        commitVersion = () => {
          closePrevious()
          base.legislationVersions.push({ ...version, id: versionId })
          audit({ action: 'versao_criada', tableName: 'legislation_versions', recordId: versionId, companyId: null, oldValues: null, newValues: { ...version, origem: 'importacao' } })
        }
      } else {
        const version = base.legislationVersions.find((v) => v.id === target.versionId && v.legislationId === legislationId)
        if (!version) throw new AppError('NOT_FOUND', 'Versão da norma não encontrada.')
        versionId = version.id
      }
      const inserted = publication.insertRules.map((r) => buildRule({ ...r, legislationVersionId: versionId, active: true }, uid(), legislationId))
      const toDeactivate = base.cnaeRules.filter((r) => publication.deactivateRuleIds.includes(r.id))
      if (toDeactivate.some((r) => r.legislationVersionId !== versionId)) throw new AppError('VALIDATION', 'Regra a substituir não pertence à versão de destino.')

      // 2. Grava.
      commitVersion()
      if (target.kind === 'nova_versao' && publication.copyFromVersionId) {
        const excluded = new Set(publication.excludeRuleIds)
        for (const rule of base.cnaeRules.filter((r) => r.active && r.legislationVersionId === publication.copyFromVersionId && !excluded.has(r.id))) {
          base.cnaeRules.push({ ...clone(rule), id: uid(), legislationVersionId: versionId, conditions: rule.conditions.map((c) => ({ ...clone(c), id: uid() })) })
        }
        for (const rule of base.licenseRules.filter((r) => r.active && r.legislationVersionId === publication.copyFromVersionId)) {
          base.licenseRules.push({ ...clone(rule), id: uid(), legislationVersionId: versionId })
        }
      }
      for (const rule of toDeactivate) rule.active = false
      base.cnaeRules.push(...inserted)
      for (const effect of effects) {
        const current = base.licenseRules.find(
          (r) => r.legislationVersionId === versionId && r.classificationId === effect.classificationId && r.licenseTypeId === effect.licenseTypeId,
        )
        if (current) Object.assign(current, { outcome: effect.outcome, notes: effect.notes, active: true })
        else base.licenseRules.push({ id: uid(), legislationVersionId: versionId, ...effect, active: true })
      }
      const batch: LegislationImportBatch = {
        id: uid(),
        legislationId,
        versionId,
        ...clone(publication.batch),
        publishedAt: new Date().toISOString(),
        publishedByName: deps.currentUser().fullName,
      }
      base.importBatches.push(batch)
      audit({ action: 'legislacao_importada', tableName: 'legislation_import_batches', recordId: batch.id, companyId: null, oldValues: null, newValues: { ...clone(batch) } })
      persist()
      return { versionId, inserted: inserted.length }
    },

    async saveDocument(input) {
      await wait()
      authorize('settings:manage')
      if (!input.title.trim()) throw new AppError('VALIDATION', 'Informe o título do documento.')
      if (!db().legislations.some((l) => l.id === input.legislationId)) throw new AppError('NOT_FOUND', 'Norma não encontrada.')
      if (input.sha256 && !/^[0-9a-f]{64}$/.test(input.sha256)) throw new AppError('VALIDATION', 'O hash deve ser SHA-256 (64 caracteres hexadecimais).')
      const existing = input.id ? db().legislationDocuments.find((d) => d.id === input.id) : undefined
      const saved = { ...input, title: input.title.trim(), id: existing?.id ?? uid() }
      const before = existing ? { ...existing } : null
      if (existing) Object.assign(existing, saved)
      else db().legislationDocuments.push(saved)
      audit({ action: existing ? 'documento_alterado' : 'documento_registrado', tableName: 'legislation_documents', recordId: saved.id, companyId: null, oldValues: before, newValues: { ...saved } })
      persist()
      return clone(saved)
    },

    async listImportBatches() {
      await wait()
      return clone([...db().importBatches].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)))
    },

    async saveRun(input) {
      await wait()
      authorize('simulation:save')
      const user = deps.currentUser()
      const { overall } = input.result
      const run: Omit<SimulationRun, 'applications'> = {
        id: uid(),
        number: db().simulationRuns.reduce((max, r) => Math.max(max, r.number), 0) + 1,
        createdAt: new Date().toISOString(),
        userName: user.fullName,
        companyId: input.companyId,
        companyName: input.companyName,
        cnpj: input.cnpj,
        uf: input.uf,
        city: input.city,
        referenceDate: input.referenceDate,
        cnaes: clone(input.cnaes),
        overallStatus: overall.status,
        classificationName: overall.classification?.name ?? null,
        classificationTone: overall.classification?.tone ?? null,
        confidence: overall.confidence,
        result: clone(input.result),
      }
      db().simulationRuns.push(run)
      persist()
      return { ...clone(run), applications: [] }
    },

    async listRuns(filter = {}) {
      await wait()
      const rows = db()
        .simulationRuns.filter((r) => !filter.companyId || r.companyId === filter.companyId)
        .sort((a, b) => b.number - a.number)
      return (filter.limit ? rows.slice(0, filter.limit) : rows).map(toSummary)
    },

    async getRun(id) {
      await wait()
      const run = db().simulationRuns.find((r) => r.id === id)
      if (!run) return null
      return { ...clone(run), applications: clone(db().simulationApplications.filter((a) => a.runId === id)) }
    },

    async applyToCompany(runId, companyId, changes) {
      await wait()
      authorize('license:write')
      const base = db()
      const run = base.simulationRuns.find((r) => r.id === runId)
      if (!run) throw new AppError('NOT_FOUND', 'Simulação não encontrada.')
      if (!base.companies.some((c) => c.id === companyId)) throw new AppError('NOT_FOUND', 'Empresa não encontrada.')
      const now = new Date().toISOString()
      for (const change of changes) {
        const type = base.licenseTypes.find((t) => t.id === change.licenseTypeId)
        if (!type) throw new AppError('NOT_FOUND', 'Tipo de licença não encontrado.')
        const license = base.licenses.find((l) => l.companyId === companyId && l.licenseTypeId === change.licenseTypeId)
        if (license) {
          const before = { applicability: license.applicability }
          license.applicability = change.applicability
          license.notes = [license.notes, change.note].filter(Boolean).join('\n')
          license.updatedAt = now
          audit({ action: 'licenca_alterada_por_simulacao', tableName: 'company_licenses', recordId: license.id, companyId, oldValues: before, newValues: { applicability: change.applicability, simulacao: run.number } })
        } else {
          const created = {
            id: uid(),
            companyId,
            licenseTypeId: change.licenseTypeId,
            applicability: change.applicability,
            providerCode: type.defaultProviderCode,
            situation: null,
            issuedAt: null,
            expiresAt: null,
            documentNumber: null,
            protocolNumber: null,
            lastConsultationId: null,
            lastCheckedAt: null,
            notes: change.note,
            createdAt: now,
            updatedAt: now,
          }
          base.licenses.push(created)
          audit({ action: 'licenca_adicionada_por_simulacao', tableName: 'company_licenses', recordId: created.id, companyId, oldValues: null, newValues: { tipo: type.name, applicability: change.applicability, simulacao: run.number } })
        }
      }
      base.simulationApplications.push({ id: uid(), runId, companyId, appliedAt: now, appliedByName: deps.currentUser().fullName, changes: clone(changes) })
      persist()
    },
  }
}
