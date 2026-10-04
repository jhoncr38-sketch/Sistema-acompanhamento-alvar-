import { evaluateCompanyHealth } from './company-health'
import { resolveLicenseStatus, type LicenseEvaluation } from './license-status'
import { calculateRegularityIndex } from './regularity'
import type {
  Company,
  CompanyHealth,
  CompanyLicense,
  ExpirationLevel,
  ISODate,
  LicenseType,
  Sector,
  SystemSettings,
} from './types'

export interface EvaluatedLicense {
  license: CompanyLicense
  type: LicenseType
  evaluation: LicenseEvaluation
}

export interface CompanyOverview {
  company: Company
  sector: Sector | undefined
  licenses: EvaluatedLicense[]
  health: CompanyHealth
  regularityIndex: number | null
  lastCheckedAt: string | null
  monitored: boolean
}

export interface MonitoringInput {
  companies: readonly Company[]
  licenses: readonly CompanyLicense[]
  licenseTypes: readonly LicenseType[]
  sectors: readonly Sector[]
}

export function isMonitored(company: Pick<Company, 'status'>): boolean {
  return company.status !== 'inativa'
}

export function evaluateCompany(
  company: Company,
  licenses: readonly CompanyLicense[],
  typesById: ReadonlyMap<string, LicenseType>,
  sector: Sector | undefined,
  today: ISODate,
  settings: SystemSettings,
): CompanyOverview {
  const evaluated: EvaluatedLicense[] = []
  for (const license of licenses) {
    const type = typesById.get(license.licenseTypeId)
    if (!type) continue
    evaluated.push({ license, type, evaluation: resolveLicenseStatus(license, today, settings.expirationThresholds) })
  }
  evaluated.sort((a, b) => a.type.sortOrder - b.type.sortOrder)

  const lastCheckedAt = licenses.reduce<string | null>(
    (max, l) => (l.lastCheckedAt && (!max || l.lastCheckedAt > max) ? l.lastCheckedAt : max),
    null,
  )

  return {
    company,
    sector,
    licenses: evaluated,
    health: evaluateCompanyHealth(evaluated.map((e) => e.evaluation)),
    regularityIndex: calculateRegularityIndex(
      evaluated.map((e) => ({ applicability: e.license.applicability, evaluation: e.evaluation })),
      settings.regularityWeights,
    ),
    lastCheckedAt,
    monitored: isMonitored(company),
  }
}

export function buildCompanyOverviews(
  input: MonitoringInput,
  today: ISODate,
  settings: SystemSettings,
): CompanyOverview[] {
  const typesById = new Map(input.licenseTypes.map((t) => [t.id, t]))
  const sectorsById = new Map(input.sectors.map((s) => [s.id, s]))
  const licensesByCompany = new Map<string, CompanyLicense[]>()
  for (const l of input.licenses) {
    const list = licensesByCompany.get(l.companyId)
    if (list) list.push(l)
    else licensesByCompany.set(l.companyId, [l])
  }
  return input.companies.map((c) =>
    evaluateCompany(c, licensesByCompany.get(c.id) ?? [], typesById, sectorsById.get(c.sectorId), today, settings),
  )
}

export interface DashboardMetrics {
  monitoredCompanies: number
  expiredLicenses: number
  expiringWithin30: number
  expiringWithin60: number
  fullyRegularCompanies: number
}

function isExpiringWithin(e: EvaluatedLicense, days: number): boolean {
  const { evaluation } = e
  if (e.license.applicability !== 'aplicavel') return false
  if (evaluation.status === 'vencida' || evaluation.status === 'pendente') return false
  return evaluation.daysRemaining !== null && evaluation.daysRemaining >= 0 && evaluation.daysRemaining <= days
}

