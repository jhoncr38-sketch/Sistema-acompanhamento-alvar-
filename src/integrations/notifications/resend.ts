import type { NotificationChannel } from './channels'

/**
 * Canal de e-mail via Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Uso EXCLUSIVO no servidor (Edge Function): a chave nunca vai para o navegador.
 */
export function createResendEmailChannel(options: { apiKey: string | undefined; from: string | undefined; to: string[] }): NotificationChannel {
  const enabled = Boolean(options.apiKey && options.from && options.to.length > 0)
  return {
    kind: 'email',
    enabled,
    async send(request) {
      if (!enabled) return 'ignorado'
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: options.from, to: options.to, subject: request.message.subject, text: request.message.text }),
      })
      return response.ok ? 'enviado' : 'falha'
    },
  }
}
