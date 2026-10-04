import type {
  CnaeRule,
  ConditionOperator,
  ConditionValue,
  Legislation,
  LegislationAnnex,
  LegislationDocument,
  LegislationVersion,
  LicenseOutcome,
  LicenseRule,
  RiskClassification,
  RuleCondition,
  RuleQuestion,
} from '@/domain/simulation/types'
import { DEMO_CITY } from '@/config/simulation'
import type { LicenseType } from '@/domain/types'
import { ANNEX_SEEDS, DOCUMENT_SEEDS, LEGISLATION_SEEDS, QUESTION_SEEDS, RISK_CLASSIFICATION_SEEDS } from '../catalog-seed'
import type { MockDb } from './mock-db'

/**
 * Dados da Simulação no modo demonstração.
 *
 * 1. TERESINA – PI: identificação das normas, anexos e documentos oficiais da biblioteca (legislacao/teresina), SEM
 *    regras. A simulação retorna "Regra não cadastrada" até o administrador importar e aprovar os pacotes extraídos.
 * 2. "CIDADE EXEMPLO" (fictícia): uma norma FICTÍCIA completa, só para testar o simulador. Não representa
 *    legislação real e não vai para o banco do Supabase.
 */
export const DEMO_NORM_TITLE = 'EXEMPLO FICTÍCIO — norma de demonstração do simulador (não é legislação real)'
export { DEMO_CITY }

type SimulationData = Pick<
  MockDb,
  | 'legislations'
  | 'legislationVersions'
  | 'legislationAnnexes'
  | 'legislationDocuments'
  | 'riskClassifications'
  | 'ruleQuestions'
  | 'cnaeRules'
  | 'licenseRules'
  | 'simulationRuns'
  | 'simulationApplications'
  | 'importBatches'
>

const uid = () => crypto.randomUUID()

export function createRiskClassifications(): RiskClassification[] {
  return RISK_CLASSIFICATION_SEEDS.map((c) => ({ ...c, id: uid(), active: true }))
}

export function createSeedQuestions(): RuleQuestion[] {
  return QUESTION_SEEDS.map((q) => ({ id: uid(), code: q.code, text: q.text, type: 'numero', unit: q.unit, options: [], helpText: q.helpText, active: true }))
}

/** Normas de Teresina conferidas nos PDFs oficiais — identificação, anexos e documentos, sem regras. */
export function createInformedLegislation(): { legislations: Legislation[]; annexes: LegislationAnnex[]; documents: LegislationDocument[] } {
  const ids = new Map(LEGISLATION_SEEDS.map((l) => [l.key, uid()]))
  const legislations: Legislation[] = LEGISLATION_SEEDS.map((l) => ({
    id: ids.get(l.key)!,
    kind: l.kind,
    number: l.number,
    year: l.year,
    title: l.title,
    issuingBody: l.issuingBody,
    level: l.level,
    uf: l.uf,
    city: l.city,
    definesGeneralClassification: l.definesGeneralClassification,
    officialUrl: l.officialUrl,
    notes: l.notes,
    active: true,
    normDate: l.normDate,
    parentLegislationId: l.parentKey ? (ids.get(l.parentKey) ?? null) : null,
    relation: l.relation,
  }))
  const annexes: LegislationAnnex[] = ANNEX_SEEDS.map((a) => ({
    id: uid(),
    legislationId: ids.get(a.legislationKey)!,
    code: a.code,
    title: a.title,
    kind: a.kind,
    description: a.description,
    sortOrder: a.sortOrder,
    active: true,
  }))
  const documents: LegislationDocument[] = DOCUMENT_SEEDS.map((d) => ({
    id: uid(),
    legislationId: ids.get(d.legislationKey)!,
    title: d.title,
    kind: d.kind,
    edition: d.edition,
    publicationDate: d.publicationDate,
    pages: d.pages,
    officialUrl: d.officialUrl,
    fileUrl: d.fileUrl,
    fileName: d.fileName,
    sha256: d.sha256,
    sizeBytes: d.sizeBytes,
    downloadedAt: d.downloadedAt,
    status: d.status,
    notes: d.notes,
    active: true,
  }))
  return { legislations, annexes, documents }
}

