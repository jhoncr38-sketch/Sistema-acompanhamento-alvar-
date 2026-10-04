import { ClipboardList, Eye } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { usePageMeta } from '@/app/page-meta'
import { Card } from '@/components/ui/Card'
import { SearchInput } from '@/components/ui/Form'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { STATUS_TONE, TONE } from '@/config/simulation'
import { formatCnpj } from '@/domain/cnpj'
import { formatCnae, formatDate, formatDateTime } from '@/domain/format'
import { CONFIDENCE_LABEL, STATUS_LABEL } from '@/domain/simulation/labels'
import type { SimulationRunSummary } from '@/domain/simulation/types'
import { useSimulationRuns } from '@/hooks/simulation-queries'
import { cn } from '@/lib/cn'
import { SimulationNav } from './SimulationPage'

const PAGE_SIZE = 15

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function RunResultBadge({ run }: { run: Pick<SimulationRunSummary, 'overallStatus' | 'classificationName' | 'classificationTone'> }) {
  const classified = run.overallStatus === 'classificada' && run.classificationName
  const tone = classified ? (run.classificationTone ?? 'gray') : STATUS_TONE[run.overallStatus === 'classificada' ? 'necessita_analise' : run.overallStatus]
  const label = classified ? run.classificationName : STATUS_LABEL[run.overallStatus === 'classificada' ? 'necessita_analise' : run.overallStatus]
  return <span className={cn('inline-flex h-[22px] items-center rounded-md px-2 text-[12px] font-bold whitespace-nowrap', TONE[tone].soft, TONE[tone].text)}>{label}</span>
}

export function SimulationHistoryPage() {
  usePageMeta('Simulação de Licenciamento', 'Histórico das simulações realizadas — cada simulação fica guardada com as regras e versões usadas.')
  const [params] = useSearchParams()
  const companyId = params.get('empresa') ?? undefined
  const { data, isLoading, error, refetch } = useSimulationRuns({ companyId })
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const rows = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return data ?? []
    return (data ?? []).filter((r) =>
      normalize(`${r.number} ${r.companyName ?? ''} ${r.cnpj ?? ''} ${r.userName} ${r.city} ${r.cnaes.map((c) => `${c.code} ${formatCnae(c.code)} ${c.description ?? ''}`).join(' ')}`).includes(q),
    )
  }, [data, query])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  return (
    <div className="pt-[2px]">
      <SimulationNav current="historico" />
      <Card className="p-[14px]">
        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v)
            setPage(1)
          }}
          label="Pesquisar simulações"
          placeholder="Pesquisar por nº, empresa, CNPJ, CNAE ou usuário..."
          className="max-w-md"
        />
        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isLoading ? (
          <LoadingState />
        ) : pageRows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Nenhuma simulação encontrada"
            description="Cada simulação realizada é salva aqui automaticamente."
            action={
              <Link to="/simulacao" className="text-[13px] font-semibold text-primary hover:underline">
                Fazer uma simulação
              </Link>
            }
          />
        ) : (
          <TableFrame className="mt-3">
            <Table className="text-[12.5px]">
              <THead>
                <tr className="h-[36px]">
                  <TH>Nº</TH>
                  <TH>Data e hora</TH>
                  <TH>Usuário</TH>
                  <TH>Empresa / CNPJ</TH>
                  <TH>CNAEs analisados</TH>
                  <TH>Localidade</TH>
                  <TH>Referência</TH>
                  <TH>Resultado</TH>
                  <TH>Qualidade da regra</TH>
                  <TH className="text-center">Ações</TH>
                </tr>
              </THead>
              <tbody>
                {pageRows.map((r) => (
                  <TR key={r.id} className="h-[38px] hover:bg-[#f7faff]">
                    <TD className="tabular font-semibold text-ink">{r.number}</TD>
                    <TD className="tabular whitespace-nowrap">{formatDateTime(r.createdAt)}</TD>
                    <TD className="whitespace-nowrap">{r.userName}</TD>
                    <TD>
                      {r.companyId ? (
                        <Link to={`/empresas/${r.companyId}`} className="text-link hover:underline">
                          {r.companyName}
                        </Link>
                      ) : r.cnpj ? (
                        <span className="tabular">{formatCnpj(r.cnpj)}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TD>
                    <TD className="tabular" title={r.cnaes.map((c) => `${formatCnae(c.code)} ${c.description ?? ''}`).join('\n')}>
                      {r.cnaes
                        .slice(0, 3)
                        .map((c) => formatCnae(c.code))
                        .join(', ')}
                      {r.cnaes.length > 3 && ` +${r.cnaes.length - 3}`}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {r.city} – {r.uf}
                    </TD>
                    <TD className="tabular">{formatDate(r.referenceDate)}</TD>
                    <TD>
                      <RunResultBadge run={r} />
                    </TD>
                    <TD className="whitespace-nowrap text-ink-soft">{CONFIDENCE_LABEL[r.confidence].title}</TD>
                    <TD className="text-center">
                      <Link
                        to={`/simulacao/${r.id}`}
                        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-semibold text-primary hover:bg-primary-soft"
                        aria-label={`Ver simulação nº ${r.number}`}
                      >
                        <Eye className="size-4" aria-hidden /> Ver
                      </Link>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableFrame>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-ink-soft">
            {rows.length} {rows.length === 1 ? 'simulação' : 'simulações'}
            {companyId && ' desta empresa'}
          </p>
          <Pagination page={current} totalPages={totalPages} onChange={setPage} />
        </div>
      </Card>
    </div>
  )
}
