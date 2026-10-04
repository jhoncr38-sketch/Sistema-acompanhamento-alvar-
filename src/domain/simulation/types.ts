import type { ISODate, ISODateTime, UUID } from '../types'

export type JurisdictionLevel = 'municipal' | 'estadual' | 'federal'
export type LegislationKind = 'lei' | 'lei_complementar' | 'decreto' | 'resolucao' | 'portaria' | 'instrucao_normativa' | 'outro'
export type ClassificationTone = 'green' | 'blue' | 'orange' | 'red' | 'yellow' | 'gray'
export type QuestionType = 'numero' | 'sim_nao' | 'opcoes'
export type ConditionOperator = 'lte' | 'lt' | 'gte' | 'gt' | 'eq' | 'neq' | 'in'
export type AnswerValue = number | boolean | string
export type ConditionValue = number | boolean | string | string[]
/** Efeito de uma classificação sobre uma licença, definido pela norma. */
export type LicenseOutcome = 'dispensada' | 'exigivel' | 'necessita_analise' | 'analise_separada'
/** Resultado exibido por licença. `sem_regra` = nenhuma norma cadastrada trata da licença. */
export type LicenseResultOutcome = LicenseOutcome | 'sem_regra'
/** `condicionada`: há regra para o enquadramento, mas faltam respostas às condições previstas na norma. */
export type SimulationStatus = 'classificada' | 'condicionada' | 'necessita_analise' | 'regra_nao_cadastrada'
/** Relação de uma norma com a norma principal (ex.: decreto que altera outro decreto). */
export type LegislationRelation = 'altera' | 'revoga' | 'regulamenta' | 'consolida'
/** Tipo de conteúdo do anexo: classificações gerais/sanitárias/ambientais, Baixo Risco A, CBO… */
export type AnnexKind = 'classificacao' | 'baixo_risco_a' | 'cbo' | 'outro'
/** Qualidade objetiva dos dados usados (não é "confiança de IA"). */
export type RuleConfidence = 'completa' | 'condicionada' | 'nao_cadastrada'
export type ConditionState = 'atendida' | 'nao_atendida' | 'pendente'

// ----------------------------------------------------------------------------
// Cadastro (base de regras)
// ----------------------------------------------------------------------------

export interface Legislation {
  id: UUID
  kind: LegislationKind
  number: string
  year: number
  title: string
  issuingBody: string
  level: JurisdictionLevel
  uf: string | null
  city: string | null
  /** true: define o enquadramento geral da atividade. false: norma de um órgão/licença específica. */
  definesGeneralClassification: boolean
  officialUrl: string | null
  notes: string | null
  active: boolean
  /** Data da norma (assinatura/publicação), quando conhecida. */
  normDate: ISODate | null
  /** Norma à qual esta se relaciona (ex.: o decreto que ela altera). */
  parentLegislationId: UUID | null
  relation: LegislationRelation | null
}

/** Anexo de uma norma. As regras por CNAE apontam para o anexo de onde vieram. */
export interface LegislationAnnex {
  id: UUID
  legislationId: UUID
  code: string
  title: string
  kind: AnnexKind
  description: string | null
  sortOrder: number
  active: boolean
}

export type DocumentStatus = 'oficial_confirmado' | 'fonte_secundaria' | 'copia_html' | 'pendente_conferencia' | 'nao_localizado'
export type DocumentKind = 'edicao_dom' | 'extrato' | 'copia_html' | 'outro'

/**
 * Documento da biblioteca de legislação (FONTE DOCUMENTAL): o arquivo original preservado, com a origem e o hash.
 * As regras (FONTE OPERACIONAL) apontam para o documento e a página de onde vieram.
 */
export interface LegislationDocument {
  id: UUID
  legislationId: UUID
  title: string
  kind: DocumentKind
  /** Ex.: "DOM nº 3.609". */
  edition: string | null
  publicationDate: ISODate | null
  /** Páginas da norma dentro do documento (ex.: "3–19"). */
  pages: string | null
  officialUrl: string | null
  /** Endereço do arquivo preservado (biblioteca do sistema ou armazenamento). */
  fileUrl: string | null
  fileName: string | null
  sha256: string | null
  sizeBytes: number | null
  downloadedAt: ISODate | null
  status: DocumentStatus
  notes: string | null
  active: boolean
}

