import { formatDate } from '@/domain/format'
import type { ISODate, NotificationTemplateCode } from '@/domain/types'

export interface TemplateVariables {
  empresa: string
  cnpj: string
  licenca: string
  orgao: string
  validade: ISODate | null
  dias: number | null
}

export interface RenderedMessage {
  subject: string
  text: string
}

const SUBJECTS: Record<NotificationTemplateCode, string> = {
  d90: '{{licenca}} de {{empresa}} vence em 90 dias',
  d60: '{{licenca}} de {{empresa}} vence em 60 dias',
  d30: '{{licenca}} de {{empresa}} vence em 30 dias',
  d15: '{{licenca}} de {{empresa}} vence em 15 dias',
  d7: 'Urgente: {{licenca}} de {{empresa}} vence em 7 dias',
  vencida: '{{licenca}} de {{empresa}} está vencida',
}

/** Template pela antecedência: menor marco (90/60/30/15/7) que ainda cobre os dias restantes. */
export function pickTemplate(daysRemaining: number | null, scheduleDays: readonly number[]): NotificationTemplateCode | null {
  if (daysRemaining === null) return null
  if (daysRemaining < 0) return 'vencida'
  const marks = scheduleDays.filter((d) => d > 0).sort((a, b) => a - b)
  const mark = marks.find((d) => daysRemaining <= d)
  if (!mark) return null
  const code = `d${mark}` as NotificationTemplateCode
  return code in SUBJECTS ? code : null
}

function fill(template: string, v: TemplateVariables) {
  return template
    .replaceAll('{{empresa}}', v.empresa)
    .replaceAll('{{licenca}}', v.licenca)
    .replaceAll('{{orgao}}', v.orgao)
    .replaceAll('{{cnpj}}', v.cnpj)
}

export function renderTemplate(code: NotificationTemplateCode, v: TemplateVariables): RenderedMessage {
  const situation =
    code === 'vencida'
      ? `está vencida desde ${formatDate(v.validade)}`
      : `vence em ${formatDate(v.validade)}${v.dias !== null ? ` (${v.dias} dias)` : ''}`
  return {
    subject: fill(SUBJECTS[code], v),
    text: [
      `Empresa: ${v.empresa} (CNPJ ${v.cnpj})`,
      `Licença: ${v.licenca} — ${v.orgao}`,
      `Situação: ${situation}.`,
      '',
      'Mensagem automática do Monitor de Licenças & Alvarás.',
    ].join('\n'),
  }
}
