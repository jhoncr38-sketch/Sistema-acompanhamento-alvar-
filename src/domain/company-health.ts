import type { LicenseEvaluation } from './license-status'
import type { CompanyHealth, LicenseStatus } from './types'

const PENDENCY: ReadonlySet<LicenseStatus> = new Set(['vencida', 'pendente'])
const ATTENTION: ReadonlySet<LicenseStatus> = new Set(['atencao', 'em_renovacao', 'em_analise'])

/** Pendência se houver licença vencida/pendente; Atenção se houver algo a acompanhar; senão Regular. */
export function evaluateCompanyHealth(evaluations: readonly LicenseEvaluation[]): CompanyHealth {
  if (evaluations.some((e) => PENDENCY.has(e.status))) return 'pendencia'
  if (evaluations.some((e) => ATTENTION.has(e.status))) return 'atencao'
  return 'regular'
}
