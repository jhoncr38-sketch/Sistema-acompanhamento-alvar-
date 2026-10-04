import { formatCnae, formatDate, normalizeCnae } from '../format'
import type { ISODate } from '../types'
import { answerLabel, conditionText, expectedLabel, legislationLabel, licenseOutcomeLabel } from './labels'
import type {
  AnswerSnapshot,
  AnswerValue,
  AreaEvaluation,
  ClassificationRef,
  CnaeNormEvaluation,
  CnaeResult,
  CnaeRule,
  ConditionEvaluation,
  ConditionState,
  LegalBasisSummary,
  Legislation,
  LegislationAnnex,
  LegislationDocument,
  LegislationVersion,
  LicenseContribution,
  LicenseOutcome,
  LicenseResult,
  LicenseResultOutcome,
  LicenseRule,
  NormRef,
  OverallResult,
  PendingNorm,
  QuestionRequest,
  RiskClassification,
  RuleBase,
  RuleCondition,
  RuleQuestion,
  RuleTrace,
  SimulationCnae,
  SimulationInput,
  SimulationResult,
  Suggestion,
} from './types'

/**
 * MOTOR DE REGRAS da Simulação de Licenciamento.
 *
 * Decide exclusivamente com base nas normas, anexos, regras e condições cadastradas (RuleBase).
 * Não há IA, heurística ou presunção: sem regra suficiente o resultado é "Regra não cadastrada",
 * "Enquadramento condicionado" ou "Necessita análise" — nunca dispensa. Funções puras: o mesmo cadastro,
 * as mesmas respostas e a mesma data produzem sempre o mesmo resultado.
 */
export const ENGINE_VERSION = '1.2.0'

export const NO_RULE_MESSAGE =
  'Não foi possível determinar automaticamente o enquadramento com as regras atualmente cadastradas.'

type Answers = SimulationInput['answers']
type Locality = { uf: string; city: string }

export interface ApplicableVersion {
  legislation: Legislation
  version: LegislationVersion
  norm: NormRef
}