/** Uma alteração legislativa cria nova versão; a anterior é preservada com sua vigência. */
export interface LegislationVersion {
  id: UUID
  legislationId: UUID
  label: string
  validFrom: ISODate
  validTo: ISODate | null
  /** A norma determina que a atividade de maior risco define o enquadramento geral. */
  highestRiskPrevails: boolean
  sourceUrl: string | null
  notes: string | null
  active: boolean
  /** Norma que deu esta redação (ex.: decreto modificador). `null` = redação original. */
  amendedByLegislationId: UUID | null
}

export interface RiskClassification {
  id: UUID
  code: string
  name: string
  /** Quanto maior, maior o risco. Usado quando "maior risco prevalece". */
  severity: number
  tone: ClassificationTone
  active: boolean
}

export interface QuestionOption {
  value: string
  label: string
}

export interface RuleQuestion {
  id: UUID
  code: string
  text: string
  type: QuestionType
  unit: string | null
  options: QuestionOption[]
  helpText: string | null
  active: boolean
}

/**
 * Condição de uma regra. Com `questionId`, usa uma pergunta cadastrada (área, sim/não, opções).
 * Sem `questionId`, a condição é o próprio texto da norma (`description`): o simulador pergunta
 * se a atividade atende àquele texto (Sim/Não), sem criar ou reescrever perguntas.
 */
export interface RuleCondition {
  id: UUID
  questionId: UUID | null
  operator: ConditionOperator
  value: ConditionValue
  /** Texto da condição como aparece na norma (opcional). */
  description: string
}

export interface CnaeRule {
  id: UUID
  legislationVersionId: UUID
  /** 7 dígitos. `null` = regra padrão da norma (CNAEs sem regra específica). */
  cnaeCode: string | null
  /** Ordem de avaliação entre regras do mesmo CNAE (menor primeiro). */
  priority: number
  /** Classificação quando todas as condições são atendidas (ou quando não há condições). */
  classificationId: UUID
  /** Classificação quando alguma condição não é atendida. `null` = avaliar a próxima regra; sem próxima, necessita análise. */
  elseClassificationId: UUID | null
  conditions: RuleCondition[]
  article: string | null
  annex: string | null
  item: string | null
  description: string
  active: boolean
  /** Anexo cadastrado de onde a regra veio (ex.: Anexo II — Baixo Risco A). */
  annexId: UUID | null
  /**
   * `null` = enquadramento geral da atividade. Preenchido = classificação específica de uma área/licença
   * (ex.: risco sanitário para a Vigilância Sanitária, risco ambiental para a Licença Ambiental — Anexo I).
   */
  licenseTypeId: UUID | null
  /** Código CBO (6 dígitos), para regras do tipo Anexo III. Ainda não usado nas simulações. */
  cboCode: string | null
  /** Observações da norma sobre a atividade. */
  notes: string | null
  /** Documento da biblioteca de onde a regra foi extraída (rastreabilidade obrigatória para dados oficiais). */
  sourceDocumentId: UUID | null
  /** Página do documento. */
  sourcePage: number | null
}

export interface LicenseRule {
  id: UUID
  legislationVersionId: UUID
  classificationId: UUID
  licenseTypeId: UUID
  outcome: LicenseOutcome
  notes: string | null
  active: boolean
}

export interface RuleBase {
  legislations: Legislation[]
  versions: LegislationVersion[]
  annexes: LegislationAnnex[]
  documents: LegislationDocument[]
  classifications: RiskClassification[]
  questions: RuleQuestion[]
  cnaeRules: CnaeRule[]
  licenseRules: LicenseRule[]
}

// ----------------------------------------------------------------------------
// Entrada e resultado do motor
// ----------------------------------------------------------------------------

export interface SimulationCnae {
  code: string
  description: string | null
  primary: boolean
}

