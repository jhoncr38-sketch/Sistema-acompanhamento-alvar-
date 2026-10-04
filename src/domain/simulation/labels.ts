import type {
  AnnexKind,
  DocumentKind,
  DocumentStatus,
  AnswerValue,
  ConditionOperator,
  JurisdictionLevel,
  LegislationKind,
  LegislationRelation,
  LicenseOutcome,
  LicenseResultOutcome,
  QuestionType,
  RuleCondition,
  RuleConfidence,
  RuleQuestion,
  SimulationStatus,
} from './types'

export const LEGISLATION_KIND_LABEL: Record<LegislationKind, string> = {
  lei: 'Lei',
  lei_complementar: 'Lei Complementar',
  decreto: 'Decreto',
  resolucao: 'Resolução',
  portaria: 'Portaria',
  instrucao_normativa: 'Instrução Normativa',
  outro: 'Norma',
}

export const LEVEL_LABEL: Record<JurisdictionLevel, string> = {
  municipal: 'Municipal',
  estadual: 'Estadual',
  federal: 'Federal',
}

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  numero: 'Número',
  sim_nao: 'Sim / Não',
  opcoes: 'Opções',
}

export const OPERATOR_SYMBOL: Record<ConditionOperator, string> = {
  lte: '≤',
  lt: '<',
  gte: '≥',
  gt: '>',
  eq: '=',
  neq: '≠',
  in: 'um de',
}

export const OPERATOR_LABEL: Record<ConditionOperator, string> = {
  lte: 'menor ou igual a',
  lt: 'menor que',
  gte: 'maior ou igual a',
  gt: 'maior que',
  eq: 'igual a',
  neq: 'diferente de',
  in: 'um dos valores',
}

export const STATUS_LABEL: Record<Exclude<SimulationStatus, 'classificada'>, string> = {
  condicionada: 'Enquadramento Condicionado',
  necessita_analise: 'Necessita Análise',
  regra_nao_cadastrada: 'Regra Não Cadastrada',
}

export const CONFIDENCE_LABEL: Record<RuleConfidence, { title: string; description: string }> = {
  completa: { title: 'Regra completa', description: 'Todas as condições necessárias foram respondidas.' },
  condicionada: { title: 'Regra condicionada', description: 'Existem condições que precisam ser confirmadas.' },
  nao_cadastrada: { title: 'Regra não cadastrada', description: 'Não existe informação suficiente no banco.' },
}

export const RELATION_LABEL: Record<LegislationRelation, string> = {
  altera: 'Altera',
  revoga: 'Revoga',
  regulamenta: 'Regulamenta',
  consolida: 'Consolida',
}

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  oficial_confirmado: 'Oficial confirmado',
  fonte_secundaria: 'Fonte secundária',
  copia_html: 'Cópia gerada a partir da fonte oficial',
  pendente_conferencia: 'Pendente de conferência',
  nao_localizado: 'Documento oficial não localizado',
}

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  edicao_dom: 'Edição do Diário Oficial',
  extrato: 'Extrato',
  copia_html: 'Cópia de página HTML',
  outro: 'Outro',
}

export const ANNEX_KIND_LABEL: Record<AnnexKind, string> = {
  classificacao: 'Classificações (geral, sanitária, ambiental)',
  baixo_risco_a: 'Baixo Risco A',
  cbo: 'Classificações por CBO',
  outro: 'Outro conteúdo',
}

export const LICENSE_OUTCOME_OPTION_LABEL: Record<LicenseOutcome, string> = {
  dispensada: 'Dispensada',
  exigivel: 'Exigível',
  necessita_analise: 'Necessita análise',
  analise_separada: 'Análise separada',
}

const FEMININE = /^(licença|vigilância|autorização|certidão|inscrição)/i

/** "DISPENSADO" para Alvará/Bombeiros, "DISPENSADA" para Licença… */
export function licenseOutcomeLabel(outcome: LicenseResultOutcome, licenseName: string): string {
  switch (outcome) {
    case 'dispensada':
      return FEMININE.test(licenseName.trim()) ? 'Dispensada' : 'Dispensado'
    case 'exigivel':
      return 'Exigível'
    case 'necessita_analise':
      return 'Necessita análise'
    case 'analise_separada':
      return 'Análise separada'
    case 'sem_regra':
      return 'Regra não cadastrada'
  }
}

/** Ex.: "Decreto Municipal nº 123/2024". */
export function legislationLabel(norm: { kind: LegislationKind; level: JurisdictionLevel; number: string; year: number }): string {
  return `${LEGISLATION_KIND_LABEL[norm.kind]} ${LEVEL_LABEL[norm.level]} nº ${norm.number}/${norm.year}`
}

export function localityLabel(norm: { level: JurisdictionLevel; uf: string | null; city: string | null }): string {
  if (norm.level === 'federal') return 'Brasil'
  if (norm.level === 'estadual') return norm.uf ?? ''
  return `${norm.city ?? ''} – ${norm.uf ?? ''}`
}

export function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}

function optionLabel(question: RuleQuestion, value: string): string {
  return question.options.find((o) => o.value === value)?.label ?? value
}

/** Valor esperado pela condição, em linguagem direta. Ex.: "≤ 200 m²", "Não". */
export function expectedLabel(condition: Pick<RuleCondition, 'operator' | 'value'>, question: RuleQuestion): string {
  const { operator, value } = condition
  if (question.type === 'numero') {
    const unit = question.unit ? ` ${question.unit}` : ''
    return `${OPERATOR_SYMBOL[operator === 'in' ? 'eq' : operator]} ${formatNumber(Number(value))}${unit}`
  }
  if (question.type === 'sim_nao') {
    const expected = operator === 'neq' ? value !== true : value === true
    return expected ? 'Sim' : 'Não'
  }
  const values = (Array.isArray(value) ? value : [String(value)]).map((v) => optionLabel(question, v))
  return operator === 'neq' ? `diferente de ${values.join(' ou ')}` : values.join(' ou ')
}

export function answerLabel(question: RuleQuestion, answer: AnswerValue | null | undefined): string {
  if (answer === null || answer === undefined || answer === '') return 'Não informado'
  if (question.type === 'numero') return `${formatNumber(Number(answer))}${question.unit ? ` ${question.unit}` : ''}`
  if (question.type === 'sim_nao') return answer === true ? 'Sim' : 'Não'
  return optionLabel(question, String(answer))
}

export function conditionText(condition: Pick<RuleCondition, 'operator' | 'value' | 'description'>, question: RuleQuestion): string {
  return condition.description.trim() || `${question.text}: ${expectedLabel(condition, question)}`
}
