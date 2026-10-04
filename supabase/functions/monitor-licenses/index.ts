// Edge Function: rotina diária de monitoramento de licenças.
// Antes do deploy: `npm run build:edge` (gera ../_shared/monitoring.js a partir de src/).
// Agendamento (Supabase Cron): ver README, seção "Rotina automática".
//
// Variáveis (Dashboard → Edge Functions → Secrets):
//   CRON_SECRET          segredo exigido no cabeçalho Authorization
//   RESEND_API_KEY       opcional — habilita o envio de e-mails
//   NOTIFY_EMAIL_FROM    remetente verificado no Resend (ex.: "Alvarás <avisos@seudominio.com.br>")
//   NOTIFY_EMAIL_TO      destinatários separados por vírgula
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são fornecidas automaticamente pelo Supabase.
import { runServerMonitoring } from '../_shared/monitoring.js'

Deno.serve(async (request: Request) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) {
    return new Response('Não autorizado', { status: 401 })
  }

  try {
    const report = await runServerMonitoring({
      supabaseUrl: Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      email: {
        apiKey: Deno.env.get('RESEND_API_KEY'),
        from: Deno.env.get('NOTIFY_EMAIL_FROM'),
        to: (Deno.env.get('NOTIFY_EMAIL_TO') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      },
    })
    return Response.json(report)
  } catch (error) {
    console.error('[monitor-licenses]', error)
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
})
