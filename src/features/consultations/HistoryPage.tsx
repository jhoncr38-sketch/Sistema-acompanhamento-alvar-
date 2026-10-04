import { ClipboardList, Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { usePageMeta } from '@/app/page-meta'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, SearchInput, Select } from '@/components/ui/Form'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { addDays, todayISO } from '@/domain/dates'
import { formatDate, formatDateTime } from '@/domain/format'
import { CONSULTATION_TYPE_LABEL } from '@/domain/labels'
import type { ConsultationType } from '@/domain/types'
import { useCatalog, useCompanies, useConsultations } from '@/hooks/queries'
import { downloadText } from '@/lib/download'
import { buildReport, toCsv } from '@/services/reports'
import { ConsultationResult } from './ConsultationResult'

const PAGE_SIZE = 20

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function HistoryPage() {
  usePageMeta('Histórico de Consultas', 'Todas as consultas registradas — nenhum resultado anterior é apagado')
  const [from, setFrom] = useState(addDays(todayISO(), -90))
  const [to, setTo] = useState(todayISO())
  const [type, setType] = useState<ConsultationType | ''>('')
  const [licenseTypeId, setLicenseTypeId] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const filter = useMemo(
    () => ({
      from: new Date(`${from}T00:00:00`).toISOString(),
      to: new Date(`${to}T23:59:59.999`).toISOString(),
      type: type || undefined,
    }),
    [from, to, type],
  )
  const { data, isLoading, error, refetch } = useConsultations(filter)
  const { data: catalog } = useCatalog()
  const { data: companies } = useCompanies()

  const companyById = useMemo(() => new Map((companies ?? []).map((c) => [c.id, c])), [companies])
  const typeById = useMemo(() => new Map((catalog?.licenseTypes ?? []).map((t) => [t.id, t])), [catalog])

  const rows = useMemo(() => {
    const q = normalize(query.trim())
    return (data ?? []).filter((c) => {
      if (licenseTypeId && c.licenseTypeId !== licenseTypeId) return false
      if (!q) return true
      const company = companyById.get(c.companyId)
      return normalize(`${company?.legalName ?? ''} ${company?.cnpj ?? ''} ${c.protocolNumber ?? ''} ${c.documentNumber ?? ''}`).includes(q)
    })
  }, [data, query, licenseTypeId, companyById])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  function exportCsv() {
    if (!catalog) return
    const table = buildReport('historico-consultas', {
      overviews: [],
      companies: companies ?? [],
      sectors: catalog.sectors,
      licenseTypes: catalog.licenseTypes,
      consultations: rows,
      changes: [],
      period: { from, to },
    })
    downloadText(toCsv(table), `historico-consultas-${from}-a-${to}.csv`)
  }

  return (
    <Card className="mt-[9px] p-[14px]">
      <div className="flex flex-wrap items-end gap-2.5">
        <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1) }} label="Pesquisar empresa, CNPJ ou protocolo" placeholder="Pesquisar empresa, CNPJ ou protocolo..." className="min-w-[220px] flex-1" />
        <Select value={licenseTypeId} onChange={(e) => { setLicenseTypeId(e.target.value); setPage(1) }} aria-label="Licença" className="w-auto">
          <option value="">Todas as licenças</option>
          {catalog?.licenseTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select value={type} onChange={(e) => { setType(e.target.value as ConsultationType | ''); setPage(1) }} aria-label="Tipo da consulta" className="w-auto">
          <option value="">Manual e automática</option>
          <option value="manual">Manual</option>
          <option value="automatica">Automática</option>
        </Select>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-soft">
          De <Input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPage(1) }} className="w-[150px]" />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-soft">
          até <Input type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setPage(1) }} className="w-[150px]" />
        </label>
        <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!rows.length}>
          Exportar CSV
        </Button>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : pageRows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nenhuma consulta no período" description="Altere o período ou os filtros." />
      ) : (
        <TableFrame className="mt-3">
          <Table className="text-[12.5px]">
            <THead>
              <tr className="h-[36px]">
                <TH>Data e hora</TH>
                <TH>Empresa</TH>
                <TH>Licença</TH>
                <TH>Resultado</TH>
                <TH>Validade</TH>
                <TH>Fonte</TH>
                <TH>Responsável</TH>
                <TH>Tipo</TH>
                <TH>Comparação</TH>
              </tr>
            </THead>
            <tbody>
              {pageRows.map((c) => {
                const company = companyById.get(c.companyId)
                return (
                  <TR key={c.id} className="h-[36px] hover:bg-[#f7faff]">
                    <TD className="tabular whitespace-nowrap">{formatDateTime(c.consultedAt)}</TD>
                    <TD>
                      {company ? (
                        <Link to={`/empresas/${company.id}?licenca=${c.companyLicenseId}`} className="text-link hover:underline">
                          {company.legalName}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">{typeById.get(c.licenseTypeId)?.shortName ?? '—'}</TD>
                    <TD>
                      <ConsultationResult consultation={c} />
                    </TD>
                    <TD className="tabular">{formatDate(c.expiresAt)}</TD>
                    <TD>{c.sourceLabel ?? '—'}</TD>
                    <TD className="whitespace-nowrap">{c.responsibleName}</TD>
                    <TD>
                      <Badge tone={c.type === 'automatica' ? 'blue' : 'neutral'} className="text-[10.5px]">
                        {CONSULTATION_TYPE_LABEL[c.type].toUpperCase()}
                      </Badge>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {c.outcome === 'erro' ? (
                        <span className="text-muted">—</span>
                      ) : c.changeDetected ? (
                        <Badge tone="warn" className="text-[10.5px]">ALTERAÇÃO</Badge>
                      ) : c.previousConsultationId ? (
                        <span className="text-[11.5px] text-muted">Sem alteração</span>
                      ) : (
                        <span className="text-[11.5px] text-muted">Primeira consulta</span>
                      )}
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </Table>
        </TableFrame>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-ink-soft">
          {rows.length} {rows.length === 1 ? 'consulta' : 'consultas'} no período
        </p>
        <Pagination page={current} totalPages={totalPages} onChange={setPage} />
      </div>
    </Card>
  )
}