export interface LicenseTypeRef {
  id: UUID
  code: string
  name: string
  shortName: string
  agency: string
}

export interface SimulationInput {
  cnaes: SimulationCnae[]
  uf: string
  city: string
  referenceDate: ISODate
  /** Respostas por id da pergunta. Ausente/`null` = não respondida. */
  answers: Record<string, AnswerValue | null | undefined>
  licenseTypes: LicenseTypeRef[]
  /** Códigos das licenças sempre exibidas no resultado, mesmo sem regra cadastrada. */
  coreLicenseCodes: string[]
}

export interface ClassificationRef {
  id: UUID
  code: string
  name: string
  severity: number
  tone: ClassificationTone
}

export interface NormRef {
  legislationId: UUID
  versionId: UUID
  kind: LegislationKind
  number: string
  year: number
  title: string
  issuingBody: string
  level: JurisdictionLevel
  uf: string | null
  city: string | null
  general: boolean
  officialUrl: string | null
  versionLabel: string
  validFrom: ISODate
  validTo: ISODate | null
  highestRiskPrevails: boolean
  normDate: ISODate | null
  /** Norma que deu a redação usada (decreto modificador), quando houver. */
  amendedBy: { legislationId: UUID; label: string } | null
}

export interface ConditionEvaluation {
  conditionId: UUID
  /** Id da pergunta cadastrada ou, para condição textual da norma, a chave `texto:<hash>`. */
  questionId: string
  /** Condição transcrita da norma, respondida com Sim/Não. */
  legalText: boolean
  questionText: string
  description: string
  expected: string
  answer: AnswerValue | null
  answerLabel: string
  state: ConditionState
}

export type RuleTraceState = 'aplicada' | 'alternativa' | 'nao_atendida' | 'pendente'

export interface RuleTrace {
  ruleId: UUID
  priority: number
  isDefault: boolean
  classification: ClassificationRef
  elseClassification: ClassificationRef | null
  article: string | null
  annex: string | null
  item: string | null
  description: string
  conditions: ConditionEvaluation[]
  state: RuleTraceState
  /** Ex.: "Anexo II — Baixo Risco A" (anexo cadastrado) ou o texto do campo anexo. */
  annexLabel: string | null
  annexKind: AnnexKind | null
  notes: string | null
  /** De onde veio a regra: documento oficial e página. `null` = regra sem fonte documental vinculada. */
  source: RuleSource | null
}

export interface RuleSource {
  documentId: UUID
  label: string
  page: number | null
  url: string | null
  status: DocumentStatus
}

/** Avaliação de um CNAE sob uma norma (na versão vigente). */
export interface CnaeNormEvaluation {
  norm: NormRef
  status: 'classificada' | 'necessita_analise'
  classification: ClassificationRef | null
  /** Há condição não respondida. */
  pending: boolean
  reason: string
  decidingRuleId: UUID | null
  rules: RuleTrace[]
}

export interface CnaeResult {
  code: string
  description: string | null
  primary: boolean
  /** Enquadramento geral do CNAE (normas que definem o enquadramento geral). */
  status: SimulationStatus
  classification: ClassificationRef | null
  /** Classificação que a regra aplicará se as condições pendentes forem atendidas. */
  conditionalClassification: ClassificationRef | null
  reason: string
  evaluations: CnaeNormEvaluation[]
  /** Classificações específicas por área/licença (ex.: risco sanitário e ambiental do Anexo I). */
  areaEvaluations: AreaEvaluation[]
}

export interface AreaEvaluation {
  licenseTypeId: UUID
  licenseName: string
  evaluation: CnaeNormEvaluation
}

export interface LicenseContribution {
  cnaeCode: string
  norm: NormRef
  outcome: LicenseOutcome
  classification: ClassificationRef | null
  reason: string
  /** A contribuição veio da classificação específica da área (ex.: risco sanitário), não da geral. */
  fromArea: boolean
  /** Condição da norma ainda sem resposta. */
  pending: boolean
}

