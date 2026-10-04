import type { AlertDraft } from '@/domain/alert-rules'
import type {
  AppliedLicenseChange,
  CnaeRule,
  Legislation,
  LegislationAnnex,
  LegislationDocument,
  LegislationImportBatch,
  LegislationVersion,
  LicenseOutcome,
  RiskClassification,
  RuleBase,
  RuleCondition,
  RuleQuestion,
  SimulationCnae,
  SimulationResult,
  SimulationRun,
  SimulationRunSummary,
} from '@/domain/simulation/types'
import type { ImportPublication } from '@/domain/simulation/rule-import'
import type {
  Address,
  Alert,
  AuditLog,
  Cnae,
  CnaeLicenseRule,
  CnaeSectorRule,
  Company,
  CompanyLicense,
  CompanyStatus,
  ConsultationType,
  FieldChange,
  IntegrationProvider,
  IntegrationStatus,
  LicenseApplicability,
  LicenseChange,
  LicenseConsultation,
  LicenseDocument,
  LicenseType,
  NotificationLog,
  Sector,
  SectorLicenseRule,
  SystemSettings,
  UserProfile,
  UserRole,
} from '@/domain/types'

/** Contratos da camada de dados. As telas e serviços dependem só destas interfaces. */

export interface CatalogSnapshot {
  sectors: Sector[]
  licenseTypes: LicenseType[]
  sectorLicenseRules: SectorLicenseRule[]
  cnaes: Cnae[]
  cnaeSectorRules: CnaeSectorRule[]
  cnaeLicenseRules: CnaeLicenseRule[]
  providers: IntegrationProvider[]
  settings: SystemSettings
}

export interface CompanyInput {
  legalName: string
  tradeName: string
  cnpj: string
  sectorId: string
  mainCnae: string | null
  secondaryCnaes: string[]
  address: Address
  phone: string
  email: string
  responsibleName: string
  notes: string
  status: CompanyStatus
  photoUrl: string | null
}

export interface CompanyLicenseInput {
  licenseTypeId: string
  applicability: LicenseApplicability
  providerCode: string | null
}

export interface LicensePatch {
  applicability?: LicenseApplicability
  providerCode?: string | null
  notes?: string | null
}

export type ConsultationRecord = Omit<LicenseConsultation, 'createdAt'>

export type LicenseStateUpdate = Partial<
  Pick<
    CompanyLicense,
    'situation' | 'expiresAt' | 'issuedAt' | 'documentNumber' | 'protocolNumber' | 'providerCode' | 'lastCheckedAt'
  >
> & { lastConsultationId: string }

export interface DocumentInput {
  companyLicenseId: string
  companyId: string
  consultationId: string | null
  documentType: string
  name: string
  number: string | null
  issuingAgency: string | null
  issuedAt: string | null
  expiresAt: string | null
}

/** Tudo o que uma consulta grava, persistido de forma atômica. */
export interface ConsultationBundle {
  consultation: ConsultationRecord
  change: { id: string; changes: FieldChange[] } | null
  /** `null` quando a consulta falhou: o estado atual da licença não muda. */
  licenseUpdate: LicenseStateUpdate | null
  alerts: AlertDraft[]
  document: { input: DocumentInput; file: File } | null
}

export interface ConsultationFilter {
  companyId?: string
  companyLicenseId?: string
  type?: ConsultationType
  from?: string
  to?: string
  limit?: number
}

export interface AlertFilter {
  status?: Alert['status'] | 'pendentes'
  companyId?: string
}

export interface SearchResult {
  kind: 'empresa' | 'licenca' | 'protocolo' | 'documento'
  companyId: string
  companyLicenseId: string | null
  title: string
  subtitle: string
}

export interface AuthGateway {
  readonly requiresLogin: boolean
  getCurrentUser(): Promise<UserProfile | null>
  signIn(email: string, password: string): Promise<UserProfile>
  signOut(): Promise<void>
  onChange(listener: (user: UserProfile | null) => void): () => void
}

