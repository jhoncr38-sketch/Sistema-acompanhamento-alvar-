import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { usePageMeta } from '@/app/page-meta'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { brand } from '@/config/brand'
import { buildAttentionList, computeDashboardMetrics, computeSectorSummaries } from '@/domain/monitoring'
import { useMonitor } from '@/hooks/queries'
import { MonitorWorkspace } from '../sectors/MonitorWorkspace'
import { AttentionToday } from './AttentionToday'
import { KpiCards } from './KpiCards'
import { SectorCards } from './SectorCards'

export function DashboardPage() {
  usePageMeta(brand.moduleName, 'Acompanhe a regularidade das empresas por setor')
  const { catalog, overviews, error, refetch } = useMonitor()
  const [params, setParams] = useSearchParams()

  const metrics = useMemo(() => (overviews && catalog ? computeDashboardMetrics(overviews, catalog.settings) : undefined), [overviews, catalog])
  const summaries = useMemo(() => (overviews && catalog ? computeSectorSummaries(catalog.sectors, overviews) : []), [overviews, catalog])
  const attention = useMemo(() => (overviews ? buildAttentionList(overviews) : []), [overviews])

  const selectedSlug = params.get('setor') ?? summaries[0]?.sector.slug ?? null
  const sector = summaries.find((s) => s.sector.slug === selectedSlug)?.sector ?? summaries[0]?.sector

  if (error) return <ErrorState error={error} onRetry={refetch} />

  return (
    <div className="flex flex-col gap-4 pt-[2px]">
      <KpiCards metrics={metrics} />

      {summaries.length === 0 ? (
        <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[255px] rounded-xl" />
          ))}
        </div>
      ) : (
        <SectorCards
          summaries={summaries}
          selectedSlug={sector?.slug ?? null}
          onSelect={(s) => {
            setParams({ setor: s.slug }, { replace: true })
            document.getElementById('monitor-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          }}
        />
      )}

      <div id="monitor-workspace" className="scroll-mt-4">
        {sector && catalog && overviews ? (
          <MonitorWorkspace
            key={sector.id}
            sector={sector}
            overviews={overviews}
            catalog={catalog}
            selectedCompanyId={params.get('empresa')}
            onSelectCompany={(id) => setParams({ setor: sector.slug, empresa: id }, { replace: true })}
          />
        ) : (
          <div className="grid grid-cols-1 gap-[10px] min-[1440px]:grid-cols-[minmax(0,1.33fr)_minmax(0,1fr)]">
            <Skeleton className="h-[568px] rounded-xl" />
            <Skeleton className="h-[568px] rounded-xl" />
          </div>
        )}
      </div>

      {overviews && <AttentionToday items={attention} />}
    </div>
  )
}
