import { ArrowLeft, Building, RotateCcw, SearchX } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { usePageMeta } from '@/app/page-meta'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { formatCnpj } from '@/domain/cnpj'
import { formatCnae, formatDateTime } from '@/domain/format'
import { APPLICABILITY_LABEL } from '@/domain/labels'
import { useCatalog } from '@/hooks/queries'
import { useSimulationRun } from '@/hooks/simulation-queries'
import { ApplyToCompanyModal } from './ApplyToCompanyModal'
import { ResultView } from './ResultView'
import type { SimulationPrefill } from './SimulationPage'

/** "Ver simulação anterior": mostra a cópia guardada, com as regras e versões usadas na época. */
export function SimulationRunPage() {
  const { id } = useParams()
  const { data: run, isLoading, error, refetch } = useSimulationRun(id)
  const { data: catalog } = useCatalog()
  const { can } = useSession()
  const navigate = useNavigate()
  const [applyOpen, setApplyOpen] = useState(false)
  usePageMeta(run ? `Simulação nº ${run.number}` : 'Simulação de Licenciamento', run ? `Realizada em ${formatDateTime(run.createdAt)} por ${run.userName}` : undefined)

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />
  if (isLoading) return <LoadingState />
  if (!run) {
    return (
      <Card className="mt-3">
        <EmptyState
          icon={SearchX}
          title="Simulação não encontrada"
          action={
            <Link to="/simulacao/historico" className="text-[13px] font-semibold text-primary hover:underline">
              Ver histórico
            </Link>
          }
        />
      </Card>
    )
  }

  const typeName = new Map((catalog?.licenseTypes ?? []).map((t) => [t.id, t.name]))
  const prefill: SimulationPrefill = {
    company: run.companyId && run.companyName && run.cnpj ? { id: run.companyId, name: run.companyName, cnpj: run.cnpj } : null,
    cnpj: run.cnpj,
    cnaes: run.cnaes,
    uf: run.uf,
    city: run.city,
  }

  return (
    <div className="flex flex-col gap-4 pt-[2px]">
      <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link to="/simulacao/historico" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-link hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Histórico
        </Link>
        <div className="min-w-0 flex-1 text-[12.5px] text-ink-soft">
          <p className="text-[13.5px] font-semibold text-ink">
            {run.companyId ? (
              <Link to={`/empresas/${run.companyId}`} className="text-link hover:underline">
                {run.companyName}
              </Link>
            ) : run.cnpj ? (
              `CNPJ ${formatCnpj(run.cnpj)}`
            ) : (
              'Simulação sem empresa vinculada'
            )}
          </p>
          <p>{run.cnaes.map((c) => formatCnae(c.code)).join(' · ')}</p>
        </div>
        {run.companyId && can('license:write') && (
          <Button size="sm" icon={<Building className="size-3.5" />} onClick={() => setApplyOpen(true)}>
            Aplicar resultado à empresa
          </Button>
        )}
        <Button size="sm" variant="secondary" icon={<RotateCcw className="size-3.5" />} onClick={() => navigate('/simulacao', { state: { prefill } })}>
          Simular novamente
        </Button>
      </Card>

      {run.applications.length > 0 && (
        <Card className="px-4 py-3">
          <p className="text-[13px] font-bold text-ink">Resultado aplicado à empresa</p>
          <ul className="mt-1 space-y-1 text-[12.5px] text-ink-soft">
            {run.applications.map((a) => (
              <li key={a.id}>
                {formatDateTime(a.appliedAt)} por {a.appliedByName}:{' '}
                {a.changes.length === 0 ? 'nenhuma alteração.' : a.changes.map((c) => `${typeName.get(c.licenseTypeId) ?? 'Licença'} → ${APPLICABILITY_LABEL[c.applicability]}`).join('; ')}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ResultView result={run.result} />
      <ApplyToCompanyModal run={run} open={applyOpen} onClose={() => setApplyOpen(false)} />
    </div>
  )
}