export interface CatalogRepository {
  getCatalog(): Promise<CatalogSnapshot>
  saveSettings(settings: SystemSettings): Promise<void>
  saveLicenseType(input: Omit<LicenseType, 'id'> & { id?: string }): Promise<LicenseType>
  saveSectorLicenseRule(input: Omit<SectorLicenseRule, 'id'> & { id?: string }): Promise<void>
  deleteSectorLicenseRule(id: string): Promise<void>
  saveCnae(input: { code: string; description: string }): Promise<Cnae>
  saveCnaeSectorRule(input: { cnaeId: string; sectorId: string; priority: number }): Promise<void>
  deleteCnaeSectorRule(id: string): Promise<void>
  saveCnaeLicenseRule(input: Omit<CnaeLicenseRule, 'id'>): Promise<void>
  deleteCnaeLicenseRule(id: string): Promise<void>
  updateProvider(code: string, patch: { status: IntegrationStatus; notes: string | null }): Promise<void>
}

export interface CompanyRepository {
  list(): Promise<Company[]>
  get(id: string): Promise<Company | null>
  create(input: CompanyInput, licenses: CompanyLicenseInput[]): Promise<Company>
  update(id: string, input: CompanyInput): Promise<Company>
  /** Só funciona para empresa sem histórico; com histórico, use status "inativa". */
  remove(id: string): Promise<void>
}

export interface LicenseRepository {
  listAll(): Promise<CompanyLicense[]>
  listByCompany(companyId: string): Promise<CompanyLicense[]>
  get(id: string): Promise<CompanyLicense | null>
  add(companyId: string, input: CompanyLicenseInput): Promise<CompanyLicense>
  update(id: string, patch: LicensePatch): Promise<CompanyLicense>
}

export interface ConsultationRepository {
  list(filter?: ConsultationFilter): Promise<LicenseConsultation[]>
  latestSuccessful(companyLicenseId: string): Promise<LicenseConsultation | null>
  /**
   * Grava consulta + alteração + estado da licença + alertas (+ documento) numa única operação.
   * Falha com CONCURRENT_UPDATE se outra consulta bem-sucedida entrou depois de `expectedPreviousId`.
   */
  record(bundle: ConsultationBundle, expectedPreviousId: string | null): Promise<LicenseConsultation>
  listChanges(filter?: { companyId?: string; limit?: number }): Promise<LicenseChange[]>
}

export interface DocumentRepository {
  list(filter?: { companyId?: string; companyLicenseId?: string; includeArchived?: boolean }): Promise<LicenseDocument[]>
  upload(input: DocumentInput, file: File | null): Promise<LicenseDocument>
  archive(id: string): Promise<void>
  getFileUrl(document: LicenseDocument): Promise<string | null>
}

export interface AlertRepository {
  list(filter?: AlertFilter): Promise<Alert[]>
  /** Ignora rascunhos cuja `dedupeKey` já tenha alerta não resolvido. */
  createMany(drafts: AlertDraft[]): Promise<Alert[]>
  markRead(id: string): Promise<void>
  resolve(id: string, note: string | null): Promise<void>
  reopen(id: string): Promise<void>
  addNote(id: string, note: string): Promise<void>
}

export interface NotificationLogRepository {
  list(limit?: number): Promise<NotificationLog[]>
  create(log: Omit<NotificationLog, 'id' | 'createdAt'>): Promise<void>
}

export interface AuditRepository {
  list(filter?: { companyId?: string; limit?: number }): Promise<AuditLog[]>
}

export interface UserRepository {
  list(): Promise<UserProfile[]>
  updateRole(id: string, role: UserRole): Promise<void>
  setActive(id: string, active: boolean): Promise<void>
}

export interface SearchRepository {
  global(query: string): Promise<SearchResult[]>
}