export function normalizeLocality(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function isVersionInForce(version: Pick<LegislationVersion, 'active' | 'validFrom' | 'validTo'>, date: ISODate): boolean {
  return version.active && version.validFrom <= date && (version.validTo === null || version.validTo >= date)
}

export function legislationAppliesTo(legislation: Legislation, locality: Locality): boolean {
  if (!legislation.active) return false
  if (legislation.level === 'federal') return true
  if (normalizeLocality(legislation.uf) !== normalizeLocality(locality.uf)) return false
  if (legislation.level === 'estadual') return true
  return normalizeLocality(legislation.city) === normalizeLocality(locality.city)
}

/** Versões ativas de uma mesma norma não podem ter vigências sobrepostas. */
export function findOverlappingVersion(
  versions: readonly LegislationVersion[],
  candidate: Pick<LegislationVersion, 'legislationId' | 'validFrom' | 'validTo' | 'active'> & { id?: string },
): LegislationVersion | null {
  if (!candidate.active) return null
  return (
    versions.find(
      (v) =>
        v.active &&
        v.id !== candidate.id &&
        v.legislationId === candidate.legislationId &&
        v.validFrom <= (candidate.validTo ?? '9999-12-31') &&
        (v.validTo ?? '9999-12-31') >= candidate.validFrom,
    ) ?? null
  )
}

// ----------------------------------------------------------------------------
// Condições transcritas da norma (Sim/Não)
// ----------------------------------------------------------------------------

function normalizeLegalText(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim()
}

/** Chave estável da condição textual: textos iguais (em CNAEs diferentes) compartilham a resposta. */
export function legalTextKey(text: string): string {
  let hash = 5381
  for (const ch of normalizeLegalText(text).toLowerCase()) hash = ((hash << 5) + hash + ch.charCodeAt(0)) | 0
  return `texto:${(hash >>> 0).toString(36)}`
}

export function legalTextQuestion(text: string): RuleQuestion {
  const key = legalTextKey(text)
  return {
    id: key,
    code: key,
    text: normalizeLegalText(text),
    type: 'sim_nao',
    unit: null,
    options: [],
    helpText: 'Condição prevista na norma. Responda “Sim” somente se a atividade atende integralmente a esta condição.',
    active: true,
  }
}

function questionFor(ctx: Context, condition: Pick<RuleCondition, 'questionId' | 'description'>): { question: RuleQuestion; legalText: boolean } | null {
  if (condition.questionId) {
    const question = ctx.questions.get(condition.questionId)
    return question ? { question, legalText: false } : null
  }
  return condition.description.trim() ? { question: legalTextQuestion(condition.description), legalText: true } : null
}

// ----------------------------------------------------------------------------
// Normas aplicáveis
// ----------------------------------------------------------------------------

const LEVEL_ORDER = { municipal: 0, estadual: 1, federal: 2 } as const

/** Normas aplicáveis à localidade, cada uma na versão vigente na data de referência. */
export function selectApplicableVersions(base: RuleBase, locality: Locality, date: ISODate): ApplicableVersion[] {
  const byId = new Map(base.legislations.map((l) => [l.id, l]))
  const result: ApplicableVersion[] = []
  for (const legislation of base.legislations) {
    if (!legislationAppliesTo(legislation, locality)) continue
    for (const version of base.versions) {
      if (version.legislationId !== legislation.id || !isVersionInForce(version, date)) continue
      const amending = version.amendedByLegislationId ? byId.get(version.amendedByLegislationId) : undefined
      result.push({
        legislation,
        version,
        norm: {
          legislationId: legislation.id,
          versionId: version.id,
          kind: legislation.kind,
          number: legislation.number,
          year: legislation.year,
          title: legislation.title,
          issuingBody: legislation.issuingBody,
          level: legislation.level,
          uf: legislation.uf,
          city: legislation.city,
          general: legislation.definesGeneralClassification,
          officialUrl: version.sourceUrl ?? legislation.officialUrl,
          versionLabel: version.label,
          validFrom: version.validFrom,
          validTo: version.validTo,
          highestRiskPrevails: version.highestRiskPrevails,
          normDate: legislation.normDate,
          amendedBy: amending ? { legislationId: amending.id, label: legislationLabel(amending) } : null,
        },
      })
    }
  }
  return result.sort(
    (a, b) =>
      Number(b.norm.general) - Number(a.norm.general) ||
      LEVEL_ORDER[a.norm.level] - LEVEL_ORDER[b.norm.level] ||
      a.norm.year - b.norm.year ||
      a.norm.number.localeCompare(b.norm.number),
  )
}

/**
 * Normas cadastradas para a localidade que deveriam conter regras, mas não têm conteúdo vigente na data
 * (ex.: decreto cadastrado aguardando a importação dos anexos). Normas modificadoras não entram: o efeito
 * delas aparece como nova versão da norma que alteram.
 */
export function findPendingNorms(base: RuleBase, locality: Locality, date: ISODate): PendingNorm[] {
  const pending: PendingNorm[] = []
  for (const legislation of base.legislations) {
    if (!legislationAppliesTo(legislation, locality)) continue
    if (legislation.relation === 'altera' || legislation.relation === 'revoga') continue
    const expectsRules = legislation.definesGeneralClassification || base.annexes.some((a) => a.legislationId === legislation.id && a.active)
    if (!expectsRules) continue
    const version = base.versions.find((v) => v.legislationId === legislation.id && isVersionInForce(v, date))
    if (!version) pending.push({ legislationId: legislation.id, label: legislationLabel(legislation), reason: 'sem_versao_vigente' })
    else if (!base.cnaeRules.some((r) => r.active && r.legislationVersionId === version.id)) {
      pending.push({ legislationId: legislation.id, label: legislationLabel(legislation), reason: 'sem_regras' })
    }
  }
  return pending
}

// ----------------------------------------------------------------------------
// Avaliação
// ----------------------------------------------------------------------------

interface Context {
  classifications: Map<string, RiskClassification>
  questions: Map<string, RuleQuestion>
  annexes: Map<string, LegislationAnnex>
  documents: Map<string, LegislationDocument>
  rulesByVersion: Map<string, CnaeRule[]>
  licenseRulesByVersion: Map<string, LicenseRule[]>
  licenseNames: Map<string, string>
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}

function buildContext(base: RuleBase, licenseTypes: SimulationInput['licenseTypes'] = []): Context {
  return {
    classifications: new Map(base.classifications.map((c) => [c.id, c])),
    questions: new Map(base.questions.map((q) => [q.id, q])),
    annexes: new Map(base.annexes.map((a) => [a.id, a])),
    documents: new Map((base.documents ?? []).map((d) => [d.id, d])),
    rulesByVersion: groupBy(
      base.cnaeRules.filter((r) => r.active && r.cboCode === null),
      (r) => r.legislationVersionId,
    ),
    licenseRulesByVersion: groupBy(
      base.licenseRules.filter((r) => r.active),
      (r) => r.legislationVersionId,
    ),
    licenseNames: new Map(licenseTypes.map((t) => [t.id, t.name])),
  }
}

/**
 * Regras do CNAE na versão, para o enquadramento geral (`licenseTypeId` nulo) ou para uma área/licença.
 * Na falta de regra específica do CNAE, vale a regra padrão da norma (se cadastrada).
 */
function candidateRules(ctx: Context, versionId: string, cnaeCode: string, licenseTypeId: string | null): CnaeRule[] {
  const all = (ctx.rulesByVersion.get(versionId) ?? []).filter((r) => r.licenseTypeId === licenseTypeId)
  const specific = all.filter((r) => r.cnaeCode === cnaeCode)
  const rules = specific.length > 0 ? specific : all.filter((r) => r.cnaeCode === null)
  return [...rules].sort((a, b) => a.priority - b.priority)
}

function toRef(c: RiskClassification): ClassificationRef {
  return { id: c.id, code: c.code, name: c.name, severity: c.severity, tone: c.tone }
}

export function evaluateCondition(
  condition: Pick<RuleCondition, 'operator' | 'value'>,
  question: RuleQuestion,
  answer: AnswerValue | null | undefined,
): ConditionState {
  if (answer === undefined || answer === null || answer === '') return 'pendente'
  const { operator, value } = condition

  if (question.type === 'numero') {
    const a = Number(answer)
    const v = Number(value)
    if (Number.isNaN(a) || Number.isNaN(v)) return 'pendente'
    const met =
      operator === 'lte' ? a <= v : operator === 'lt' ? a < v : operator === 'gte' ? a >= v : operator === 'gt' ? a > v : operator === 'neq' ? a !== v : a === v
    return met ? 'atendida' : 'nao_atendida'
  }

  if (question.type === 'sim_nao') {
    const equal = (answer === true) === (value === true)
    return (operator === 'neq' ? !equal : equal) ? 'atendida' : 'nao_atendida'
  }

  const accepted = (Array.isArray(value) ? value : [value]).map(String)
  const included = accepted.includes(String(answer))
  return (operator === 'neq' ? !included : included) ? 'atendida' : 'nao_atendida'
}

function evaluateRuleConditions(ctx: Context, rule: CnaeRule, answers: Answers): ConditionEvaluation[] {
  return rule.conditions.map((condition) => {
    const resolved = questionFor(ctx, condition)
    if (!resolved) {
      return {
        conditionId: condition.id,
        questionId: condition.questionId ?? '',
        legalText: false,
        questionText: 'Pergunta não encontrada no cadastro',
        description: condition.description,
        expected: '',
        answer: null,
        answerLabel: 'Não informado',
        state: 'pendente' as const,
      }
    }
    const { question, legalText } = resolved
    // Condição textual: atendida quando a resposta é "Sim".
    const effective = legalText ? { operator: 'eq' as const, value: true } : condition
    const answer = answers[question.id] ?? null
    return {
      conditionId: condition.id,
      questionId: question.id,
      legalText,
      questionText: question.text,
      description: legalText ? question.text : conditionText(condition, question),
      expected: legalText ? 'Sim' : expectedLabel(condition, question),
      answer,
      answerLabel: answerLabel(question, answer),
      state: evaluateCondition(effective, question, answer),
    }
  })
}

/** Documento oficial e página de onde a regra foi extraída. */
function sourceOf(ctx: Context, rule: CnaeRule): RuleTrace['source'] {
  const doc = rule.sourceDocumentId ? ctx.documents.get(rule.sourceDocumentId) : undefined
  if (!doc) return null
  return {
    documentId: doc.id,
    label: [doc.title, doc.edition && doc.publicationDate ? `${doc.edition} de ${formatDate(doc.publicationDate)}` : doc.edition].filter(Boolean).join(' — '),
    page: rule.sourcePage,
    url: doc.fileUrl ? `${doc.fileUrl}${rule.sourcePage ? `#page=${rule.sourcePage}` : ''}` : doc.officialUrl,
    status: doc.status,
  }
}

function annexInfo(ctx: Context, rule: CnaeRule): Pick<RuleTrace, 'annexLabel' | 'annexKind'> {
  const annex = rule.annexId ? ctx.annexes.get(rule.annexId) : undefined
  if (annex) return { annexLabel: `Anexo ${annex.code} — ${annex.title}`, annexKind: annex.kind }
  return { annexLabel: rule.annex, annexKind: null }
}

/**
 * Avalia um CNAE sob uma norma (para o enquadramento geral ou para uma área). Regras em ordem de prioridade:
 *  - todas as condições atendidas → classificação da regra;
 *  - alguma condição não atendida → classificação alternativa, se houver; senão, próxima regra
 *    (ex.: Anexo II com condição não atendida → regra do Anexo I);
 *  - condição sem resposta (e nenhuma comprovadamente não atendida) → pendente.
 * Sem regra decisiva → necessita análise. Sem regra alguma → `null`.
 */
function evaluateUnderVersion(ctx: Context, av: ApplicableVersion, cnaeCode: string, answers: Answers, licenseTypeId: string | null): CnaeNormEvaluation | null {
  const traces: RuleTrace[] = []
  let classification: ClassificationRef | null = null
  let decidingRuleId: string | null = null
  let pending = false
  let reason = ''

  for (const rule of candidateRules(ctx, av.version.id, cnaeCode, licenseTypeId)) {
    const main = ctx.classifications.get(rule.classificationId)
    if (!main) continue
    const alternative = rule.elseClassificationId ? ctx.classifications.get(rule.elseClassificationId) : undefined
    const conditions = evaluateRuleConditions(ctx, rule, answers)
    const trace: Omit<RuleTrace, 'state'> = {
      ruleId: rule.id,
      priority: rule.priority,
      isDefault: rule.cnaeCode === null,
      classification: toRef(main),
      elseClassification: alternative ? toRef(alternative) : null,
      article: rule.article,
      annex: rule.annex,
      item: rule.item,
      description: rule.description,
      conditions,
      notes: rule.notes,
      ...annexInfo(ctx, rule),
      source: sourceOf(ctx, rule),
    }

    if (conditions.every((c) => c.state === 'atendida')) {
      traces.push({ ...trace, state: 'aplicada' })
      classification = toRef(main)
      decidingRuleId = rule.id
      reason = conditions.length > 0 ? 'Todas as condições da regra foram atendidas.' : 'Regra cadastrada sem condições.'
      break
    }
    if (conditions.some((c) => c.state === 'nao_atendida')) {
      if (alternative) {
        traces.push({ ...trace, state: 'alternativa' })
        classification = toRef(alternative)
        decidingRuleId = rule.id
        reason = 'Condição não atendida: aplicada a classificação alternativa prevista na regra.'
        break
      }
      traces.push({ ...trace, state: 'nao_atendida' })
      continue
    }
    traces.push({ ...trace, state: 'pendente' })
    pending = true
    reason = 'Existem condições previstas na legislação que ainda não foram respondidas.'
    break
  }

  if (traces.length === 0) return null
  if (!classification && !pending) {
    reason = 'As condições cadastradas não foram atendidas e a regra não define classificação alternativa.'
  }
  return {
    norm: av.norm,
    status: classification ? 'classificada' : 'necessita_analise',
    classification,
    pending,
    reason,
    decidingRuleId,
    rules: traces,
  }
}

function pendingClassification(evaluation: CnaeNormEvaluation): ClassificationRef | null {
  return evaluation.rules.find((r) => r.state === 'pendente')?.classification ?? null
}

function evaluateCnae(ctx: Context, applicable: ApplicableVersion[], cnae: SimulationCnae, answers: Answers): CnaeResult {
  const evaluations: CnaeNormEvaluation[] = []
  const areaEvaluations: AreaEvaluation[] = []
  for (const av of applicable) {
    const evaluation = evaluateUnderVersion(ctx, av, cnae.code, answers, null)
    if (evaluation) evaluations.push(evaluation)
    const areaLicenses = new Set((ctx.rulesByVersion.get(av.version.id) ?? []).flatMap((r) => (r.licenseTypeId ? [r.licenseTypeId] : [])))
    for (const licenseTypeId of areaLicenses) {
      const areaEvaluation = evaluateUnderVersion(ctx, av, cnae.code, answers, licenseTypeId)
      if (areaEvaluation) areaEvaluations.push({ licenseTypeId, licenseName: ctx.licenseNames.get(licenseTypeId) ?? 'Licença', evaluation: areaEvaluation })
    }
  }
  const general = evaluations.filter((e) => e.norm.general)
  const base = { code: cnae.code, description: cnae.description, primary: cnae.primary, evaluations, areaEvaluations, conditionalClassification: null }

  if (general.length === 0) {
    return {
      ...base,
      status: 'regra_nao_cadastrada',
      classification: null,
      reason: 'Não há regra de enquadramento cadastrada para este CNAE na localidade e data informadas.',
    }
  }
  const undecided = general.filter((e) => e.status !== 'classificada')
  if (undecided.length > 0) {
    if (undecided.every((e) => e.pending)) {
      return { ...base, status: 'condicionada', classification: null, conditionalClassification: pendingClassification(undecided[0]!), reason: undecided[0]!.reason }
    }
    return { ...base, status: 'necessita_analise', classification: null, reason: undecided.find((e) => !e.pending)!.reason }
  }

  const distinct = new Set(general.map((e) => e.classification?.id))
  if (distinct.size > 1) {
    const detail = general.map((e) => `${legislationLabel(e.norm)}: ${e.classification?.name}`).join('; ')
    return { ...base, status: 'necessita_analise', classification: null, reason: `As normas cadastradas divergem para este CNAE (${detail}).` }
  }
  const first = general[0]!
  return { ...base, status: 'classificada', classification: first.classification, reason: first.reason }
}

function listCodes(codes: readonly string[]): string {
  return [...new Set(codes)].map(formatCnae).join(', ')
}

function maxSeverity(list: readonly ClassificationRef[]): ClassificationRef | null {
  return list.reduce<ClassificationRef | null>((max, c) => (!max || c.severity > max.severity ? c : max), null)
}

function highestRiskPrevailsFor(cnaes: readonly CnaeResult[]): boolean {
  return cnaes.every((c) => c.evaluations.filter((e) => e.norm.general).every((e) => e.norm.highestRiskPrevails))
}

function evaluateOverall(cnaes: CnaeResult[]): OverallResult {
  const noRule = cnaes.filter((c) => c.status === 'regra_nao_cadastrada')
  const analysis = cnaes.filter((c) => c.status === 'necessita_analise')
  const conditional = cnaes.filter((c) => c.status === 'condicionada')
  const classified = cnaes.filter((c): c is CnaeResult & { classification: ClassificationRef } => c.status === 'classificada' && c.classification !== null)
  const pending = cnaes.some((c) => c.evaluations.some((e) => e.pending))
  const confidence = noRule.length > 0 || cnaes.length === 0 ? 'nao_cadastrada' : pending ? 'condicionada' : 'completa'
  const highest = maxSeverity(classified.map((c) => c.classification))
  const lowest = classified.reduce<ClassificationRef | null>((min, c) => (!min || c.classification.severity < min.severity ? c.classification : min), null)
  const empty = { partialHighest: null, conditionalClassification: null }

  if (noRule.length > 0 || cnaes.length === 0) {
    const explanation = noRule.length > 0 ? [`Sem regra de enquadramento cadastrada para: ${listCodes(noRule.map((c) => c.code))}.`] : []
    if (analysis.length + conditional.length > 0) explanation.push(`Dependem de análise ou de condições: ${listCodes([...analysis, ...conditional].map((c) => c.code))}.`)
    return { ...empty, status: 'regra_nao_cadastrada', classification: null, confidence, headline: NO_RULE_MESSAGE, explanation, drivers: noRule.map((c) => c.code), partialHighest: highest }
  }

  if (analysis.length > 0) {
    return {
      ...empty,
      status: 'necessita_analise',
      classification: null,
      confidence,
      headline: 'As regras cadastradas indicam necessidade de análise para concluir o enquadramento.',
      explanation: [...analysis, ...conditional].map((c) => `CNAE ${formatCnae(c.code)}: ${c.reason}`),
      drivers: analysis.map((c) => c.code),
      partialHighest: highest,
    }
  }

  if (conditional.length > 0) {
    const potential = [...classified.map((c) => c.classification), ...conditional.flatMap((c) => (c.conditionalClassification ? [c.conditionalClassification] : []))]
    const allSame = potential.length === cnaes.length && new Set(potential.map((p) => p.id)).size === 1
    const target = allSame ? potential[0]! : potential.length === cnaes.length && highestRiskPrevailsFor(cnaes) ? maxSeverity(potential) : null
    const subject = cnaes.length === 1 ? 'Esta atividade pode ser classificada' : 'As atividades informadas podem ser classificadas'
    return {
      status: 'condicionada',
      classification: null,
      confidence,
      headline: target
        ? `${subject} como ${target.name} desde que as condições previstas na legislação sejam atendidas.`
        : 'O enquadramento depende de condições previstas na legislação que ainda precisam ser confirmadas.',
      explanation: conditional.map((c) => `CNAE ${formatCnae(c.code)}: aguardando resposta às condições${c.conditionalClassification ? ` para ${c.conditionalClassification.name}` : ''}.`),
      drivers: conditional.map((c) => c.code),
      partialHighest: highest,
      conditionalClassification: target,
    }
  }

  const distinct = new Set(classified.map((c) => c.classification.id))
  if (distinct.size === 1 && highest) {
    return {
      ...empty,
      status: 'classificada',
      classification: highest,
      confidence,
      headline:
        cnaes.length === 1 ? `O CNAE informado enquadra-se como ${highest.name}.` : `Todos os CNAEs informados enquadram-se como ${highest.name}.`,
      explanation: [],
      drivers: [],
    }
  }

  const perCnae = classified.map((c) => `CNAE ${formatCnae(c.code)}: ${c.classification.name}`)
  if (!highestRiskPrevailsFor(cnaes) || !highest || !lowest) {
    return {
      ...empty,
      status: 'necessita_analise',
      classification: null,
      confidence,
      headline: 'Os CNAEs informados têm classificações diferentes e a legislação cadastrada não define como combiná-las.',
      explanation: perCnae,
      drivers: classified.filter((c) => c.classification.id !== lowest?.id).map((c) => c.code),
      partialHighest: highest,
    }
  }

  const drivers = classified.filter((c) => c.classification.id === highest.id).map((c) => c.code)
  return {
    ...empty,
    status: 'classificada',
    classification: highest,
    confidence,
    headline: `A empresa não atende integralmente aos critérios de ${lowest.name}.`,
    explanation: [
      `Enquadramento geral: ${highest.name}, definido pelo CNAE ${listCodes(drivers)}.`,
      'A legislação cadastrada determina que a atividade de maior risco define o enquadramento geral.',
      ...perCnae,
    ],
    drivers,
  }
}

function aggregateLicenseOutcome(contributions: LicenseContribution[], uncovered: string[]): LicenseResultOutcome {
  const outcomes = new Set(contributions.map((c) => c.outcome))
  if (outcomes.has('exigivel')) return 'exigivel'
  if (outcomes.has('necessita_analise')) return 'necessita_analise'
  if (contributions.length === 0) return 'sem_regra'
  if (uncovered.length > 0) return 'necessita_analise'
  if (outcomes.has('analise_separada')) return 'analise_separada'
  return 'dispensada'
}

function licenseSummary(outcome: LicenseResultOutcome, contributions: LicenseContribution[], uncovered: string[], agency: string, cnaeCount: number): string {
  const codesWith = (o: LicenseContribution['outcome']) => listCodes(contributions.filter((c) => c.outcome === o).map((c) => c.cnaeCode))
  switch (outcome) {
    case 'exigivel':
      return `Exigível em razão do CNAE ${codesWith('exigivel')}.`
    case 'dispensada':
      return cnaeCount === 1
        ? 'Dispensa prevista para o CNAE informado, conforme a regra cadastrada.'
        : 'Dispensa prevista para todos os CNAEs informados, conforme as regras cadastradas.'
    case 'analise_separada':
      return `A norma cadastrada indica análise separada pelo órgão competente (${agency}).`
    case 'sem_regra':
      return 'Não existe regra cadastrada para esta licença na localidade e data informadas.'
    case 'necessita_analise': {
      const parts: string[] = []
      const waiting = listCodes(contributions.filter((c) => c.outcome === 'necessita_analise' && c.pending).map((c) => c.cnaeCode))
      const analysis = listCodes(contributions.filter((c) => c.outcome === 'necessita_analise' && !c.pending).map((c) => c.cnaeCode))
      if (waiting) parts.push(`Aguardando resposta às condições do CNAE ${waiting}.`)
      if (analysis) parts.push(`Necessita análise para o CNAE ${analysis}.`)
      if (uncovered.length > 0) parts.push(`Sem regra cadastrada desta licença para o CNAE ${listCodes(uncovered)}.`)
      return parts.join(' ')
    }
  }
}

/**
 * Resultado por licença. Uma licença só é dispensada/exigível quando alguma norma cadastrada define esse
 * efeito para ela: a dispensa de um órgão nunca é estendida a outro.
 *
 * Em cada versão de norma: vale o efeito definido para a classificação GERAL do CNAE; se a norma não define
 * efeito para ela nesta licença, vale a classificação ESPECÍFICA da área (ex.: risco sanitário do Anexo I).
 */
function evaluateLicenses(ctx: Context, applicable: ApplicableVersion[], cnaes: CnaeResult[], input: SimulationInput): LicenseResult[] {
  const byLicense = new Map<string, LicenseContribution[]>()
  const governed = new Set<string>()
  for (const av of applicable) {
    for (const rule of ctx.licenseRulesByVersion.get(av.version.id) ?? []) governed.add(rule.licenseTypeId)
  }
  const add = (licenseTypeId: string, contribution: LicenseContribution) => {
    const list = byLicense.get(licenseTypeId)
    if (list) list.push(contribution)
    else byLicense.set(licenseTypeId, [contribution])
  }
  const effect = (versionId: string, classificationId: string, licenseTypeId: string): LicenseRule | undefined =>
    (ctx.licenseRulesByVersion.get(versionId) ?? []).find((r) => r.classificationId === classificationId && r.licenseTypeId === licenseTypeId)

  for (const cnae of cnaes) {
    const versions = new Set([...cnae.evaluations.map((e) => e.norm.versionId), ...cnae.areaEvaluations.map((a) => a.evaluation.norm.versionId)])
    for (const versionId of versions) {
      const general = cnae.evaluations.find((e) => e.norm.versionId === versionId)
      const licenses = new Set([
        ...(ctx.licenseRulesByVersion.get(versionId) ?? []).map((r) => r.licenseTypeId),
        ...cnae.areaEvaluations.filter((a) => a.evaluation.norm.versionId === versionId).map((a) => a.licenseTypeId),
      ])
      for (const licenseTypeId of licenses) {
        const area = cnae.areaEvaluations.find((a) => a.licenseTypeId === licenseTypeId && a.evaluation.norm.versionId === versionId)?.evaluation
        // CNAE só com classificação de outra área nesta norma: a norma nada diz sobre esta licença para ele.
        if (!general && !area) continue
        const norm = (general ?? area)!.norm
        const contribution = (outcome: LicenseOutcome, classification: ClassificationRef | null, reason: string, fromArea: boolean, pending = false) =>
          add(licenseTypeId, { cnaeCode: cnae.code, norm, outcome, classification, reason, fromArea, pending })

        const generalEffect = general?.status === 'classificada' && general.classification ? effect(versionId, general.classification.id, licenseTypeId) : undefined
        if (generalEffect && general?.classification) {
          contribution(generalEffect.outcome, general.classification, generalEffect.notes?.trim() || `Efeito previsto para ${general.classification.name}.`, false)
        } else if (area) {
          if (area.status === 'classificada' && area.classification) {
            const areaEffect = effect(versionId, area.classification.id, licenseTypeId)
            if (areaEffect) contribution(areaEffect.outcome, area.classification, areaEffect.notes?.trim() || `Classificação específica da área: ${area.classification.name}.`, true)
            else contribution('necessita_analise', area.classification, `A classificação ${area.classification.name} não tem efeito cadastrado para esta licença.`, true)
          } else {
            contribution('necessita_analise', null, area.reason, true, area.pending)
          }
        } else if (general && general.status !== 'classificada' && (ctx.licenseRulesByVersion.get(versionId) ?? []).some((r) => r.licenseTypeId === licenseTypeId)) {
          contribution('necessita_analise', null, general.reason, false, general.pending)
        }
      }
    }
  }

  return input.licenseTypes
    .filter((t) => input.coreLicenseCodes.includes(t.code) || governed.has(t.id) || byLicense.has(t.id))
    .map((type) => {
      const contributions = byLicense.get(type.id) ?? []
      const covered = new Set(contributions.map((c) => c.cnaeCode))
      const uncovered = cnaes.filter((c) => !covered.has(c.code)).map((c) => c.code)
      const outcome = aggregateLicenseOutcome(contributions, uncovered)
      return {
        licenseTypeId: type.id,
        code: type.code,
        name: type.name,
        shortName: type.shortName,
        agency: type.agency,
        outcome,
        summary: licenseSummary(outcome, contributions, uncovered, type.agency, cnaes.length),
        contributions,
        uncoveredCnaes: contributions.length > 0 ? uncovered : [],
      }
    })
}

/** Sugestões derivadas estritamente dos resultados das regras. */
function buildSuggestions(overall: OverallResult, licenses: LicenseResult[], cnaes: CnaeResult[]): Suggestion[] {
  const suggestions: Suggestion[] = []
  for (const license of licenses) {
    switch (license.outcome) {
      case 'dispensada': {
        const norms = [...new Set(license.contributions.map((c) => legislationLabel(c.norm)))].join('; ')
        suggestions.push({ tone: 'ok', text: `Atividade potencialmente dispensada de ${license.name} conforme regra cadastrada (${norms}).` })
        break
      }
      case 'exigivel':
        suggestions.push({ tone: 'warn', text: `${license.name}: exigível. Incluir no monitoramento de licenças.` })
        break
      case 'necessita_analise':
        suggestions.push({ tone: 'warn', text: `${license.name} necessita análise adicional.` })
        break
      case 'analise_separada':
        suggestions.push({ tone: 'warn', text: `Verificar ${license.name} (${license.agency}) separadamente.` })
        break
      case 'sem_regra':
        suggestions.push({ tone: 'warn', text: `Não existe regra cadastrada para ${license.name}.` })
        break
    }
  }
  if (licenses.some((l) => l.outcome === 'dispensada')) {
    suggestions.push({ tone: 'ok', text: 'Registrar o fundamento da dispensa no cadastro da empresa.' })
  }
  if (overall.status === 'classificada' && overall.drivers.length > 0) {
    const secondary = cnaes.filter((c) => !c.primary && overall.drivers.includes(c.code))
    if (secondary.length > 0) {
      suggestions.push({ tone: 'warn', text: `Existe CNAE secundário que altera o enquadramento: ${listCodes(secondary.map((c) => c.code))}.` })
    }
  }
  for (const cnae of cnaes) {
    if (cnae.status === 'regra_nao_cadastrada') {
      suggestions.push({ tone: 'warn', text: `CNAE ${formatCnae(cnae.code)} sem regra de enquadramento cadastrada.` })
    }
  }
  if (cnaes.some((c) => c.evaluations.some((e) => e.pending) || c.areaEvaluations.some((a) => a.evaluation.pending))) {
    suggestions.push({
      tone: 'warn',
      text: overall.conditionalClassification
        ? `Responder às condições previstas na legislação para confirmar o enquadramento como ${overall.conditionalClassification.name}.`
        : 'Responder às condições pendentes para concluir o enquadramento.',
    })
  }
  return suggestions
}

function versionDescription(norm: NormRef): string {
  const validity = `vigência ${formatDate(norm.validFrom)} a ${norm.validTo ? formatDate(norm.validTo) : 'atualmente'}`
  return `${legislationLabel(norm)}, versão “${norm.versionLabel}” (${validity})${norm.amendedBy ? `, com a redação dada pelo ${norm.amendedBy.label}` : ''}`
}

function explainEvaluation(evaluation: CnaeNormEvaluation): string {
  const decisive = evaluation.rules.find((r) => r.ruleId === evaluation.decidingRuleId) ?? evaluation.rules.at(-1)
  if (!decisive) return evaluation.reason
  const where = decisive.isDefault ? 'regra padrão da norma' : decisive.annexLabel ? `consta no ${decisive.annexLabel}` : `regra ${decisive.priority}`
  const skipped = evaluation.rules.filter((r) => r.state === 'nao_atendida' && r.ruleId !== decisive.ruleId)
  const skippedText = skipped.length > 0 ? ` (antes: ${skipped.map((r) => `${r.annexLabel ?? `regra ${r.priority}`} com condição não atendida`).join('; ')})` : ''
  const conditions = decisive.conditions.length > 0 ? `, condição: ${decisive.conditions.map((c) => `«${c.description}» — ${c.state === 'atendida' ? 'atendida' : c.state === 'nao_atendida' ? 'não atendida' : 'sem resposta'} (resposta: ${c.answerLabel})`).join('; ')}` : ', sem condições'
  const source = decisive.source
    ? ` Fonte: ${decisive.source.label}${decisive.source.page ? `, pág. ${decisive.source.page}` : ''}.`
    : ' Regra sem documento-fonte vinculado: NECESSITA REVISÃO.'
  switch (decisive.state) {
    case 'aplicada':
      return `${where}${conditions}${skippedText} → ${decisive.classification.name}.${source}`
    case 'alternativa':
      return `${where}${conditions}${skippedText} → classificação alternativa ${decisive.elseClassification?.name}.${source}`
    case 'pendente':
      return `${where}${conditions}${skippedText} → enquadramento condicionado a ${decisive.classification.name}.${source}`
    case 'nao_atendida':
      return `${where}${conditions} → nenhuma regra seguinte define a classificação; necessita análise.${source}`
  }
}

/** Explicação objetiva, passo a passo, de como o motor chegou ao resultado (fica no histórico). */
function buildJustification(input: SimulationInput, applicable: ApplicableVersion[], pendingNorms: PendingNorm[], cnaes: CnaeResult[], overall: OverallResult, licenses: LicenseResult[]): string[] {
  const lines: string[] = [`Localidade: ${input.city} – ${input.uf}. Data de referência: ${formatDate(input.referenceDate)}.`]
  const used = new Set(cnaes.flatMap((c) => [...c.evaluations.map((e) => e.norm.versionId), ...c.areaEvaluations.map((a) => a.evaluation.norm.versionId)]))
  const usedNorms = applicable.filter((av) => used.has(av.version.id))
  if (usedNorms.length === 0) lines.push('Nenhuma regra cadastrada e vigente na data se aplica aos CNAEs informados nesta localidade.')
  for (const av of usedNorms) lines.push(`Legislação aplicada: ${versionDescription(av.norm)}.`)
  for (const p of pendingNorms) {
    lines.push(`${p.label}: cadastrada, mas ${p.reason === 'sem_versao_vigente' ? 'sem versão vigente na data' : 'sem regras cadastradas'} — não foi usada.`)
  }
  for (const cnae of cnaes) {
    const head = `CNAE ${formatCnae(cnae.code)}${cnae.description ? ` (${cnae.description})` : ''}${cnae.primary ? ' — principal' : ''}`
    const general = cnae.evaluations.filter((e) => e.norm.general)
    if (general.length === 0) lines.push(`${head}: não consta nas regras de enquadramento cadastradas → regra não cadastrada.`)
    for (const e of general) lines.push(`${head}: ${explainEvaluation(e)}`)
    for (const a of cnae.areaEvaluations) lines.push(`${head} — ${a.licenseName}: ${explainEvaluation(a.evaluation)}`)
  }
  if (cnaes.length > 1 && overall.status === 'classificada' && overall.drivers.length > 0) {
    lines.push(`Classificações diferentes entre os CNAEs; a norma determina que a atividade de maior risco prevalece → ${overall.classification?.name} (CNAE ${listCodes(overall.drivers)}).`)
  }
  lines.push(
    `Resultado geral: ${overall.status === 'classificada' ? overall.classification?.name : overall.status === 'condicionada' ? 'enquadramento condicionado' : overall.status === 'necessita_analise' ? 'necessita análise' : 'regra não cadastrada'}.`,
  )
  for (const license of licenses) lines.push(`${license.name}: ${licenseOutcomeLabel(license.outcome, license.name)} — ${license.summary}`)
  return lines
}

function buildLegalBasis(base: RuleBase, input: SimulationInput, norms: NormRef[]): LegalBasisSummary {
  const label = (n: NormRef) => `${legislationLabel(n)} (${n.versionLabel})`
  const byId = new Map(base.legislations.map((l) => [l.id, l]))
  // Toda redação incorporada até a versão usada (ex.: 25.363/2023 e depois 28.436/2025), em ordem de vigência.
  const amendments = norms.flatMap((n) =>
    base.versions
      .filter((v) => v.legislationId === n.legislationId && v.active && v.amendedByLegislationId && v.validFrom <= n.validFrom)
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom))
      .flatMap((v) => {
        const amending = byId.get(v.amendedByLegislationId!)
        return amending ? [`${legislationLabel(amending)} (altera o ${legislationLabel(n)}; vigência desde ${formatDate(v.validFrom)})`] : []
      }),
  )
  return {
    locality: `${input.city} – ${input.uf}`,
    baseNorms: norms.filter((n) => n.general).map(label),
    amendments: [...new Set(amendments)],
    otherNorms: norms.filter((n) => !n.general).map(label),
    referenceDate: input.referenceDate,
  }
}