export function createDemoSimulationData(licenseTypes: readonly LicenseType[]): SimulationData {
  const riskClassifications = createRiskClassifications()
  const cls = (code: string) => riskClassifications.find((c) => c.code === code)!
  const A = cls('baixo_risco_a')
  const B = cls('baixo_risco_b')
  const ALTO = cls('alto_risco')
  const informed = createInformedLegislation()

  const question = (code: string, text: string, type: RuleQuestion['type'], unit: string | null = null): RuleQuestion => ({
    id: uid(),
    code,
    text,
    type,
    unit,
    options: [],
    helpText: 'Pergunta de exemplo (demonstração).',
    active: true,
  })
  const seedQuestions = createSeedQuestions()
  const area = seedQuestions.find((q) => q.code === 'area_m2')!
  const residencia = question('exercida_em_residencia', 'A atividade é exercida em residência?', 'sim_nao')
  const armazenamento = question('armazena_produto', 'Existe armazenamento de determinado produto? (exemplo)', 'sim_nao')

  const fictitious = (number: string, year: number, title: string, extra: Partial<Legislation> = {}): Legislation => ({
    id: uid(),
    kind: 'decreto',
    number,
    year,
    title,
    issuingBody: 'Demonstração',
    level: 'municipal',
    uf: 'PI',
    city: DEMO_CITY,
    definesGeneralClassification: true,
    officialUrl: null,
    notes: 'Norma fictícia criada apenas para demonstrar o funcionamento do simulador.',
    active: true,
    normDate: null,
    parentLegislationId: null,
    relation: null,
    ...extra,
  })
  const legislation = fictitious('000', 2024, DEMO_NORM_TITLE, { normDate: '2024-01-01' })
  const amendment = fictitious('001', 2025, `${DEMO_NORM_TITLE} — altera o Decreto fictício nº 000/2024`, {
    definesGeneralClassification: false,
    parentLegislationId: legislation.id,
    relation: 'altera',
    normDate: '2025-12-15',
  })

  const annex = (code: string, title: string, kind: LegislationAnnex['kind'], sortOrder: number): LegislationAnnex => ({
    id: uid(),
    legislationId: legislation.id,
    code,
    title,
    kind,
    description: 'Anexo de exemplo (fictício).',
    sortOrder,
    active: true,
  })
  const anexoI = annex('I', 'Classificações (exemplo)', 'classificacao', 1)
  const anexoII = annex('II', 'Baixo Risco A (exemplo)', 'baixo_risco_a', 2)
  const anexoIII = annex('III', 'Classificações por CBO (exemplo)', 'cbo', 3)

  const version = (label: string, validFrom: string, validTo: string | null, amendedByLegislationId: string | null): LegislationVersion => ({
    id: uid(),
    legislationId: legislation.id,
    label,
    validFrom,
    validTo,
    highestRiskPrevails: true,
    sourceUrl: null,
    notes: null,
    active: true,
    amendedByLegislationId,
  })
  const v1 = version('Redação original (exemplo)', '2024-01-01', '2025-12-31', null)
  const v2 = version('Redação dada pelo Decreto fictício nº 001/2025', '2026-01-01', null, amendment.id)

  const condition = (q: RuleQuestion, operator: ConditionOperator, value: ConditionValue): RuleCondition => ({ id: uid(), questionId: q.id, operator, value, description: '' })
  const legalText = (text: string): RuleCondition => ({ id: uid(), questionId: null, operator: 'eq', value: true, description: text })
  const rule = (
    v: LegislationVersion,
    cnaeCode: string | null,
    classification: RiskClassification,
    extra: Partial<Omit<CnaeRule, 'id' | 'legislationVersionId' | 'cnaeCode' | 'classificationId'>> = {},
  ): CnaeRule => ({
    id: uid(),
    legislationVersionId: v.id,
    cnaeCode,
    priority: 1,
    classificationId: classification.id,
    elseClassificationId: null,
    conditions: [],
    article: 'Art. 0 (exemplo)',
    annex: null,
    item: null,
    description: 'Regra fictícia de demonstração.',
    active: true,
    annexId: anexoII.id,
    licenseTypeId: null,
    cboCode: null,
    notes: null,
    sourceDocumentId: null,
    sourcePage: null,
    ...extra,
  })
  const type = (code: string) => licenseTypes.find((t) => t.code === code)
  const vigilancia = type('vigilancia')?.id ?? null
  const ambiental = type('ambiental')?.id ?? null
  const anexoIArea = (v: LegislationVersion, cnaeCode: string, licenseTypeId: string | null, c: RiskClassification): CnaeRule[] =>
    licenseTypeId ? [rule(v, cnaeCode, c, { annexId: anexoI.id, licenseTypeId, priority: 2, description: 'Classificação de área fictícia (exemplo).' })] : []

  const cnaeRules: CnaeRule[] = [
    // Redação original (2024–2025)
    rule(v1, '6911701', B, { annexId: anexoI.id, priority: 2 }),
    rule(v1, '5611201', B, { annexId: anexoI.id, priority: 2 }),
    rule(v1, '2512800', ALTO, { annexId: anexoI.id, priority: 2 }),
    // Redação dada pelo decreto fictício de alteração (2026 em diante)
    rule(v2, '6911701', A),
    rule(v2, '5611201', A, { conditions: [condition(area, 'lte', 200)], notes: 'Observação fictícia de exemplo.' }),
    rule(v2, '5611201', B, { annexId: anexoI.id, priority: 2 }),
    rule(v2, '5611203', A, { conditions: [legalText('Desde que não haja preparo de alimentos no local (texto fictício de exemplo).'), condition(armazenamento, 'eq', false)] }),
    rule(v2, '9609208', A, { conditions: [condition(residencia, 'eq', false)], elseClassificationId: B.id }),
    rule(v2, '1091102', B, { annexId: anexoI.id, priority: 2 }),
    rule(v2, '2512800', ALTO, { annexId: anexoI.id, priority: 2 }),
    ...anexoIArea(v2, '1091102', vigilancia, ALTO),
    ...anexoIArea(v2, '2512800', ambiental, ALTO),
    rule(v2, null, B, { annexId: anexoIII.id, cboCode: '241005', description: 'Regra fictícia por CBO (exemplo).' }),
  ]

  const licenseRules: LicenseRule[] = []
  const effect = (v: LegislationVersion, classification: RiskClassification, code: string, outcome: LicenseOutcome) => {
    const licenseType = type(code)
    if (!licenseType) return
    licenseRules.push({ id: uid(), legislationVersionId: v.id, classificationId: classification.id, licenseTypeId: licenseType.id, outcome, notes: null, active: true })
  }
  for (const v of [v1, v2]) {
    // Baixo Risco A: dispensa municipal (exemplo). Bombeiros sempre em análise separada.
    effect(v, A, 'alvara', 'dispensada')
    effect(v, A, 'vigilancia', 'dispensada')
    effect(v, A, 'ambiental', 'dispensada')
    effect(v, B, 'alvara', 'exigivel')
    effect(v, ALTO, 'alvara', 'exigivel')
    for (const c of [A, B, ALTO]) effect(v, c, 'bombeiros', 'analise_separada')
  }
  // Classificações de área (Anexo I de exemplo): efeito na Vigilância e na Licença Ambiental. Os efeitos valem
  // para a classificação; a classificação geral do CNAE prevalece quando a norma define efeito para ela.
  effect(v2, ALTO, 'vigilancia', 'exigivel')
  effect(v2, ALTO, 'ambiental', 'exigivel')

  return {
    legislations: [...informed.legislations, legislation, amendment],
    legislationVersions: [v1, v2],
    legislationAnnexes: [...informed.annexes, anexoI, anexoII, anexoIII],
    legislationDocuments: informed.documents,
    riskClassifications,
    ruleQuestions: [...seedQuestions, residencia, armazenamento],
    cnaeRules,
    licenseRules,
    simulationRuns: [],
    simulationApplications: [],
    importBatches: [],
  }
}
