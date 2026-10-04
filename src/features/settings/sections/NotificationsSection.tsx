import { Bell, Mail, MessageCircle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { CatalogSnapshot } from '@/data/types'
import { formatDate } from '@/domain/format'
import { addDays, todayISO } from '@/domain/dates'
import type { NotificationTemplateCode } from '@/domain/types'
import { useNotificationLogs } from '@/hooks/queries'
import { renderTemplate } from '@/integrations/notifications/templates'
import { SectionHeader } from './SectionHeader'

const TEMPLATES: { code: NotificationTemplateCode; days: number }[] = [
  { code: 'd90', days: 90 },
  { code: 'd60', days: 60 },
  { code: 'd30', days: 30 },
  { code: 'd15', days: 15 },
  { code: 'd7', days: 7 },
  { code: 'vencida', days: -1 },
]

export function NotificationsSection({ catalog }: { catalog: CatalogSnapshot; readOnly: boolean }) {
  const { data: logs } = useNotificationLogs()
  const today = todayISO()

  return (
    <div>
      <SectionHeader title="Notificações" description="Canais e modelos de aviso de vencimento." />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Channel icon={<Bell className="size-5" />} title="Notificação interna" status={<Badge tone="ok">ATIVA</Badge>} text="Alertas no sino e na Central de Alertas." />
        <Channel
          icon={<Mail className="size-5" />}
          title="E-mail (Resend)"
          status={<Badge tone="warn">AGUARDANDO CONFIGURAÇÃO</Badge>}
          text="Enviado pela rotina no servidor (Edge Function monitor-licenses) quando RESEND_API_KEY e destinatários estiverem configurados."
        />
        <Channel icon={<MessageCircle className="size-5" />} title="WhatsApp" status={<Badge tone="neutral">FUTURO</Badge>} text="Depende de provedor e credenciais oficiais." />
      </div>

      <h3 className="mt-6 mb-2 text-[13px] font-bold tracking-wide text-ink uppercase">Agenda de avisos</h3>
      <p className="text-[12.5px] text-ink-soft">
        {catalog.settings.notificationScheduleDays
          .filter((d) => d > 0)
          .map((d) => `${d} dias`)
          .join(' · ')}{' '}
        · no vencimento
      </p>

      <h3 className="mt-6 mb-2 text-[13px] font-bold tracking-wide text-ink uppercase">Modelos</h3>
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {TEMPLATES.map((t) => {
          const msg = renderTemplate(t.code, {
            empresa: 'Padaria Central LTDA',
            cnpj: '00.000.000/0001-00',
            licenca: 'Alvará de Funcionamento',
            orgao: 'Prefeitura',
            validade: addDays(today, t.days),
            dias: t.days >= 0 ? t.days : null,
          })
          return (
            <li key={t.code} className="rounded-lg border border-line p-3">
              <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{t.code === 'vencida' ? 'Vencida' : `${t.days} dias`}</p>
              <p className="mt-0.5 text-[13px] font-semibold text-ink">{msg.subject}</p>
              <pre className="mt-1 font-sans text-[11.5px] whitespace-pre-wrap text-ink-soft">{msg.text}</pre>
            </li>
          )
        })}
      </ul>

      <h3 className="mt-6 mb-2 text-[13px] font-bold tracking-wide text-ink uppercase">Últimos registros de envio</h3>
      {!logs?.length ? (
        <p className="text-[12.5px] text-muted">Nenhum envio registrado.</p>
      ) : (
        <ul className="space-y-1 text-[12px] text-ink-soft">
          {logs.slice(0, 10).map((l) => (
            <li key={l.id}>
              {formatDate(l.createdAt.slice(0, 10))} · {l.channel} · {l.template ?? '—'} · {l.status}
              {l.error && ` (${l.error})`}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Channel({ icon, title, status, text }: { icon: React.ReactNode; title: string; status: React.ReactNode; text: string }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <p className="text-[13px] font-semibold text-ink">{title}</p>
      </div>
      <div className="mt-2">{status}</div>
      <p className="mt-2 text-[12px] text-ink-soft">{text}</p>
    </div>
  )
}