export function normalizeSimulationCnaes(cnaes: readonly SimulationCnae[]): SimulationCnae[] {
  const seen = new Set<string>()
  const list: SimulationCnae[] = []
  for (const cnae of cnaes) {
    const code = normalizeCnae(cnae.code)
    if (code.length !== 7 || seen.has(code)) continue
    seen.add(code)
    list.push({ ...cnae, code })
  }
  if (list.length > 0 && !list.some((c) => c.primary)) list[0] = { ...list[0]!, primary: true }
  return list
}

/** Perguntas necessárias: somente as que constam em condições das regras aplicáveis (cadastradas ou transcritas da norma). */
export function collectQuestions(base: RuleBase, input: Pick<SimulationInput, 'cnaes' | 'uf' | 'city' | 'referenceDate'>): QuestionRequest[] {
  const ctx = buildContext(base)
  const applicable = selectApplicableVersions(base, input, input.referenceDate)
  const requests = new Map<string, QuestionRequest>()
  for (const cnae of normalizeSimulationCnaes(input.cnaes)) {
    for (const av of applicable) {
      const areas = new Set<string | null>([null, ...(ctx.rulesByVersion.get(av.version.id) ?? []).flatMap((r) => (r.licenseTypeId ? [r.licenseTypeId] : []))])
      for (const area of areas) {
        for (const rule of candidateRules(ctx, av.version.id, cnae.code, area)) {
          for (const condition of rule.conditions) {
            const resolved = questionFor(ctx, condition)
            if (!resolved) continue
            const request = requests.get(resolved.question.id)
            if (!request) requests.set(resolved.question.id, { question: resolved.question, usedBy: [cnae.code], legalText: resolved.legalText })
            else if (!request.usedBy.includes(cnae.code)) request.usedBy.push(cnae.code)
          }
        }
      }
    }
  }
  return [...requests.values()]
}

