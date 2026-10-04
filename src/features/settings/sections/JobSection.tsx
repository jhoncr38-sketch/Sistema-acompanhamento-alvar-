import { ArrowDown, Play } from 'lucide-react'
import { useState } from 'react'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/data/errors'
import { formatDateTime } from '@/domain/format'
import { useInvalidate } from '@/hooks/queries'
import { useConsultationContext } from '@/hooks/useConsultationContext'
import { createEmailChannel, createInAppChannel, createWhatsAppChannel } from '@/integrations/notifications/channels'
import { runMonitoringCycle, type MonitoringCycleReport } from '@/services/monitoring-job'
import { SectionHeader } from './SectionHeader'

const STEPS = [
  'Empresas ativas',
  'Licenças monitoradas',
  'Consultar fonte',
  'Salvar resultado',
  'Comparar com resultado anterior',
  'Detectar alteração',
  'Atualizar status',
  'Gerar alerta',
  'Notificar quando necessário',
]

export function JobSection() {
  const ctx = useConsultationContext()
  const { can } = useSession()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<MonitoringCycleReport | null>(null)

  async function run() {
    if (!ctx) return
    setRunning(true)
    try {
      const r = await runMonitoringCycle(ctx, [createInAppChannel(), createEmailChannel({ configured: false }), createWhatsAppChannel()])
      setReport(r)
      await invalidate.all()
      toast.success('Rotina executada', `${r.alertsCreated} novo(s) alerta(s).`)
    } catch (error) {
      toast.error('Falha na rotina', errorMessage(error))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <SectionHeader
        title="Rotina automática"
        description="No servidor, a rotina roda diariamente (Supabase Cron + Edge Function monitor-licenses). Aqui é possível executá-la sob demanda."
        actions={
          can('alert:manage') && (
            <Button icon={<Play className="size-4" />} onClick={run} loading={running}>
              Executar rotina agora
            </Button>
          )
        }
      />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
        <ol className="flex flex-col items-stretch">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-col items-center">
              <span className="w-full rounded-lg border border-line bg-[#f6f9fc] px-3 py-1.5 text-center text-[12.5px] font-semibold text-ink">{s}</span>
              {i < STEPS.length - 1 && <ArrowDown className="my-0.5 size-4 text-muted" aria-hidden />}
            </li>
          ))}
        </ol>
        <div>
          {report ? (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(
                [
                  ['Empresas', report.companies],
                  ['Licenças monitoradas', report.licenses],
                  ['Consultadas', report.consulted],
                  ['Integração pendente', report.integrationPending],
                  ['Erros', report.errors],
                  ['Alterações', report.changes],
                  ['Alertas criados', report.alertsCreated],
                  ['Notificações enviadas', report.notificationsSent],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line p-3">
                  <dt className="text-[11.5px] text-muted">{label}</dt>
                  <dd className="tabular text-[20px] font-bold text-ink">{value}</dd>
                </div>
              ))}
              <p className="col-span-full text-[11.5px] text-muted">Executada em {formatDateTime(report.finishedAt)}.</p>
            </dl>
          ) : (
            <p className="text-[12.5px] text-ink-soft">
              Sem integrações oficiais ativas, a rotina não consulta nenhum órgão: ela reavalia os vencimentos com base nas últimas consultas registradas, gera os
              alertas necessários (sem duplicar os que já estão abertos) e registra as notificações.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
