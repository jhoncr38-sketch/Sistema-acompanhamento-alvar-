/** Data no formato ISO `YYYY-MM-DD` (sem fuso). */
export type ISODate = string
/** Data e hora ISO 8601 com fuso. */
export type ISODateTime = string
export type UUID = string

export type UserRole = 'administrador' | 'contador' | 'colaborador' | 'consulta'

export type CompanyStatus = 'ativa' | 'inativa' | 'em_implantacao'

/** Decisão do escritório sobre a licença para aquela empresa. */
export type LicenseApplicability = 'aplicavel' | 'nao_aplicavel' | 'dispensada' | 'em_analise'

/** Situação informada pela fonte (órgão) ou registrada manualmente numa consulta. */
export type LicenseSituation = 'regular' | 'vencida' | 'pendente' | 'em_renovacao' | 'em_analise'

/** Status exibido, calculado a partir de aplicabilidade + situação + vencimento. */
export type LicenseStatus =
  | 'regular'
  | 'atencao'
  | 'vencida'
  | 'pendente'
  | 'em_renovacao'
  | 'nao_aplicavel'
  | 'dispensada'
  | 'em_analise'

export type ExpirationLevel =
  | 'sem_validade'
  | 'regular'
  | 'atencao_preventiva'
  | 'atencao'
  | 'atencao_alta'
  | 'critico'
  | 'vencida'

/** Situação agregada da empresa (badge da tabela do setor). */
export type CompanyHealth = 'regular' | 'atencao' | 'pendencia'

export type ConsultationType = 'automatica' | 'manual'
export type ConsultationOutcome = 'sucesso' | 'erro'

export type AlertCategory =
  | 'vencimento_proximo'
  | 'licenca_vencida'
  | 'alteracao_detectada'
  | 'consulta_com_erro'
  | 'documento_pendente'
  | 'renovacao_em_andamento'

export type AlertPriority = 'baixa' | 'media' | 'alta' | 'critica'
export type AlertStatus = 'aberto' | 'lido' | 'resolvido'

export type IntegrationStatus = 'pendente' | 'ativa' | 'inativa' | 'erro'
export type AgencyScope = 'municipal' | 'estadual' | 'federal' | 'conselho'

export type SectorColor = 'orange' | 'green' | 'purple' | 'blue' | 'pink' | 'slate'
export type SectorIcon = 'utensils' | 'stethoscope' | 'scale' | 'factory' | 'paw' | 'store'

export type NotificationChannelKind = 'interna' | 'email' | 'whatsapp'
export type NotificationTemplateCode = 'd90' | 'd60' | 'd30' | 'd15' | 'd7' | 'vencida'

export interface UserProfile {
  id: UUID
  fullName: string
  email: string
  role: UserRole
  active: boolean
}

export interface Sector {
  id: UUID
  slug: string
  name: string
  color: SectorColor
  icon: SectorIcon
  coverImageUrl: string | null
  sortOrder: number
  active: boolean
}

export interface IntegrationProvider {
  id: UUID
  code: string
  name: string
  shortName: string
  agency: string
  status: IntegrationStatus
  notes: string | null
}

export interface LicenseType {
  id: UUID
  code: string
  name: string
  shortName: string
  agency: string
  agencyScope: AgencyScope
  defaultProviderCode: string | null
  hasExpiration: boolean
  sortOrder: number
  active: boolean
}

/** Perfil de licenciamento do setor: licença sugerida e aplicabilidade inicial (sempre editável). */
export interface SectorLicenseRule {
  id: UUID
  sectorId: UUID
  licenseTypeId: UUID
  defaultApplicability: LicenseApplicability
  showInTable: boolean
  sortOrder: number
  notes: string | null
}

export interface Cnae {
  id: UUID
  code: string
  description: string
}

export interface CnaeSectorRule {
  id: UUID
  cnaeId: UUID
  sectorId: UUID
  priority: number
}

export interface CnaeLicenseRule {
  id: UUID
  cnaeId: UUID
  licenseTypeId: UUID
  applicability: LicenseApplicability
  notes: string | null
}

export interface Address {
  street: string
  number: string
  complement: string
  district: string
  city: string
  state: string
  zipCode: string
}

