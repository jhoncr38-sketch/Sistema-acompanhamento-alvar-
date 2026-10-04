import type { CatalogSnapshot } from '@/data/types'
import { EXPIRATION_LEVEL_LABEL, LICENSE_STATUS_LABEL } from '@/domain/labels'
import type { LicenseEvaluation } from '@/domain/license-status'
import type { Company, LicenseType } from '@/domain/types'

/** "Prefeitura (Teresina)" para órgãos municipais; demais usam o nome do órgão. */
export function agencyLabel(type: LicenseType, company: Pick<Company, 'address'>): string {
  return type.agencyScope === 'municipal' && company.address.city ? `${type.agency} (${company.address.city})` : type.agency
}

export function providerLabel(catalog: CatalogSnapshot, code: string | null, short = false): string {
  if (!code) return 'Manual'
  const p = catalog.providers.find((x) => x.code === code)
  return p ? (short ? p.shortName : p.name) : code
}

export function evaluationTitle(e: LicenseEvaluation): string {
  const base = LICENSE_STATUS_LABEL[e.status]
  if (e.daysRemaining === null) return base
  if (e.daysRemaining < 0) return `${base} — venceu há ${-e.daysRemaining} dia(s)`
  return `${base} — ${EXPIRATION_LEVEL_LABEL[e.level]}, vence em ${e.daysRemaining} dia(s)`
}
