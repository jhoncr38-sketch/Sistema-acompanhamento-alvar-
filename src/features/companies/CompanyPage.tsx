import { ArrowLeft, SearchX } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router'
import { usePageMeta } from '@/app/page-meta'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { useMonitor } from '@/hooks/queries'
import { CompanyPanel } from './CompanyPanel'

export function CompanyPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { catalog, overviews, isLoading, error, refetch } = useMonitor()
  const overview = overviews?.find((o) => o.company.id === id)
  usePageMeta(overview?.company.legalName ?? 'Empresa', overview?.sector ? `Perfil da empresa · ${overview.sector.name}` : 'Perfil da empresa')

  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (isLoading || !catalog || !overviews) return <LoadingState />
  if (!overview) {
    return (
      <Card className="mt-3">
        <EmptyState icon={SearchX} title="Empresa não encontrada" description="Ela pode ter sido excluída." action={<Link to="/empresas" className="text-[13px] font-semibold text-primary hover:underline">Ver empresas</Link>} />
      </Card>
    )
  }

  return (
    <div className="mt-[9px] flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <Link to="/empresas" className="inline-flex items-center gap-1.5 font-medium text-link hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Empresas
        </Link>
        {overview.sector && (
          <Link to={`/monitor/${overview.sector.slug}?empresa=${overview.company.id}`} className="font-medium text-link hover:underline">
            Ver no Monitor de {overview.sector.name}
          </Link>
        )}
      </div>
      <CompanyPanel overview={overview} catalog={catalog} highlightLicenseId={params.get('licenca')} className="mx-auto w-full max-w-5xl" />
    </div>
  )
}
