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
} from '@/domain/simulation/types'
import type {
  Alert,
  AuditLog,
  Cnae,
  CnaeLicenseRule,
  CnaeSectorRule,
  Company,
  CompanyLicense,
  IntegrationProvider,
  ISODate,
  LicenseChange,
  LicenseConsultation,
  LicenseDocument,
  LicenseType,
  NotificationLog,
  Sector,
  SectorLicenseRule,
  SystemSettings,
  UserProfile,
} from '@/domain/types'

export interface StoredDocument extends LicenseDocument {
  /** Conteúdo do arquivo (somente arquivos pequenos, modo demonstração). */
  dataUrl: string | null
}

export interface MockDb {
  version: number
  seededFor: ISODate
  currentUserId: string
  users: UserProfile[]
  sectors: Sector[]
  licenseTypes: LicenseType[]
  sectorLicenseRules: SectorLicenseRule[]
  cnaes: Cnae[]
  cnaeSectorRules: CnaeSectorRule[]
  cnaeLicenseRules: CnaeLicenseRule[]
  providers: IntegrationProvider[]
  settings: SystemSettings
  companies: Company[]
  licenses: CompanyLicense[]
  consultations: LicenseConsultation[]
  changes: LicenseChange[]
  documents: StoredDocument[]
  alerts: Alert[]
  notificationLogs: NotificationLog[]
  audit: AuditLog[]
  legislations: Legislation[]
  legislationVersions: LegislationVersion[]
  legislationAnnexes: LegislationAnnex[]
  legislationDocuments: LegislationDocument[]
  importBatches: LegislationImportBatch[]
  riskClassifications: RiskClassification[]
  ruleQuestions: RuleQuestion[]
  cnaeRules: CnaeRule[]
  licenseRules: LicenseRule[]
  simulationRuns: Omit<SimulationRun, 'applications'>[]
  simulationApplications: SimulationApplication[]
}

/** Incrementar quando o seed mudar: o navegador recria os dados de demonstração. */
export const MOCK_DB_VERSION = 6