export interface LicenseResult {
  licenseTypeId: UUID
  code: string
  name: string
  shortName: string
  agency: string
  outcome: LicenseResultOutcome
  summary: string
  contributions: LicenseContribution[]
  /** CNAEs para os quais nenhuma norma cadastrada trata desta licença. */
  uncoveredCnaes: string[]
}

export interface OverallResult {
  status: SimulationStatus
  classification: ClassificationRef | null
  confidence: RuleConfidence
  headline: string
  explanation: string[]
  /** CNAEs que definiram ou impediram o resultado geral. */
  drivers: string[]
  /** Maior risco entre os CNAEs já enquadrados, quando o geral não pôde ser concluído. */
  partialHighest: ClassificationRef | null
  /** Enquadramento que resultará se as condições pendentes forem atendidas (status `condicionada`). */
  conditionalClassification: ClassificationRef | null
}

/** Norma cadastrada para a localidade, mas sem conteúdo vigente na data (ex.: anexos ainda não importados). */
export interface PendingNorm {
  legislationId: UUID
  label: string
  reason: 'sem_versao_vigente' | 'sem_regras'
}

export interface LegalBasisSummary {
  locality: string
  /** Normas que definiram o enquadramento geral, com a versão usada. */
  baseNorms: string[]
  /** Normas modificadoras cuja redação estava vigente na data e foi usada. */
  amendments: string[]
  /** Normas específicas de órgãos/licenças usadas. */
  otherNorms: string[]
  referenceDate: ISODate
}

export interface AnswerSnapshot {
  questionId: UUID
  code: string
  text: string
  unit: string | null
  answer: AnswerValue | null
  answerLabel: string
  usedBy: string[]
}

export interface Suggestion {
  tone: 'ok' | 'warn'
  text: string
}

export interface SimulationResult {
  engineVersion: string
  uf: string
  city: string
  referenceDate: ISODate
  overall: OverallResult
  licenses: LicenseResult[]
  cnaes: CnaeResult[]
  norms: NormRef[]
  answers: AnswerSnapshot[]
  suggestions: Suggestion[]
  /** Explicação objetiva, passo a passo, de como o motor chegou ao resultado. */
  justification: string[]
  legalBasis: LegalBasisSummary
  pendingNorms: PendingNorm[]
}

export interface QuestionRequest {
  question: RuleQuestion
  /** CNAEs cujas regras usam esta pergunta. */
  usedBy: string[]
  /** Pergunta gerada a partir do texto de uma condição da norma (Sim/Não). */
  legalText: boolean
}

// ----------------------------------------------------------------------------
// Histórico
// ----------------------------------------------------------------------------

export interface SimulationApplication {
  id: UUID
  runId: UUID
  companyId: UUID
  appliedAt: ISODateTime
  appliedByName: string
  changes: AppliedLicenseChange[]
}

export interface AppliedLicenseChange {
  licenseTypeId: UUID
  applicability: 'aplicavel' | 'dispensada' | 'em_analise'
  note: string
}

export interface SimulationRunSummary {
  id: UUID
  number: number
  createdAt: ISODateTime
  userName: string
  companyId: UUID | null
  companyName: string | null
  cnpj: string | null
  uf: string
  city: string
  referenceDate: ISODate
  cnaes: SimulationCnae[]
  overallStatus: SimulationStatus
  classificationName: string | null
  classificationTone: ClassificationTone | null
  confidence: RuleConfidence
}

/** Registro de uma importação de legislação publicada (quem, quando, arquivo, o que mudou). */
export interface LegislationImportBatch {
  id: UUID
  legislationId: UUID
  versionId: UUID
  fileName: string
  sourceKind: 'csv' | 'xlsx'
  mode: 'completo' | 'parcial'
  rowsTotal: number
  counts: { encontrados: number; novos: number; alterados: number; removidos: number; inalterados: number; condicoesModificadas: number }
  publishedAt: ISODateTime
  publishedByName: string
}

export interface SimulationRun extends SimulationRunSummary {
  result: SimulationResult
  applications: SimulationApplication[]
}
