import { formatCnae, normalizeCnae } from './format'
import type {
  Cnae,
  CnaeLicenseRule,
  CnaeSectorRule,
  LicenseApplicability,
  LicenseType,
  SectorLicenseRule,
} from './types'

/**
 * Matriz CNPJ → CNAE → Setor → Perfil de licenciamento → Licenças sugeridas.
 * Tudo aqui é SUGESTÃO: o administrador confirma ou altera a aplicabilidade de cada licença.
 */

export interface SectorSuggestion {
  sectorId: string
  cnaeCode: string
}

export function suggestSector(
  cnaeCodes: readonly string[],
  cnaes: readonly Cnae[],
  rules: readonly CnaeSectorRule[],
): SectorSuggestion | null {
  for (const raw of cnaeCodes) {
    const code = normalizeCnae(raw)
    const cnae = cnaes.find((c) => normalizeCnae(c.code) === code)
    if (!cnae) continue
    const rule = rules.filter((r) => r.cnaeId === cnae.id).sort((a, b) => a.priority - b.priority)[0]
    if (rule) return { sectorId: rule.sectorId, cnaeCode: cnae.code }
  }
  return null
}

export interface LicenseSuggestion {
  licenseTypeId: string
  applicability: LicenseApplicability
  reason: string
}

/** Quando mais de uma regra se aplica, prevalece a que exige mais atenção do escritório. */
const APPLICABILITY_STRENGTH: Record<LicenseApplicability, number> = {
  aplicavel: 3,
  em_analise: 2,
  dispensada: 1,
  nao_aplicavel: 0,
}

export function suggestLicenses(params: {
  sectorId: string
  cnaeCodes: readonly string[]
  sectorRules: readonly SectorLicenseRule[]
  cnaeLicenseRules: readonly CnaeLicenseRule[]
  cnaes: readonly Cnae[]
  licenseTypes: readonly LicenseType[]
}): LicenseSuggestion[] {
  const activeTypes = new Map(params.licenseTypes.filter((t) => t.active).map((t) => [t.id, t]))
  const result = new Map<string, LicenseSuggestion>()

  for (const rule of params.sectorRules) {
    if (rule.sectorId !== params.sectorId || !activeTypes.has(rule.licenseTypeId)) continue
    result.set(rule.licenseTypeId, {
      licenseTypeId: rule.licenseTypeId,
      applicability: rule.defaultApplicability,
      reason: 'Perfil do setor',
    })
  }

  const codes = new Set(params.cnaeCodes.map(normalizeCnae))
  const cnaeIds = new Map(params.cnaes.filter((c) => codes.has(normalizeCnae(c.code))).map((c) => [c.id, c]))

  for (const rule of params.cnaeLicenseRules) {
    const cnae = cnaeIds.get(rule.cnaeId)
    if (!cnae || !activeTypes.has(rule.licenseTypeId)) continue
    const current = result.get(rule.licenseTypeId)
    const fromCnae = current?.reason.startsWith('CNAE')
    if (!current || !fromCnae || APPLICABILITY_STRENGTH[rule.applicability] > APPLICABILITY_STRENGTH[current.applicability]) {
      result.set(rule.licenseTypeId, {
        licenseTypeId: rule.licenseTypeId,
        applicability: rule.applicability,
        reason: `CNAE ${formatCnae(cnae.code)}`,
      })
    }
  }

  return [...result.values()].sort(
    (a, b) => (activeTypes.get(a.licenseTypeId)?.sortOrder ?? 0) - (activeTypes.get(b.licenseTypeId)?.sortOrder ?? 0),
  )
}
