import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeCnae } from '@/domain/format'
import type {
  CnaeRule,
  Legislation,
  LegislationAnnex,
  LegislationDocument,
  LegislationImportBatch,
  LegislationVersion,
  LicenseRule,
  RiskClassification,
  RuleQuestion,
  SimulationApplication,
  SimulationRun,
  SimulationRunSummary,
} from '@/domain/simulation/types'
import type { ImportPublication, ImportRuleInput } from '@/domain/simulation/rule-import'
import { AppError } from '../errors'
import type { CnaeRuleInput, SimulationRepository, SimulationRunInput } from '../types'
import { run, runOne, selectAll } from './helpers'
import type { Row } from './mappers'

const toLegislation = (r: Row): Legislation => ({
  id: r.id,
  kind: r.kind,
  number: r.number,
  year: r.year,
  title: r.title,
  issuingBody: r.issuing_body,
  level: r.level,
  uf: r.uf,
  city: r.city,
  definesGeneralClassification: r.defines_general_classification,
  officialUrl: r.official_url,
  notes: r.notes,
  active: r.active,
  normDate: r.norm_date ?? null,
  parentLegislationId: r.parent_legislation_id ?? null,
  relation: r.relation ?? null,
})

const toAnnex = (r: Row): LegislationAnnex => ({
  id: r.id,
  legislationId: r.legislation_id,
  code: r.code,
  title: r.title,
  kind: r.kind,
  description: r.description,
  sortOrder: r.sort_order,
  active: r.active,
})

const toDocument = (r: Row): LegislationDocument => ({
  id: r.id,
  legislationId: r.legislation_id,
  title: r.title,
  kind: r.kind,
  edition: r.edition,
  publicationDate: r.publication_date,
  pages: r.pages,
  officialUrl: r.official_url,
  fileUrl: r.file_url,
  fileName: r.file_name,
  sha256: r.sha256,
  sizeBytes: r.size_bytes === null || r.size_bytes === undefined ? null : Number(r.size_bytes),
  downloadedAt: r.downloaded_at,
  status: r.status,
  notes: r.notes,
  active: r.active,
})

const toImportBatch = (r: Row): LegislationImportBatch => ({
  id: r.id,
  legislationId: r.legislation_id,
  versionId: r.version_id,
  fileName: r.file_name,
  sourceKind: r.source_kind,
  mode: r.mode,
  rowsTotal: r.rows_total,
  counts: r.counts,
  publishedAt: r.published_at,
  publishedByName: r.published_by_name,
})

const toVersion = (r: Row): LegislationVersion => ({
  id: r.id,
  legislationId: r.legislation_id,
  label: r.label,
  validFrom: r.valid_from,
  validTo: r.valid_to,
  highestRiskPrevails: r.highest_risk_prevails,
  sourceUrl: r.source_url,
  notes: r.notes,
  active: r.active,
  amendedByLegislationId: r.amended_by_legislation_id ?? null,
})

const toClassification = (r: Row): RiskClassification => ({ id: r.id, code: r.code, name: r.name, severity: r.severity, tone: r.tone, active: r.active })

const toQuestion = (r: Row): RuleQuestion => ({
  id: r.id,
  code: r.code,
  text: r.text,
  type: r.type,
  unit: r.unit,
  options: r.options ?? [],
  helpText: r.help_text,
  active: r.active,
})

