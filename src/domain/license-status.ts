import { daysBetween } from './dates'
import type {
  CompanyLicense,
  ExpirationLevel,
  ExpirationThresholds,
  ISODate,
  LicenseStatus,
} from './types'

export interface LicenseEvaluation {
  status: LicenseStatus
  level: ExpirationLevel
  /** Dias até o vencimento; `null` quando não há validade. */
  daysRemaining: number | null
}

export function classifyExpiration(
  expiresAt: ISODate | null,
  today: ISODate,
  t: ExpirationThresholds,
): { level: ExpirationLevel; daysRemaining: number | null } {
  if (!expiresAt) return { level: 'sem_validade', daysRemaining: null }
  const days = daysBetween(today, expiresAt)
  let level: ExpirationLevel
  if (days < 0) level = 'vencida'
  else if (days <= t.criticalDays) level = 'critico'
  else if (days <= t.highDays) level = 'atencao_alta'
  else if (days <= t.attentionDays) level = 'atencao'
  else if (days <= t.preventiveDays) level = 'atencao_preventiva'
  else level = 'regular'
  return { level, daysRemaining: days }
}

const ATTENTION_LEVELS: ReadonlySet<ExpirationLevel> = new Set([
  'atencao_preventiva',
  'atencao',
  'atencao_alta',
  'critico',
])

export function isAttentionLevel(level: ExpirationLevel): boolean {
  return ATTENTION_LEVELS.has(level)
}

type EvaluableLicense = Pick<CompanyLicense, 'applicability' | 'situation' | 'expiresAt'>

/**
 * Status exibido de uma licença.
 * Ordem: aplicabilidade → situação informada pela fonte → faixa de vencimento.
 */
export function resolveLicenseStatus(
  license: EvaluableLicense,
  today: ISODate,
  thresholds: ExpirationThresholds,
): LicenseEvaluation {
  if (license.applicability !== 'aplicavel') {
    return { status: license.applicability, level: 'sem_validade', daysRemaining: null }
  }

  const { level, daysRemaining } = classifyExpiration(license.expiresAt, today, thresholds)

  switch (license.situation) {
    case 'vencida':
    case 'pendente':
    case 'em_renovacao':
    case 'em_analise':
      return { status: license.situation, level, daysRemaining }
    case null:
      if (!license.expiresAt) return { status: 'pendente', level, daysRemaining }
      break
    case 'regular':
      break
  }

  if (level === 'vencida') return { status: 'vencida', level, daysRemaining }
  if (isAttentionLevel(level)) return { status: 'atencao', level, daysRemaining }
  return { status: 'regular', level, daysRemaining }
}