export function runSimulation(base: RuleBase, input: SimulationInput): SimulationResult {
  const ctx = buildContext(base, input.licenseTypes)
  const cnaes = normalizeSimulationCnaes(input.cnaes)
  const applicable = selectApplicableVersions(base, input, input.referenceDate)
  const cnaeResults = cnaes.map((cnae) => evaluateCnae(ctx, applicable, cnae, input.answers))
  const overall = evaluateOverall(cnaeResults)
  const licenses = evaluateLicenses(ctx, applicable, cnaeResults, input)
  const pendingNorms = findPendingNorms(base, input, input.referenceDate)

  const usedVersions = new Set(cnaeResults.flatMap((c) => [...c.evaluations.map((e) => e.norm.versionId), ...c.areaEvaluations.map((a) => a.evaluation.norm.versionId)]))
  const norms = applicable.filter((av) => usedVersions.has(av.version.id)).map((av) => av.norm)
  const answers: AnswerSnapshot[] = collectQuestions(base, { ...input, cnaes }).map(({ question, usedBy }) => {
    const answer = input.answers[question.id] ?? null
    return { questionId: question.id, code: question.code, text: question.text, unit: question.unit, answer, answerLabel: answerLabel(question, answer), usedBy }
  })

  return {
    engineVersion: ENGINE_VERSION,
    uf: input.uf,
    city: input.city,
    referenceDate: input.referenceDate,
    overall,
    licenses,
    cnaes: cnaeResults,
    norms,
    answers,
    suggestions: buildSuggestions(overall, licenses, cnaeResults),
    justification: buildJustification(input, applicable, pendingNorms, cnaeResults, overall, licenses),
    legalBasis: buildLegalBasis(base, input, norms),
    pendingNorms,
  }
}

