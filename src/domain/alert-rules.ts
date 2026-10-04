import { formatDate } from './format'
import { FIELD_LABEL, LICENSE_SITUATION_LABEL } from './labels'
import type { EvaluatedLicense } from './monitoring'
import type { AlertCategory, AlertPriority, ExpirationLevel, FieldChange, LicenseSituation } from './types'

export interface AlertDraft {
  companyId: string
  companyLicenseId: string | null
  category: AlertCategory
  priority: AlertPriority
  title: string
  message: string
  /** Evita alertas repetidos para a mesma situação enquanto o anterior estiver aberto. */
  dedupeKey: string | null
  consultationId?: string | null
  changeId?: string | null
}

const LEVEL_PRIORITY: Partial<Record<ExpirationLevel, AlertPriority>> = {
  critico: 'critica',
  atencao_alta: 'alta',
  atencao: 'media',
  atencao_preventiva: 'baixa',
}

/** Alerta de vencimento/pendência para uma licença avaliada (usado pela rotina diária). */
export function expirationAlertFor(companyId: string, companyName: string, e: EvaluatedLicense): AlertDraft | null {
  const { license, type, evaluation } = e
  const base = { companyId, companyLicenseId: license.id }
  const days = evaluation.daysRemaining

  switch (evaluation.status) {
    case 'vencida':
      return {
        ...base,
        category: 'licenca_vencida',
        priority: 'critica',
        title: `${type.name} vencida`,
        message: `${companyName}: ${type.name} vencida${license.expiresAt ? ` em ${formatDate(license.expiresAt)}` : ''}.`,
        dedupeKey: `vencida:${license.id}:${license.expiresAt ?? 'sem-data'}`,
      }
    case 'atencao': {
      const priority = LEVEL_PRIORITY[evaluation.level] ?? 'media'
      return {
        ...base,
        category: 'vencimento_proximo',
        priority,
        title: `${type.name} vence em ${days} dia${days === 1 ? '' : 's'}`,
        message: `${companyName}: ${type.name} vence em ${formatDate(license.expiresAt)}.`,
        dedupeKey: `vencimento:${license.id}:${license.expiresAt}:${evaluation.level}`,
      }
    }
    case 'pendente':
      return {
        ...base,
        category: 'documento_pendente',
        priority: 'alta',
        title: `${type.name} pendente`,
        message: `${companyName}: ${type.name} sem documento válido registrado.`,
        dedupeKey: `pendente:${license.id}`,
      }
    case 'em_renovacao':
      return {
        ...base,
        category: 'renovacao_em_andamento',
        priority: 'baixa',
        title: `${type.name} em renovação`,
        message: `${companyName}: acompanhar protocolo ${license.protocolNumber ?? 'não informado'}.`,
        dedupeKey: `renovacao:${license.id}:${license.protocolNumber ?? ''}`,
      }
    default:
      return null
  }
}

function formatFieldValue(change: FieldChange, value: string | null): string {
  if (value === null) return '—'
  if (change.field === 'situation') return LICENSE_SITUATION_LABEL[value as LicenseSituation] ?? value
  if (change.field === 'expiresAt' || change.field === 'issuedAt') return formatDate(value)
  return value
}

export function describeChanges(changes: readonly FieldChange[]): string {
  return changes
    .map((c) => `${FIELD_LABEL[c.field]}: ${formatFieldValue(c, c.previous)} → ${formatFieldValue(c, c.current)}`)
    .join(' · ')
}

export function changeAlertFor(params: {
  companyId: string
  companyName: string
  companyLicenseId: string
  licenseName: string
  changes: readonly FieldChange[]
  consultationId: string
  changeId: string
}): AlertDraft {
  const worsened = params.changes.some(
    (c) => c.field === 'situation' && (c.current === 'vencida' || c.current === 'pendente'),
  )
  return {
    companyId: params.companyId,
    companyLicenseId: params.companyLicenseId,
    category: 'alteracao_detectada',
    priority: worsened ? 'alta' : 'media',
    title: `Alteração detectada — ${params.licenseName}`,
    message: `${params.companyName}: ${describeChanges(params.changes)}`,
    dedupeKey: null,
    consultationId: params.consultationId,
    changeId: params.changeId,
  }
}

export function consultationErrorAlertFor(params: {
  companyId: string
  companyName: string
  companyLicenseId: string
  licenseName: string
  error: string
  consultationId: string
}): AlertDraft {
  return {
    companyId: params.companyId,
    companyLicenseId: params.companyLicenseId,
    category: 'consulta_com_erro',
    priority: 'media',
    title: `Consulta com erro — ${params.licenseName}`,
    message: `${params.companyName}: ${params.error}`,
    dedupeKey: null,
    consultationId: params.consultationId,
  }
}
