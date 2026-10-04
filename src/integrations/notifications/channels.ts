import type { NotificationLogRepository } from '@/data/types'
import type { Alert, NotificationChannelKind, NotificationTemplateCode } from '@/domain/types'
import type { RenderedMessage } from './templates'

export interface NotificationRequest {
  alert: Alert
  template: NotificationTemplateCode | null
  message: RenderedMessage
  recipient: string | null
}

export interface NotificationChannel {
  readonly kind: NotificationChannelKind
  readonly enabled: boolean
  send(request: NotificationRequest): Promise<'enviado' | 'ignorado' | 'falha'>
}

/** Notificação interna: o próprio alerta já aparece no sino e na Central de Alertas. */
export function createInAppChannel(): NotificationChannel {
  return { kind: 'interna', enabled: true, send: async () => 'enviado' }
}

/**
 * E-mail no navegador: apenas registra a intenção. O envio real usa `createResendEmailChannel`
 * (./resend.ts) dentro da Edge Function `monitor-licenses`, onde fica a RESEND_API_KEY.
 */
export function createEmailChannel(options: { configured: boolean }): NotificationChannel {
  return {
    kind: 'email',
    enabled: options.configured,
    send: async () => 'ignorado',
  }
}

/** WhatsApp: desativado até existir provedor e credenciais oficiais. */
export function createWhatsAppChannel(): NotificationChannel {
  return { kind: 'whatsapp', enabled: false, send: async () => 'ignorado' }
}

export async function dispatchNotification(
  channels: readonly NotificationChannel[],
  logs: NotificationLogRepository,
  request: NotificationRequest,
): Promise<number> {
  let sent = 0
  for (const channel of channels) {
    const status = channel.enabled ? await channel.send(request).catch(() => 'falha' as const) : 'ignorado'
    if (status === 'enviado') sent += 1
    await logs.create({
      alertId: request.alert.id,
      channel: channel.kind,
      template: request.template,
      recipient: request.recipient,
      status,
      error: channel.enabled ? null : 'Canal não configurado',
    })
  }
  return sent
}
