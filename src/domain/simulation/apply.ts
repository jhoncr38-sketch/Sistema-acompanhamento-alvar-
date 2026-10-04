import { formatDate } from '../format'
import { APPLICABILITY_LABEL } from '../labels'
import type { CompanyLicense, LicenseApplicability } from '../types'
import { legislationLabel, licenseOutcomeLabel } from './labels'
import type { AppliedLicenseChange, LicenseResultOutcome, SimulationResult } from './types'

export type PlannedAction = 'adicionar' | 'alterar' | 'manter'

export interface LicenseChangePlan {
  licenseTypeId: string
  licenseName: string
  outcome: LicenseResultOutcome
  outcomeLabel: string
  /** Situação atual na empresa; `null` = licença ainda não monitorada. */
  current: LicenseApplicability | null
  /** Situação proposta; `null` = sem alteração. */
  next: AppliedLicenseChange['applicability'] | null
  action: PlannedAction
  explanation: string
  /** Fundamento registrado nas observações da licença. */
  note: string
}

function target(outcome: LicenseResultOutcome, current: LicenseApplicability | null): AppliedLicenseChange['applicability'] | null {
  switch (outcome) {
    case 'dispensada':
      return 'dispensada'
    case 'exigivel':
      return 'aplicavel'
    case 'necessita_analise':
      // Licença já monitorada como aplicável continua assim: é o estado mais seguro.
      return current === 'aplicavel' ? null : 'em_analise'
    default:
      return null
  }
}

/**
 * Converte o resultado da simulação em alterações propostas para a empresa:
 * dispensada → DISPENSADA; exigível → entra no monitoramento; necessita análise → pendência (em análise).
 * Nada é excluído; "análise separada" e "regra não cadastrada" não alteram o cadastro.
 */
export function planCompanyChanges(
  result: SimulationResult,
  companyLicenses: readonly Pick<CompanyLicense, 'licenseTypeId' | 'applicability'>[],
  run: { number: number },
): LicenseChangePlan[] {
  const current = new Map(companyLicenses.map((l) => [l.licenseTypeId, l.applicability]))
  return result.licenses.map((license) => {
    const now = current.get(license.licenseTypeId) ?? null
    const next = target(license.outcome, now)
    const outcomeLabel = licenseOutcomeLabel(license.outcome, license.name)
    const norms = [...new Set(license.contributions.map((c) => legislationLabel(c.norm)))].join('; ')
    const unchanged = next === null || next === now
    const action: PlannedAction = unchanged ? 'manter' : now === null ? 'adicionar' : 'alterar'

    let explanation: string
    if (!unchanged && next) {
      explanation = now === null ? `Adicionar ao cadastro como ${APPLICABILITY_LABEL[next]}.` : `Alterar de ${APPLICABILITY_LABEL[now]} para ${APPLICABILITY_LABEL[next]}.`
    } else if (next !== null && now !== null) {
      explanation = `Já está como ${APPLICABILITY_LABEL[now]}.`
    } else if (license.outcome === 'necessita_analise') {
      explanation = 'Já monitorada como aplicável: mantida. Confirme a análise com o órgão.'
    } else if (license.outcome === 'analise_separada') {
      explanation = 'Análise separada pelo órgão competente: sem alteração automática.'
    } else {
      explanation = 'Sem regra cadastrada: sem alteração.'
    }

    return {
      licenseTypeId: license.licenseTypeId,
      licenseName: license.name,
      outcome: license.outcome,
      outcomeLabel,
      current: now,
      next: unchanged ? null : next,
      action,
      explanation,
      note: `Simulação nº ${run.number} (referência ${formatDate(result.referenceDate)}): ${outcomeLabel}.${norms ? ` Base: ${norms}.` : ''}`,
    }
  })
}

export function toAppliedChanges(plans: readonly LicenseChangePlan[]): AppliedLicenseChange[] {
  return plans.flatMap((p) => (p.next ? [{ licenseTypeId: p.licenseTypeId, applicability: p.next, note: p.note }] : []))
}
