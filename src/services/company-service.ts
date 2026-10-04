import type { CatalogSnapshot, CompanyLicenseInput } from '@/data/types'
import { suggestLicenses, suggestSector, type LicenseSuggestion } from '@/domain/licensing-profile'

export function suggestSectorForCnaes(catalog: CatalogSnapshot, cnaeCodes: readonly string[]) {
  return suggestSector(cnaeCodes, catalog.cnaes, catalog.cnaeSectorRules)
}

export function suggestLicensesFor(
  catalog: CatalogSnapshot,
  sectorId: string,
  cnaeCodes: readonly string[],
): LicenseSuggestion[] {
  return suggestLicenses({
    sectorId,
    cnaeCodes,
    sectorRules: catalog.sectorLicenseRules,
    cnaeLicenseRules: catalog.cnaeLicenseRules,
    cnaes: catalog.cnaes,
    licenseTypes: catalog.licenseTypes,
  })
}

export function toLicenseInputs(catalog: CatalogSnapshot, suggestions: readonly LicenseSuggestion[]): CompanyLicenseInput[] {
  return suggestions.map((s) => ({
    licenseTypeId: s.licenseTypeId,
    applicability: s.applicability,
    providerCode: catalog.licenseTypes.find((t) => t.id === s.licenseTypeId)?.defaultProviderCode ?? null,
  }))
}
