import { CalendarDays, RefreshCw, RotateCw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useSession } from '@/app/session'
import { LicenseStatusLabel } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconTile } from '@/components/ui/Card'
import { ProgressRing } from '@/components/ui/ProgressRing'
import { Skeleton } from '@/components/ui/States'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import type { CatalogSnapshot } from '@/data/types'
import { formatDate, formatDateTime } from '@/domain/format'
import type { CompanyOverview } from '@/domain/monitoring'
import type { CompanyLicense } from '@/domain/types'
import { useConsultations } from '@/hooks/queries'
import { cn } from '@/lib/cn'
import { ConsultationResult } from '../../consultations/ConsultationResult'
import { agencyLabel, evaluationTitle, providerLabel } from '../../licenses/license-labels'

export function SummaryTab({
  overview,
  catalog,
  highlightLicenseId,
  onConsult,
  onConsultAll,
  onShowHistory,
}: {
  overview: CompanyOverview
  catalog: CatalogSnapshot
  highlightLicenseId: string | null
  onConsult: (license: CompanyLicense) => void
  onConsultAll: () => void
  onShowHistory: () => void
}) {
  const { company, licenses } = overview
  const { data: consultations, isLoading } = useConsultations({ companyId: company.id, limit: 3 })
  const typeShort = new Map(catalog.licenseTypes.map((t) => [t.id, t.shortName]))
  const highlightRef = useRef<HTMLTableRowElement>(null)
  const { can } = useSession()

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [highlightLicenseId])

  return (
    <div className="flex flex-col">
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex h-[86px] items-center gap-4 rounded-xl border border-line px-3">
          <ProgressRing value={overview.regularityIndex} />
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-ink">Índice de Regularidade</p>
            <p className="mt-2 text-[11.5px] text-ink-soft">Regularidade geral da empresa</p>
          </div>
        </div>
        <div className="flex h-[86px] items-center gap-3.5 rounded-xl border border-line px-3">
          <IconTile className="size-[42px] bg-[#e3eefc]">
            <CalendarDays className="size-[22px] text-primary" strokeWidth={2.2} />
          </IconTile>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] text-ink-soft">Última verificação</p>
            <p className="tabular text-[13.5px] font-bold text-ink">
              {overview.lastCheckedAt ? formatDateTime(overview.lastCheckedAt).replace(' ', ' às ') : 'Nenhuma consulta'}
            </p>
            <Button size="xs" className="mt-1 h-[26px] w-full text-[11.5px]" icon={<RefreshCw className="size-3.5" strokeWidth={2.6} />} onClick={onConsultAll}>
              Consultar todas as licenças
            </Button>
          </div>
        </div>
      </div>

      <TableFrame className="mt-2">
        <Table className="text-[11.5px]">
          <THead>
            <tr className="h-[30px]">
              <TH>Licença / Órgão</TH>
              <TH>Situação</TH>
              <TH>Validade</TH>
              <TH>Fonte</TH>
              <TH>Ação</TH>
            </tr>
          </THead>
          <tbody>
            {licenses.map((e) => {
              const na = e.license.applicability === 'nao_aplicavel'
              const highlighted = e.license.id === highlightLicenseId
              return (
                <TR key={e.license.id} ref={highlighted ? highlightRef : undefined} className={cn('h-[36px]', highlighted && 'bg-[#fff8e6]')}>
                  <TD className="py-[3px] leading-[1.22]">
                    <p className="font-semibold whitespace-nowrap text-ink">{e.type.name}</p>
                    <p className="text-ink-soft">{agencyLabel(e.type, company)}</p>
                  </TD>
                  <TD className="border-l border-line-soft">
                    <LicenseStatusLabel status={e.evaluation.status} title={evaluationTitle(e.evaluation)} className={cn(na && 'font-normal')} />
                  </TD>
                  <TD className="tabular border-l border-line-soft whitespace-nowrap">
                    {na ? '—' : e.license.expiresAt ? formatDate(e.license.expiresAt) : e.type.hasExpiration ? '—' : 'Sem validade'}
                  </TD>
                  <TD className="border-l border-line-soft leading-[1.22]">{na ? '—' : providerLabel(catalog, e.license.providerCode)}</TD>
                  <TD className="border-l border-line-soft">
                    {na ? (
                      <span className="inline-flex h-6 w-[78px] items-center justify-center rounded-md bg-[#eef1f5] text-muted" aria-label="Não aplicável">
                        —
                      </span>
                    ) : (
                      <Button
                        size="xs"
                        variant="soft"
                        className="w-[78px]"
                        icon={<RotateCw className="size-3" strokeWidth={2.8} />}
                        onClick={() => onConsult(e.license)}
                        disabled={!can('consultation:create')}
                        title={can('consultation:create') ? `Consultar ${e.type.name}` : 'Seu perfil não registra consultas'}
                      >
                        Consultar
                      </Button>
                    )}
                  </TD>
                </TR>
              )
            })}
          </tbody>
        </Table>
      </TableFrame>

      <div className="mt-2.5 flex items-baseline justify-between">
        <h3 className="text-[14.5px] font-bold text-ink">Histórico de Consultas</h3>
        <button type="button" onClick={onShowHistory} className="text-[12.5px] text-link hover:underline">
          Ver todas
        </button>
      </div>
      <TableFrame className="mt-1.5">
        <Table className="text-[11.5px]">
          <THead>
            <tr className="h-[26px] text-[11px]">
              <TH>Data e Hora</TH>
              <TH>Licença</TH>
              <TH>Resultado</TH>
              <TH>Validade</TH>
              <TH>Fonte</TH>
            </tr>
          </THead>
          <tbody>
            {isLoading ? (
              <TR>
                <TD colSpan={5} className="py-2">
                  <Skeleton className="h-4 w-full" />
                </TD>
              </TR>
            ) : !consultations?.length ? (
              <TR>
                <TD colSpan={5} className="py-3 text-center text-muted">
                  Nenhuma consulta registrada.
                </TD>
              </TR>
            ) : (
              consultations.map((c) => (
                <TR key={c.id} className="h-[25px]">
                  <TD className="tabular whitespace-nowrap">{formatDateTime(c.consultedAt)}</TD>
                  <TD className="border-l border-line-soft">{typeShort.get(c.licenseTypeId)}</TD>
                  <TD className="border-l border-line-soft">
                    <ConsultationResult consultation={c} />
                  </TD>
                  <TD className="tabular border-l border-line-soft">{formatDate(c.expiresAt)}</TD>
                  <TD className="border-l border-line-soft">{c.providerCode ? providerLabel(catalog, c.providerCode, true) : (c.sourceLabel ?? '—')}</TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </TableFrame>
    </div>
  )
}
