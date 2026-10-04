import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { useMemo, useState } from 'react'
import { usePageMeta } from '@/app/page-meta'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Form'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { addDays, todayISO } from '@/domain/dates'
import { useChanges, useCompanies, useConsultations, useMonitor } from '@/hooks/queries'
import { downloadText } from '@/lib/download'
import { cn } from '@/lib/cn'
import { buildReport, REPORTS, toCsv, type ReportId } from '@/services/reports'

export function ReportsPage() {
  usePageMeta('Relatórios', 'Regularidade, vencimentos, histórico e alterações')
  const [reportId, setReportId] = useState<ReportId>('regularidade-geral')
  const [from, setFrom] = useState(addDays(todayISO(), -30))
  const [to, setTo] = useState(addDays(todayISO(), 60))
  const { catalog, overviews, isLoading, error, refetch } = useMonitor()
  const { data: companies } = useCompanies()
  const definition = REPORTS.find((r) => r.id === reportId)!
  const needsHistory = reportId === 'historico-consultas' || reportId === 'alteracoes-detectadas'
  const consultations = useConsultations({}, needsHistory)
  const changes = useChanges({})

  const table = useMemo(() => {
    if (!catalog || !overviews) return null
    return buildReport(reportId, {
      overviews,
      companies: companies ?? [],
      sectors: catalog.sectors,
      licenseTypes: catalog.licenseTypes,
      consultations: consultations.data ?? [],
      changes: changes.data ?? [],
      period: { from, to },
    })
  }, [reportId, catalog, overviews, companies, consultations.data, changes.data, from, to])

  if (error) return <ErrorState error={error} onRetry={refetch} />

  return (
    <div className="mt-[9px] grid grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="p-2">
        <nav aria-label="Relatórios">
          <ul className="flex flex-col gap-0.5">
            {REPORTS.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setReportId(r.id)}
                  aria-current={r.id === reportId || undefined}
                  className={cn('w-full rounded-lg px-3 py-2 text-left transition-colors', r.id === reportId ? 'bg-primary-soft' : 'hover:bg-[#f3f7fc]')}
                >
                  <span className={cn('block text-[13px] font-semibold', r.id === reportId ? 'text-primary' : 'text-ink')}>{r.title}</span>
                  <span className="block text-[11.5px] text-muted">{r.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </Card>

      <Card className="p-[14px]">
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-bold text-ink">{definition.title}</h2>
            <p className="text-[12.5px] text-muted">{definition.description}</p>
          </div>
          {definition.usesPeriod && (
            <>
              <label className="flex items-center gap-1.5 text-[12px] text-ink-soft">
                De <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
              </label>
              <label className="flex items-center gap-1.5 text-[12px] text-ink-soft">
                até <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
              </label>
            </>
          )}
          <Button
            variant="secondary"
            icon={<Download className="size-4" />}
            disabled={!table?.rows.length}
            onClick={() => table && downloadText(toCsv(table), `${reportId}-${todayISO()}.csv`)}
          >
            CSV
          </Button>
          <Button variant="secondary" icon={<FileSpreadsheet className="size-4" />} disabled title="Exportação para Excel (.xlsx) em preparação">
            Excel
          </Button>
          <Button variant="secondary" icon={<FileText className="size-4" />} disabled title="Exportação em PDF em preparação">
            PDF
          </Button>
        </div>

        {isLoading || !table || (needsHistory && consultations.isLoading) ? (
          <LoadingState />
        ) : table.rows.length === 0 ? (
          <EmptyState title="Nada a exibir" description="Nenhum registro para este relatório no momento." />
        ) : (
          <TableFrame className="mt-3">
            <Table className="text-[12.5px]">
              <THead>
                <tr className="h-[36px]">
                  {table.columns.map((c) => (
                    <TH key={c.key} className={c.align === 'right' ? 'text-right' : undefined}>
                      {c.label}
                    </TH>
                  ))}
                </tr>
              </THead>
              <tbody>
                {table.rows.map((row, i) => (
                  <TR key={i} className="h-[34px]">
                    {table.columns.map((c) => (
                      <TD key={c.key} className={cn(c.align === 'right' && 'tabular text-right')}>
                        {row[c.key]}
                      </TD>
                    ))}
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableFrame>
        )}
        <p className="mt-3 text-[11.5px] text-muted">
          {table ? `${table.rows.length} linha(s). ` : ''}CSV abre diretamente no Excel. Exportação nativa para Excel e PDF está preparada na camada de relatórios
          (services/reports.ts) e será ligada numa próxima etapa.
        </p>
      </Card>
    </div>
  )
}