export type LegislationInput = Omit<Legislation, 'id'> & { id?: string }
export type LegislationVersionInput = Omit<LegislationVersion, 'id'> & { id?: string }
export type LegislationAnnexInput = Omit<LegislationAnnex, 'id'> & { id?: string }
export type LegislationDocumentInput = Omit<LegislationDocument, 'id'> & { id?: string }
export type RiskClassificationInput = Omit<RiskClassification, 'id'> & { id?: string }
export type RuleQuestionInput = Omit<RuleQuestion, 'id'> & { id?: string }

export interface SaveVersionOptions {
  /** Copia regras e efeitos nas licenças de outra versão (ex.: a versão anterior). */
  copyRulesFromVersionId?: string | null
  /** Encerra a vigência desta versão no dia anterior ao início da nova. */
  closePreviousVersionId?: string | null
}

export interface CnaeRuleInput extends Omit<CnaeRule, 'id' | 'conditions'> {
  id?: string
  /** Usada apenas se o CNAE ainda não existir no catálogo. */
  cnaeDescription?: string | null
  conditions: Omit<RuleCondition, 'id'>[]
}

export interface LicenseRuleInput {
  legislationVersionId: string
  classificationId: string
  licenseTypeId: string
  /** `null` remove o efeito (a regra é desativada, não excluída). */
  outcome: LicenseOutcome | null
  notes?: string | null
}

export interface SimulationRunInput {
  companyId: string | null
  companyName: string | null
  cnpj: string | null
  uf: string
  city: string
  referenceDate: string
  cnaes: SimulationCnae[]
  result: SimulationResult
}

/**
 * Legislação, regras e histórico da Simulação de Licenciamento.
 * Regras nunca são excluídas: são desativadas. Simulações são imutáveis.
 */
export interface SimulationRepository {
  getRuleBase(): Promise<RuleBase>
  saveLegislation(input: LegislationInput): Promise<Legislation>
  saveVersion(input: LegislationVersionInput, options?: SaveVersionOptions): Promise<LegislationVersion>
  saveClassification(input: RiskClassificationInput): Promise<RiskClassification>
  saveQuestion(input: RuleQuestionInput): Promise<RuleQuestion>
  saveCnaeRule(input: CnaeRuleInput): Promise<CnaeRule>
  setCnaeRuleActive(id: string, active: boolean): Promise<void>
  saveLicenseRule(input: LicenseRuleInput): Promise<void>
  saveAnnex(input: LegislationAnnexInput): Promise<LegislationAnnex>
  /** Registra/atualiza um documento da biblioteca de legislação (metadados; o arquivo fica preservado na biblioteca). */
  saveDocument(input: LegislationDocumentInput): Promise<LegislationDocument>
  /**
   * Publica uma importação revisada pelo administrador, numa única operação: cria a nova versão (ou complementa
   * uma existente), copia as regras inalteradas, desativa as substituídas e registra o lote. Nada é excluído.
   */
  publishImport(publication: ImportPublication): Promise<{ versionId: string; inserted: number }>
  listImportBatches(): Promise<LegislationImportBatch[]>
  saveRun(input: SimulationRunInput): Promise<SimulationRun>
  listRuns(filter?: { companyId?: string; limit?: number }): Promise<SimulationRunSummary[]>
  getRun(id: string): Promise<SimulationRun | null>
  /** Atualiza o perfil de licenciamento da empresa. Nunca exclui registros. */
  applyToCompany(runId: string, companyId: string, changes: AppliedLicenseChange[]): Promise<void>
}

export interface DataSource {
  readonly mode: 'demo' | 'supabase'
  auth: AuthGateway
  catalog: CatalogRepository
  companies: CompanyRepository
  licenses: LicenseRepository
  consultations: ConsultationRepository
  documents: DocumentRepository
  alerts: AlertRepository
  notifications: NotificationLogRepository
  audit: AuditRepository
  users: UserRepository
  search: SearchRepository
  simulation: SimulationRepository
  /** Somente no modo demonstração. */
  demo?: {
    reset(): Promise<void>
    switchUser(role: UserRole): Promise<UserProfile>
  }
}
