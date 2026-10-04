import { DEFAULT_SETTINGS } from '@/domain/settings'
import type {
  Alert,
  AuditLog,
  Cnae,
  CnaeLicenseRule,
  CnaeSectorRule,
  Company,
  CompanyLicense,
  IntegrationProvider,
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
import type { CompanyInput } from '../types'

/** Linha crua vinda do PostgREST (snake_case). */
export type Row = Record<string, any>

export const toProfile = (r: Row): UserProfile => ({ id: r.id, fullName: r.full_name, email: r.email, role: r.role, active: r.active })

export const toSector = (r: Row): Sector => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  color: r.color,
  icon: r.icon,
  coverImageUrl: r.cover_image_url,
  sortOrder: r.sort_order,
  active: r.active,
})

export const toProvider = (r: Row): IntegrationProvider => ({
  id: r.id,
  code: r.code,
  name: r.name,
  shortName: r.short_name,
  agency: r.agency,
  status: r.status,
  notes: r.notes,
})

export const toLicenseType = (r: Row): LicenseType => ({
  id: r.id,
  code: r.code,
  name: r.name,
  shortName: r.short_name,
  agency: r.agency,
  agencyScope: r.agency_scope,
  defaultProviderCode: r.default_provider_code,
  hasExpiration: r.has_expiration,
  sortOrder: r.sort_order,
  active: r.active,
})

export const fromLicenseType = (t: Omit<LicenseType, 'id'> & { id?: string }): Row => ({
  ...(t.id ? { id: t.id } : {}),
  code: t.code,
  name: t.name,
  short_name: t.shortName,
  agency: t.agency,
  agency_scope: t.agencyScope,
  default_provider_code: t.defaultProviderCode,
  has_expiration: t.hasExpiration,
  sort_order: t.sortOrder,
  active: t.active,
})

export const toSectorRule = (r: Row): SectorLicenseRule => ({
  id: r.id,
  sectorId: r.sector_id,
  licenseTypeId: r.license_type_id,
  defaultApplicability: r.default_applicability,
  showInTable: r.show_in_table,
  sortOrder: r.sort_order,
  notes: r.notes,
})

export const toCnae = (r: Row): Cnae => ({ id: r.id, code: r.code, description: r.description })
export const toCnaeSectorRule = (r: Row): CnaeSectorRule => ({ id: r.id, cnaeId: r.cnae_id, sectorId: r.sector_id, priority: r.priority })
export const toCnaeLicenseRule = (r: Row): CnaeLicenseRule => ({
  id: r.id,
  cnaeId: r.cnae_id,
  licenseTypeId: r.license_type_id,
  applicability: r.applicability,
  notes: r.notes,
})

const SETTING_KEYS = {
  expirationThresholds: 'expiration_thresholds',
  regularityWeights: 'regularity_weights',
  notificationScheduleDays: 'notification_schedule_days',
  monitoringJob: 'monitoring_job',
} as const

export function toSettings(rows: Row[]): SystemSettings {
  const byKey = new Map(rows.map((r) => [r.key as string, r.value]))
  return {
    expirationThresholds: { ...DEFAULT_SETTINGS.expirationThresholds, ...byKey.get(SETTING_KEYS.expirationThresholds) },
    regularityWeights: { ...DEFAULT_SETTINGS.regularityWeights, ...byKey.get(SETTING_KEYS.regularityWeights) },
    notificationScheduleDays: byKey.get(SETTING_KEYS.notificationScheduleDays) ?? DEFAULT_SETTINGS.notificationScheduleDays,
    monitoringJob: { ...DEFAULT_SETTINGS.monitoringJob, ...byKey.get(SETTING_KEYS.monitoringJob) },
  }
}

export function fromSettings(s: SystemSettings): Row[] {
  return (Object.keys(SETTING_KEYS) as (keyof typeof SETTING_KEYS)[]).map((k) => ({ key: SETTING_KEYS[k], value: s[k] }))
}

export const COMPANY_SELECT = '*, company_cnaes(is_primary, cnaes(code))'

export function toCompany(r: Row): Company {
  const cnaes: Row[] = r.company_cnaes ?? []
  return {
    id: r.id,
    legalName: r.legal_name,
    tradeName: r.trade_name,
    cnpj: r.cnpj,
    sectorId: r.sector_id,
    mainCnae: cnaes.find((c) => c.is_primary)?.cnaes?.code ?? null,
    secondaryCnaes: cnaes.filter((c) => !c.is_primary).map((c) => c.cnaes?.code as string).filter(Boolean),
    address: {
      street: r.address_street,
      number: r.address_number,
      complement: r.address_complement,
      district: r.address_district,
      city: r.city,
      state: r.state,
      zipCode: r.zip_code,
    },
    phone: r.phone,
    email: r.email,
    responsibleName: r.responsible_name,
    notes: r.notes,
    status: r.status,
    photoUrl: r.photo_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by,
  }
}

