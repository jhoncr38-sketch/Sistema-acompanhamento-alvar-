import { CalendarDays, Clock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, IconTile } from '@/components/ui/Card'
import { SolidBuildingIcon } from '@/components/ui/SolidIcons'
import { SolidStatusIcon } from '@/components/ui/StatusIcon'
import type { DashboardMetrics } from '@/domain/monitoring'
import { cn } from '@/lib/cn'

interface Kpi {
  key: keyof DashboardMetrics
  label: string
  hint: string
  number: string
  tile: string
  icon: ReactNode
}

const KPIS: Kpi[] = [
  {
    key: 'monitoredCompanies',
    label: 'Empresas monitoradas',
    hint: 'Empresas ativas ou em implantação',
    number: 'text-[#0c366c]',
    tile: 'bg-[#e4eaf6]',
    icon: <SolidBuildingIcon className="size-[30px] text-[#123d73]" />,
  },
  {
    key: 'expiredLicenses',
    label: 'Licenças vencidas',
    hint: 'Licenças aplicáveis com validade expirada',
    number: 'text-[#f00c18]',
    tile: 'bg-[#fdeceb]',
    icon: <SolidStatusIcon tone="danger" glyph="alert" size={30} />,
  },
  {
    key: 'expiringWithin30',
    label: 'Vencem em até 30 dias',
    hint: 'Licenças válidas que vencem nos próximos 30 dias',
    number: 'text-[#f66c06]',
    tile: 'bg-[#fff1dc]',
    icon: <Clock className="size-[31px] text-[#f5890f]" strokeWidth={2.3} />,
  },
  {
    key: 'expiringWithin60',
    label: 'Vencem em até 60 dias',
    hint: 'Licenças válidas que vencem nos próximos 60 dias (inclui as de 30 dias)',
    number: 'text-[#f6a200]',
    tile: 'bg-[#fef6dc]',
    icon: <CalendarDays className="size-[30px] text-[#f2a40e]" strokeWidth={2.2} />,
  },
  {
    key: 'fullyRegularCompanies',
    label: 'Totalmente regulares',
    hint: 'Empresas com todas as licenças aplicáveis regulares',
    number: 'text-[#06964e]',
    tile: 'bg-[#dcf5ea]',
    icon: <SolidStatusIcon tone="ok" glyph="check" size={30} />,
  },
]

export function KpiCards({ metrics }: { metrics: DashboardMetrics | undefined }) {
  return (
    <section aria-label="Indicadores" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
      {KPIS.map((kpi) => (
        <Card key={kpi.key} className="flex h-[74px] items-center gap-3 px-3 last:col-span-2 sm:last:col-span-1 2xl:gap-4" title={kpi.hint}>
          <IconTile className={cn('size-[44px] 2xl:size-[50px]', kpi.tile)}>{kpi.icon}</IconTile>
          <div className="min-w-0">
            <p className={cn('tabular text-[24px] leading-none font-bold 2xl:text-[26px]', kpi.number)}>
              {metrics ? metrics[kpi.key] : <span className="inline-block h-6 w-8 animate-pulse rounded bg-[#e6edf6]" />}
            </p>
            <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-tight text-ink-soft 2xl:text-[13.5px]">{kpi.label}</p>
          </div>
        </Card>
      ))}
    </section>
  )
}
