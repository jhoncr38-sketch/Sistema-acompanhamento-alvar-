import { Bell } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { useDataSource } from '@/app/data-context'
import { useSession } from '@/app/session'
import { Popover } from '@/components/ui/Popover'
import { formatDateTime } from '@/domain/format'
import type { AlertPriority } from '@/domain/types'
import { useAlerts, useInvalidate } from '@/hooks/queries'
import { cn } from '@/lib/cn'

const DOT: Record<AlertPriority, string> = {
  critica: 'bg-danger',
  alta: 'bg-danger',
  media: 'bg-warn',
  baixa: 'bg-neutral',
}

export function NotificationBell() {
  const { data } = useAlerts({ status: 'aberto' })
  const ds = useDataSource()
  const { can } = useSession()
  const invalidate = useInvalidate()
  const navigate = useNavigate()
  const unread = data ?? []

  return (
    <Popover
      className="w-[min(360px,calc(100vw-2rem))]"
      trigger={({ toggle, ...aria }) => (
        <button
          type="button"
          onClick={toggle}
          {...aria}
          aria-label={unread.length ? `Notificações: ${unread.length} não lidas` : 'Notificações'}
          className="relative grid size-10 place-items-center rounded-full text-[#1d3a66] hover:bg-white/70"
        >
          <Bell className="size-[23px] fill-[#1d3a66]" strokeWidth={1.6} />
          {unread.length > 0 && (
            <span className="absolute top-[3px] right-[4px] grid h-[17px] min-w-[17px] place-items-center rounded-full border-2 border-canvas bg-danger px-1 text-[10px] leading-none font-bold text-white">
              {unread.length > 99 ? '99+' : unread.length}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[14px] font-bold text-ink">Notificações</p>
            <span className="text-[12px] text-muted">{unread.length} não lida(s)</span>
          </div>
          {unread.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-muted">Nenhuma notificação nova.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {unread.slice(0, 8).map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-[#f3f7fc]"
                    onClick={async () => {
                      close()
                      navigate(`/empresas/${a.companyId}${a.companyLicenseId ? `?licenca=${a.companyLicenseId}` : ''}`)
                      if (can('alert:manage')) {
                        await ds.alerts.markRead(a.id).catch(() => undefined)
                        void invalidate.alerts()
                      }
                    }}
                  >
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', DOT[a.priority])} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-semibold text-ink">{a.title}</span>
                      <span className="line-clamp-2 block text-[11.5px] text-muted">{a.message}</span>
                      <span className="mt-0.5 block text-[10.5px] text-muted">{formatDateTime(a.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link to="/alertas" onClick={close} className="block border-t border-line px-4 py-2.5 text-center text-[12.5px] font-semibold text-primary hover:bg-[#f3f7fc]">
            Abrir Central de Alertas
          </Link>
        </div>
      )}
    </Popover>
  )
}
