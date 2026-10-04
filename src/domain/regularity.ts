import type { LicenseEvaluation } from './license-status'
import type { LicenseApplicability, RegularityWeights } from './types'

export interface RegularityInput {
  applicability: LicenseApplicability
  evaluation: LicenseEvaluation
}

export function licenseScore(evaluation: LicenseEvaluation, weights: RegularityWeights): number {
  switch (evaluation.status) {
    case 'regular':
      return weights.regular
    case 'atencao':
      switch (evaluation.level) {
        case 'atencao_preventiva':
          return weights.atencao_preventiva
        case 'atencao_alta':
          return weights.atencao_alta
        case 'critico':
          return weights.critico
        default:
          return weights.atencao
      }
    case 'em_renovacao':
      return weights.em_renovacao
    case 'vencida':
      return weights.vencida
    default:
      return weights.pendente
  }
}

/**
 * Índice de Regularidade (0–100). Considera SOMENTE licenças marcadas como aplicáveis;
 * não aplicáveis, dispensadas e em análise não reduzem o índice.
 * Retorna `null` quando não há licença aplicável.
 */
export function calculateRegularityIndex(
  items: readonly RegularityInput[],
  weights: RegularityWeights,
): number | null {
  const applicable = items.filter((i) => i.applicability === 'aplicavel')
  if (applicable.length === 0) return null
  const total = applicable.reduce((sum, i) => sum + licenseScore(i.evaluation, weights), 0)
  return Math.round(total / applicable.length)
}