/** KPIs do topo. "Vencem em até 60 dias" é cumulativo (inclui as que vencem em até 30). */
export function computeDashboardMetrics(
  overviews: readonly CompanyOverview[],
  settings: SystemSettings,
): DashboardMetrics {
  const monitored = overviews.filter((o) => o.monitored)
  const licenses = monitored.flatMap((o) => o.licenses)
  return {
    monitoredCompanies: monitored.length,
    expiredLicenses: licenses.filter(
      (l) => l.license.applicability === 'aplicavel' && l.evaluation.status === 'vencida',
    ).length,
    expiringWithin30: licenses.filter((l) => isExpiringWithin(l, settings.expirationThresholds.attentionDays)).length,
    expiringWithin60: licenses.filter((l) => isExpiringWithin(l, settings.expirationThresholds.preventiveDays)).length,
    fullyRegularCompanies: monitored.filter((o) => o.health === 'regular').length,
  }
}

export interface HealthCounts {
  total: number
  regular: number
  atencao: number
  pendencia: number
}

export function countHealth(overviews: readonly CompanyOverview[]): HealthCounts {
  const counts: HealthCounts = { total: overviews.length, regular: 0, atencao: 0, pendencia: 0 }
  for (const o of overviews) counts[o.health] += 1
  return counts
}

export interface SectorSummary extends HealthCounts {
  sector: Sector
}

export function computeSectorSummaries(
  sectors: readonly Sector[],
  overviews: readonly CompanyOverview[],
): SectorSummary[] {
  return [...sectors]
    .filter((s) => s.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((sector) => ({
      sector,
      ...countHealth(overviews.filter((o) => o.monitored && o.company.sectorId === sector.id)),
    }))
}

export type AttentionTone = 'danger' | 'orange' | 'yellow'

export interface AttentionItem {
  key: string
  companyId: string
  companyName: string
  companyLicenseId: string
  licenseName: string
  message: string
  tone: AttentionTone
  rank: number
  daysRemaining: number | null
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

function expirationMessage(short: string, days: number): string {
  if (days === 0) return `${short} vence hoje`
  if (days === 1) return `${short} vence amanhã`
  return `${short} vence em ${days} dias`
}

const LEVEL_RANK: Partial<Record<ExpirationLevel, number>> = {
  critico: 1,
  atencao_alta: 3,
  atencao: 4,
  atencao_preventiva: 6,
}

type AttentionDescription = Pick<AttentionItem, 'message' | 'tone' | 'rank' | 'daysRemaining'>

function describe(e: EvaluatedLicense): AttentionDescription | null {
  const { evaluation, type } = e
  const short = type.shortName
  const days = evaluation.daysRemaining
  switch (evaluation.status) {
    case 'vencida':
      return {
        message: days !== null && days < 0 ? `${short}: vencida há ${plural(-days, 'dia', 'dias')}` : `${short}: vencida`,
        tone: 'danger',
        rank: 0,
        daysRemaining: days,
      }
    case 'pendente':
      return { message: `${short}: pendente de regularização`, tone: 'danger', rank: 2, daysRemaining: days }
    case 'atencao': {
      const rank = LEVEL_RANK[evaluation.level] ?? 6
      return { message: expirationMessage(short, days ?? 0), tone: rank <= 3 ? 'orange' : 'yellow', rank, daysRemaining: days }
    }
    case 'em_renovacao':
      return { message: `${short}: renovação em andamento`, tone: 'yellow', rank: 5, daysRemaining: days }
    case 'em_analise':
      return { message: `${short}: aplicabilidade em análise`, tone: 'yellow', rank: 7, daysRemaining: days }
    default:
      return null
  }
}

/** Situações prioritárias do dia, das mais críticas para as menos críticas. */
export function buildAttentionList(overviews: readonly CompanyOverview[]): AttentionItem[] {
  const items: AttentionItem[] = []
  for (const o of overviews) {
    if (!o.monitored) continue
    for (const e of o.licenses) {
      const d = describe(e)
      if (!d) continue
      items.push({
        ...d,
        key: e.license.id,
        companyId: o.company.id,
        companyName: o.company.tradeName || o.company.legalName,
        companyLicenseId: e.license.id,
        licenseName: e.type.name,
      })
    }
  }
  return items.sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.daysRemaining ?? Number.MAX_SAFE_INTEGER) - (b.daysRemaining ?? Number.MAX_SAFE_INTEGER) ||
      a.companyName.localeCompare(b.companyName, 'pt-BR'),
  )
}
