import { ChevronRight, PartyPopper } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/States'
import type { AttentionItem, AttentionTone } from '@/domain/monitoring'
import { cn } from '@/lib/cn'

const DOT: Record<AttentionTone, string> = {
  danger: 'bg-danger',
  orange: 'bg-[#f5710f]',
  yellow: 'bg-[#f6c000]',
}

const INITIAL = 9

export function AttentionToday({ items }: { items: AttentionItem[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, INITIAL)

  return (
    <Card className="p-[14px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-bold tracking-wide text-ink uppercase">Atenção hoje</h2>
          <p className="text-[12.5px] text-muted">Situações prioritárias, das mais críticas para as menos críticas.</p>
        </div>
        <Link to="/alertas" className="text-[12.5px] font-medium text-link hover:underline">
          Central de Alertas
        </Link>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={PartyPopper} title="Nenhuma pendência hoje" description="Todas as licenças monitoradas estão regulares." />
      ) : (
        <>
          <ul className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {visible.map((item) => (
              <li key={item.key}>
                <Link
                  to={`/empresas/${item.companyId}?licenca=${item.companyLicenseId}`}
                  className="group flex items-center gap-3 rounded-lg border border-line px-3 py-2 transition-colors hover:border-primary-line hover:bg-[#f5f9ff]"
                >
                  <span className={cn('size-3 shrink-0 rounded-full', DOT[item.tone])} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">{item.companyName}</span>
                    <span className="block truncate text-[12.5px] text-ink-soft">{item.message}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted group-hover:text-primary" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {items.length > INITIAL && (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 text-[12.5px] font-medium text-link hover:underline">
              {expanded ? 'Mostrar menos' : `Ver todas (${items.length})`}
            </button>
          )}
        </>
      )}
    </Card>
  )
}