export interface Company {
  id: UUID
  legalName: string
  tradeName: string
  /** 14 caracteres sem máscara (aceita CNPJ alfanumérico). */
  cnpj: string
  sectorId: UUID
  mainCnae: string | null
  secondaryCnaes: string[]
  address: Address
  phone: string
  email: string
  responsibleName: string
  notes: string
  status: CompanyStatus
  photoUrl: string | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
  createdBy: UUID | null
}

export interface CompanyLicense {
  id: UUID
  companyId: UUID
  licenseTypeId: UUID
  applicability: LicenseApplicability
  situation: LicenseSituation | null
  issuedAt: ISODate | null
  expiresAt: ISODate | null
  documentNumber: string | null
  protocolNumber: string | null
  providerCode: string | null
  lastConsultationId: UUID | null
  lastCheckedAt: ISODateTime | null
  notes: string | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface LicenseConsultation {
  id: UUID
  companyLicenseId: UUID
  companyId: UUID
  licenseTypeId: UUID
  consultedAt: ISODateTime
  type: ConsultationType
  outcome: ConsultationOutcome
  errorMessage: string | null
  situation: LicenseSituation | null
  issuedAt: ISODate | null
  expiresAt: ISODate | null
  providerCode: string | null
  sourceLabel: string | null
  documentNumber: string | null
  protocolNumber: string | null
  notes: string | null
  responsibleId: UUID | null
  responsibleName: string
  previousConsultationId: UUID | null
  changeDetected: boolean
  createdAt: ISODateTime
}

export type ComparableField = 'situation' | 'expiresAt' | 'issuedAt' | 'documentNumber' | 'protocolNumber'

export interface FieldChange {
  field: ComparableField
  previous: string | null
  current: string | null
}

export interface LicenseChange {
  id: UUID
  companyLicenseId: UUID
  companyId: UUID
  consultationId: UUID
  previousConsultationId: UUID
  changes: FieldChange[]
  detectedAt: ISODateTime
}

export interface LicenseDocument {
  id: UUID
  companyLicenseId: UUID
  companyId: UUID
  consultationId: UUID | null
  documentType: string
  name: string
  number: string | null
  issuingAgency: string | null
  issuedAt: ISODate | null
  expiresAt: ISODate | null
  fileName: string | null
  mimeType: string | null
  sizeBytes: number | null
  storagePath: string | null
  uploadedAt: ISODateTime
  uploadedBy: UUID | null
  uploadedByName: string
  archivedAt: ISODateTime | null
}

export interface AlertNote {
  id: UUID
  alertId: UUID
  note: string
  authorName: string
  createdAt: ISODateTime
}

export interface Alert {
  id: UUID
  companyId: UUID
  companyLicenseId: UUID | null
  category: AlertCategory
  priority: AlertPriority
  title: string
  message: string
  status: AlertStatus
  dedupeKey: string | null
  consultationId: UUID | null
  changeId: UUID | null
  readAt: ISODateTime | null
  resolvedAt: ISODateTime | null
  resolutionNote: string | null
  notes: AlertNote[]
  createdAt: ISODateTime
}

export interface NotificationLog {
  id: UUID
  alertId: UUID | null
  channel: NotificationChannelKind
  template: NotificationTemplateCode | null
  recipient: string | null
  status: 'pendente' | 'enviado' | 'falha' | 'ignorado'
  error: string | null
  createdAt: ISODateTime
}

export interface AuditLog {
  id: UUID
  occurredAt: ISODateTime
  userId: UUID | null
  userName: string | null
  action: string
  tableName: string
  recordId: string | null
  companyId: UUID | null
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  origin: 'app' | 'rotina' | 'integracao' | 'sistema'
}

export interface ExpirationThresholds {
  /** Até quantos dias antes do vencimento entra em "atenção preventiva". */
  preventiveDays: number
  attentionDays: number
  highDays: number
  criticalDays: number
}

export interface RegularityWeights {
  regular: number
  atencao_preventiva: number
  atencao: number
  atencao_alta: number
  critico: number
  em_renovacao: number
  vencida: number
  pendente: number
}

export interface SystemSettings {
  expirationThresholds: ExpirationThresholds
  regularityWeights: RegularityWeights
  /** Dias antes do vencimento em que um aviso é disparado (0 = no dia do vencimento/vencida). */
  notificationScheduleDays: number[]
  monitoringJob: { enabled: boolean; cron: string }
}
