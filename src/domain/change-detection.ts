import type { ComparableField, FieldChange, LicenseConsultation } from './types'

export type ConsultationSnapshot = Pick<
  LicenseConsultation,
  'outcome' | 'situation' | 'expiresAt' | 'issuedAt' | 'documentNumber' | 'protocolNumber'
>

export interface ChangeDetectionResult {
  /** Existe consulta anterior bem-sucedida para comparar. */
  comparable: boolean
  changed: boolean
  changes: FieldChange[]
}

export const COMPARABLE_FIELDS: readonly ComparableField[] = [
  'situation',
  'expiresAt',
  'issuedAt',
  'documentNumber',
  'protocolNumber',
]

function normalize(value: string | null | undefined): string | null {
  const v = value?.trim()
  return v ? v : null
}

/**
 * Compara a NOVA consulta com a ÚLTIMA consulta bem-sucedida da mesma licença.
 * Consultas com erro não são comparadas. Um campo não informado na nova consulta
 * não é tratado como alteração (a fonte apenas não trouxe aquele dado).
 */
export function detectChanges(
  previous: ConsultationSnapshot | null,
  current: ConsultationSnapshot,
): ChangeDetectionResult {
  if (current.outcome !== 'sucesso' || !previous || previous.outcome !== 'sucesso') {
    return { comparable: false, changed: false, changes: [] }
  }
  const changes: FieldChange[] = []
  for (const field of COMPARABLE_FIELDS) {
    const before = normalize(previous[field])
    const after = normalize(current[field])
    if (after !== null && before !== after) changes.push({ field, previous: before, current: after })
  }
  return { comparable: true, changed: changes.length > 0, changes }
}
