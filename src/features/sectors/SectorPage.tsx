import { SearchX } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router'
import { usePageMeta } from '@/app/page-meta'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { countHealth } from '@/domain/monitoring'
import { useMonitor } from '@/hooks/queries'
import { MonitorWorkspace } from './MonitorWorkspace'

export function SectorPage() {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const { catalog, overviews, isLoading, error, refetch } = useMonitor()
  const sector = catalog?.sectors.find((s) => s.slug === slug)
  const counts = sector && overviews ? countHealth(overviews.filter((o) => o.monitored && o.company.sectorId === sector.id)) : null

  usePageMeta(
    sector ? `Monitor de Licenças · ${sector.name}` : 'Monitor de Licenças',
    counts ? `${counts.regular} regulares · ${counts.atencao} em atenção · ${counts.pendencia} com pendência` : undefined,
  )

  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (isLoading || !catalog || !overviews) return <LoadingState />
  if (!sector) {
    return (
      <Card className="mt-3">
        <EmptyState
          icon={SearchX}
          title="Setor não encontrado"
          action={
            <Link to="/" className="text-[13px] font-semibold text-primary hover:underline">
              Voltar ao Dashboard
            </Link>
          }
        />
      </Card>
    )
  }

  return (
    <MonitorWorkspace
      key={sector.id}
      className="pt-[2px]"
      sector={sector}
      overviews={overviews}
      catalog={catalog}
      selectedCompanyId={params.get('empresa')}
      onSelectCompany={(id) => setParams({ empresa: id }, { replace: true })}
    />
  )
}