const toCnaeRule = (r: Row): CnaeRule => ({
  id: r.id,
  legislationVersionId: r.legislation_version_id,
  cnaeCode: r.cnae_code,
  priority: r.priority,
  classificationId: r.classification_id,
  elseClassificationId: r.else_classification_id,
  conditions: ((r.rule_conditions ?? []) as Row[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({ id: c.id, questionId: c.question_id, operator: c.operator, value: c.value, description: c.description })),
  article: r.article,
  annex: r.annex,
  item: r.item,
  description: r.description,
  active: r.active,
  annexId: r.annex_id ?? null,
  licenseTypeId: r.license_type_id ?? null,
  cboCode: r.cbo_code ?? null,
  notes: r.notes ?? null,
  sourceDocumentId: r.source_document_id ?? null,
  sourcePage: r.source_page ?? null,
})

const toLicenseRule = (r: Row): LicenseRule => ({
  id: r.id,
  legislationVersionId: r.legislation_version_id,
  classificationId: r.classification_id,
  licenseTypeId: r.license_type_id,
  outcome: r.outcome,
  notes: r.notes,
  active: r.active,
})

const SUMMARY_COLUMNS =
  'id, number, created_at, user_name, company_id, company_name, cnpj, uf, city, reference_date, cnaes, overall_status, classification_name, classification_tone, confidence'

const toSummary = (r: Row): SimulationRunSummary => ({
  id: r.id,
  number: Number(r.number),
  createdAt: r.created_at,
  userName: r.user_name,
  companyId: r.company_id,
  companyName: r.company_name,
  cnpj: r.cnpj,
  uf: r.uf,
  city: r.city,
  referenceDate: r.reference_date,
  cnaes: r.cnaes ?? [],
  overallStatus: r.overall_status,
  classificationName: r.classification_name,
  classificationTone: r.classification_tone,
  confidence: r.confidence,
})

const toApplication = (r: Row): SimulationApplication => ({
  id: r.id,
  runId: r.run_id,
  companyId: r.company_id,
  appliedAt: r.applied_at,
  appliedByName: r.applied_by_name,
  changes: r.changes ?? [],
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function ruleToRow(input: CnaeRuleInput | (ImportRuleInput & { legislationVersionId?: string; active?: boolean; id?: string })): Row {
  const cnaeCode = input.cnaeCode === null ? null : normalizeCnae(input.cnaeCode)
  const cboCode = input.cboCode ? input.cboCode.replace(/\D/g, '') : null
  if (cnaeCode !== null && cnaeCode.length !== 7) throw new AppError('VALIDATION', 'CNAE deve ter 7 dígitos.')
  if (cboCode !== null && cboCode.length !== 6) throw new AppError('VALIDATION', 'CBO deve ter 6 dígitos.')
  for (const c of input.conditions) {
    if (c.questionId === null && !c.description.trim()) throw new AppError('VALIDATION', 'Condição sem pergunta precisa do texto da norma.')
  }
  return {
    id: input.id ?? null,
    legislation_version_id: input.legislationVersionId,
    cnae_code: cnaeCode,
    cnae_description: input.cnaeDescription ?? null,
    priority: input.priority,
    classification_id: input.classificationId,
    else_classification_id: input.elseClassificationId,
    article: input.article?.trim() || null,
    annex: input.annex?.trim() || null,
    item: input.item?.trim() || null,
    description: input.description.trim(),
    active: input.active ?? true,
    annex_id: input.annexId,
    license_type_id: input.licenseTypeId,
    cbo_code: cboCode,
    notes: input.notes?.trim() || null,
    source_document_id: input.sourceDocumentId,
    source_page: input.sourceDocumentId ? input.sourcePage : null,
    conditions: input.conditions.map((c) => ({ question_id: c.questionId, operator: c.operator, value: c.value, description: c.description })),
  }
}

/** Linhas relacionais derivadas do resultado (a cópia completa vai em `result`). */
function runToPayload(input: SimulationRunInput): Row {
  const { result } = input
  const evaluations: Row[] = []
  for (const cnae of result.cnaes) {
    const base = { cnae_code: cnae.code, description: cnae.description, is_primary: cnae.primary }
    if (cnae.evaluations.length === 0) {
      evaluations.push({ ...base, general: true, status: cnae.status, classification_id: null, cnae_rule_id: null, legislation_version_id: null })
    }
    for (const e of cnae.evaluations) {
      evaluations.push({
        ...base,
        general: e.norm.general,
        status: e.status,
        classification_id: e.classification?.id ?? null,
        cnae_rule_id: e.decidingRuleId,
        legislation_version_id: e.norm.versionId,
      })
    }
  }
  return {
    company_id: input.companyId,
    company_name: input.companyName,
    cnpj: input.cnpj,
    uf: input.uf,
    city: input.city,
    reference_date: input.referenceDate,
    overall_status: result.overall.status,
    classification_id: result.overall.classification?.id ?? null,
    classification_name: result.overall.classification?.name ?? null,
    classification_tone: result.overall.classification?.tone ?? null,
    confidence: result.overall.confidence,
    engine_version: result.engineVersion,
    cnaes: input.cnaes,
    result,
    evaluations,
    answers: result.answers
      .filter((a) => a.answer !== null)
      .map((a) => ({ question_id: UUID_RE.test(a.questionId) ? a.questionId : null, question_code: a.code, question_text: a.text, value: a.answer })),
    licenses: result.licenses.map((l) => ({ license_type_id: l.licenseTypeId, outcome: l.outcome, summary: l.summary })),
  }
}

export function createSupabaseSimulationRepository(sb: SupabaseClient): SimulationRepository {
  async function requireAdminWrite<T>(rows: T[] | null): Promise<T> {
    const row = rows?.[0]
    if (!row) throw new AppError('FORBIDDEN', 'Somente administradores alteram a legislação e as regras.')
    return row
  }

  return {
    async getRuleBase() {
      const [legislations, versions, annexes, documents, classifications, questions, cnaeRules, licenseRules] = await Promise.all([
        run(sb.from('legislations').select('*').order('year').order('number')),
        run(sb.from('legislation_versions').select('*').order('valid_from')),
        run(sb.from('legislation_annexes').select('*').order('sort_order').order('code')),
        run(sb.from('legislation_documents').select('*').order('publication_date')),
        run(sb.from('risk_classifications').select('*').order('severity')),
        run(sb.from('rule_questions').select('*').order('code')),
        selectAll(() => sb.from('cnae_rules').select('*, rule_conditions(*)').order('cnae_code').order('priority').order('id')),
        selectAll(() => sb.from('license_rules').select('*').order('id')),
      ])
      return {
        legislations: (legislations ?? []).map(toLegislation),
        versions: (versions ?? []).map(toVersion),
        annexes: (annexes ?? []).map(toAnnex),
        documents: (documents ?? []).map(toDocument),
        classifications: (classifications ?? []).map(toClassification),
        questions: (questions ?? []).map(toQuestion),
        cnaeRules: cnaeRules.map(toCnaeRule),
        licenseRules: licenseRules.map(toLicenseRule),
      }
    },

    async saveLegislation(input) {
      const row = {
        kind: input.kind,
        number: input.number.trim(),
        year: input.year,
        title: input.title.trim(),
        issuing_body: input.issuingBody.trim(),
        level: input.level,
        uf: input.level === 'federal' ? null : input.uf,
        city: input.level === 'municipal' ? (input.city?.trim() ?? null) : null,
        defines_general_classification: input.definesGeneralClassification,
        official_url: input.officialUrl,
        notes: input.notes,
        active: input.active,
        norm_date: input.normDate,
        parent_legislation_id: input.parentLegislationId,
        relation: input.relation,
      }
      const rows = input.id
        ? await run(sb.from('legislations').update(row).eq('id', input.id).select('*'))
        : await run(sb.from('legislations').insert(row).select('*'))
      return toLegislation(await requireAdminWrite(rows))
    },

    async saveVersion(input, options = {}) {
      const row = await runOne(
        sb
          .rpc('save_legislation_version', {
            p: {
              id: input.id ?? null,
              legislation_id: input.legislationId,
              label: input.label.trim(),
              valid_from: input.validFrom,
              valid_to: input.validTo,
              highest_risk_prevails: input.highestRiskPrevails,
              source_url: input.sourceUrl,
              notes: input.notes,
              active: input.active,
              amended_by_legislation_id: input.amendedByLegislationId,
            },
            p_close_previous: options.closePreviousVersionId ?? null,
            p_copy_from: input.id ? null : (options.copyRulesFromVersionId ?? null),
          })
          .single<Row>(),
      )
      return toVersion(row)
    },

    async saveClassification(input) {
      const row = { code: input.code, name: input.name.trim(), severity: input.severity, tone: input.tone, active: input.active }
      const rows = input.id
        ? await run(sb.from('risk_classifications').update(row).eq('id', input.id).select('*'))
        : await run(sb.from('risk_classifications').insert(row).select('*'))
      return toClassification(await requireAdminWrite(rows))
    },

    async saveQuestion(input) {
      const row = {
        code: input.code,
        text: input.text.trim(),
        type: input.type,
        unit: input.unit,
        options: input.type === 'opcoes' ? input.options : [],
        help_text: input.helpText,
        active: input.active,
      }
      const rows = input.id
        ? await run(sb.from('rule_questions').update(row).eq('id', input.id).select('*'))
        : await run(sb.from('rule_questions').insert(row).select('*'))
      return toQuestion(await requireAdminWrite(rows))
    },

    async saveCnaeRule(input) {
      const id = await runOne(sb.rpc('save_cnae_rule', { p: ruleToRow(input) }))
      return toCnaeRule(await runOne(sb.from('cnae_rules').select('*, rule_conditions(*)').eq('id', id as string).single()))
    },

    async setCnaeRuleActive(id, active) {
      await requireAdminWrite(await run(sb.from('cnae_rules').update({ active }).eq('id', id).select('id')))
    },

    async saveLicenseRule(input) {
      const key = { legislation_version_id: input.legislationVersionId, classification_id: input.classificationId, license_type_id: input.licenseTypeId }
      if (input.outcome === null) {
        await run(sb.from('license_rules').update({ active: false }).match(key))
        return
      }
      const rows = await run(
        sb
          .from('license_rules')
          .upsert({ ...key, outcome: input.outcome, notes: input.notes ?? null, active: true }, { onConflict: 'legislation_version_id,classification_id,license_type_id' })
          .select('id'),
      )
      await requireAdminWrite(rows)
    },

    async saveAnnex(input) {
      const row = {
        legislation_id: input.legislationId,
        code: input.code.trim(),
        title: input.title.trim(),
        kind: input.kind,
        description: input.description?.trim() || null,
        sort_order: input.sortOrder,
        active: input.active,
      }
      const rows = input.id
        ? await run(sb.from('legislation_annexes').update(row).eq('id', input.id).select('*'))
        : await run(sb.from('legislation_annexes').insert(row).select('*'))
      return toAnnex(await requireAdminWrite(rows))
    },

    async publishImport(publication: ImportPublication) {
      const { target } = publication
      const result = (await run(
        sb.rpc('publish_rule_import', {
          p: {
            legislation_id: publication.legislationId,
            target:
              target.kind === 'nova_versao'
                ? {
                    kind: 'nova_versao',
                    close_base_version: target.closeBaseVersion,
                    version: {
                      label: target.version.label.trim(),
                      valid_from: target.version.validFrom,
                      valid_to: target.version.validTo,
                      highest_risk_prevails: target.version.highestRiskPrevails,
                      source_url: target.version.sourceUrl,
                      notes: target.version.notes,
                      active: target.version.active,
                      amended_by_legislation_id: target.version.amendedByLegislationId,
                    },
                  }
                : { kind: 'versao_existente', version_id: target.versionId },
            copy_from_version_id: publication.copyFromVersionId,
            exclude_rule_ids: publication.excludeRuleIds,
            deactivate_rule_ids: publication.deactivateRuleIds,
            insert_rules: publication.insertRules.map((r) => ruleToRow(r)),
            license_effects: (publication.licenseEffects ?? []).map((e) => ({ classification_id: e.classificationId, license_type_id: e.licenseTypeId, outcome: e.outcome, notes: e.notes })),
            batch: {
              file_name: publication.batch.fileName,
              source_kind: publication.batch.sourceKind,
              mode: publication.batch.mode,
              rows_total: publication.batch.rowsTotal,
              counts: publication.batch.counts,
            },
          },
        }),
      )) as { version_id: string; inserted: number } | null
      if (!result) throw new AppError('UNKNOWN', 'A publicação não retornou a versão criada.')
      return { versionId: result.version_id, inserted: Number(result.inserted) }
    },

    async saveDocument(input) {
      const row = {
        legislation_id: input.legislationId,
        title: input.title.trim(),
        kind: input.kind,
        edition: input.edition,
        publication_date: input.publicationDate,
        pages: input.pages,
        official_url: input.officialUrl,
        file_url: input.fileUrl,
        file_name: input.fileName,
        sha256: input.sha256,
        size_bytes: input.sizeBytes,
        downloaded_at: input.downloadedAt,
        status: input.status,
        notes: input.notes,
        active: input.active,
      }
      const rows = input.id
        ? await run(sb.from('legislation_documents').update(row).eq('id', input.id).select('*'))
        : await run(sb.from('legislation_documents').insert(row).select('*'))
      return toDocument(await requireAdminWrite(rows))
    },

    async listImportBatches() {
      return ((await run(sb.from('legislation_import_batches').select('*').order('published_at', { ascending: false }).limit(200))) ?? []).map(toImportBatch)
    },

    async saveRun(input) {
      const row = await runOne(sb.rpc('save_simulation', { p: runToPayload(input) }).single<Row>())
      return { ...toSummary(row), result: input.result, applications: [] }
    },

    async listRuns(filter = {}) {
      let q = sb.from('simulation_runs').select(SUMMARY_COLUMNS).order('number', { ascending: false }).limit(filter.limit ?? 200)
      if (filter.companyId) q = q.eq('company_id', filter.companyId)
      return ((await run(q)) ?? []).map(toSummary)
    },

    async getRun(id): Promise<SimulationRun | null> {
      const row = await run(sb.from('simulation_runs').select('*, simulation_applications(*)').eq('id', id).maybeSingle())
      if (!row) return null
      return {
        ...toSummary(row),
        result: row.result,
        applications: ((row.simulation_applications ?? []) as Row[]).map(toApplication).sort((a, b) => a.appliedAt.localeCompare(b.appliedAt)),
      }
    },

    async applyToCompany(runId, companyId, changes) {
      await run(
        sb.rpc('apply_simulation', {
          p_run: runId,
          p_company: companyId,
          p_changes: changes.map((c) => ({ license_type_id: c.licenseTypeId, applicability: c.applicability, note: c.note })),
        }),
      )
    },
  }
}