export const fromCompany = (c: CompanyInput): Row => ({
  legal_name: c.legalName,
  trade_name: c.tradeName,
  cnpj: c.cnpj,
  sector_id: c.sectorId,
  address_street: c.address.street,
  address_number: c.address.number,
  address_complement: c.address.complement,
  address_district: c.address.district,
  city: c.address.city,
  state: c.address.state,
  zip_code: c.address.zipCode,
  phone: c.phone,
  email: c.email,
  responsible_name: c.responsibleName,
  notes: c.notes,
  status: c.status,
  photo_url: c.photoUrl,
})

export const toLicense = (r: Row): CompanyLicense => ({
  id: r.id,
  companyId: r.company_id,
  licenseTypeId: r.license_type_id,
  applicability: r.applicability,
  situation: r.situation,
  issuedAt: r.issued_at,
  expiresAt: r.expires_at,
  documentNumber: r.document_number,
  protocolNumber: r.protocol_number,
  providerCode: r.provider_code,
  lastConsultationId: r.last_consultation_id,
  lastCheckedAt: r.last_checked_at,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toConsultation = (r: Row): LicenseConsultation => ({
  id: r.id,
  companyLicenseId: r.company_license_id,
  companyId: r.company_id,
  licenseTypeId: r.license_type_id,
  consultedAt: r.consulted_at,
  type: r.type,
  outcome: r.outcome,
  errorMessage: r.error_message,
  situation: r.situation,
  issuedAt: r.issued_at,
  expiresAt: r.expires_at,
  providerCode: r.provider_code,
  sourceLabel: r.source_label,
  documentNumber: r.document_number,
  protocolNumber: r.protocol_number,
  notes: r.notes,
  responsibleId: r.responsible_id,
  responsibleName: r.responsible_name,
  previousConsultationId: r.previous_consultation_id,
  changeDetected: r.change_detected,
  createdAt: r.created_at,
})

export const fromConsultation = (c: Omit<LicenseConsultation, 'createdAt'>): Row => ({
  id: c.id,
  company_license_id: c.companyLicenseId,
  consulted_at: c.consultedAt,
  type: c.type,
  outcome: c.outcome,
  error_message: c.errorMessage,
  situation: c.situation,
  issued_at: c.issuedAt,
  expires_at: c.expiresAt,
  provider_code: c.providerCode,
  source_label: c.sourceLabel,
  document_number: c.documentNumber,
  protocol_number: c.protocolNumber,
  notes: c.notes,
  responsible_name: c.responsibleName,
  change_detected: c.changeDetected,
})

export const toChange = (r: Row): LicenseChange => ({
  id: r.id,
  companyLicenseId: r.company_license_id,
  companyId: r.company_id,
  consultationId: r.consultation_id,
  previousConsultationId: r.previous_consultation_id,
  changes: r.changes,
  detectedAt: r.detected_at,
})

export const toDocument = (r: Row): LicenseDocument => ({
  id: r.id,
  companyLicenseId: r.company_license_id,
  companyId: r.company_id,
  consultationId: r.consultation_id,
  documentType: r.document_type,
  name: r.name,
  number: r.number,
  issuingAgency: r.issuing_agency,
  issuedAt: r.issued_at,
  expiresAt: r.expires_at,
  fileName: r.file_name,
  mimeType: r.mime_type,
  sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
  storagePath: r.storage_path,
  uploadedAt: r.uploaded_at,
  uploadedBy: r.uploaded_by,
  uploadedByName: r.uploaded_by_name,
  archivedAt: r.archived_at,
})

export const ALERT_SELECT = '*, alert_notes(*)'

export const toAlert = (r: Row): Alert => ({
  id: r.id,
  companyId: r.company_id,
  companyLicenseId: r.company_license_id,
  category: r.category,
  priority: r.priority,
  title: r.title,
  message: r.message,
  status: r.status,
  dedupeKey: r.dedupe_key,
  consultationId: r.consultation_id,
  changeId: r.change_id,
  readAt: r.read_at,
  resolvedAt: r.resolved_at,
  resolutionNote: r.resolution_note,
  notes: ((r.alert_notes ?? []) as Row[])
    .map((n) => ({ id: n.id, alertId: n.alert_id, note: n.note, authorName: n.author_name, createdAt: n.created_at }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  createdAt: r.created_at,
})

export const toNotificationLog = (r: Row): NotificationLog => ({
  id: r.id,
  alertId: r.alert_id,
  channel: r.channel,
  template: r.template,
  recipient: r.recipient,
  status: r.status,
  error: r.error,
  createdAt: r.created_at,
})

export const toAudit = (r: Row): AuditLog => ({
  id: String(r.id),
  occurredAt: r.occurred_at,
  userId: r.user_id,
  userName: r.user_name,
  action: r.action,
  tableName: r.table_name,
  recordId: r.record_id,
  companyId: r.company_id,
  oldValues: r.old_values,
  newValues: r.new_values,
  origin: r.origin,
})
