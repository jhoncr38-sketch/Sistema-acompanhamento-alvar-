import { Building, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { usePageMeta } from '@/app/page-meta'
import { useSession } from '@/app/session'
import { Badge, HealthBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SearchInput, Select } from '@/components/ui/Form'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { formatCnpj, normalizeCnpj } from '@/domain/cnpj'
import { formatDateTime } from '@/domain/format'
import { COMPANY_HEALTH_LABEL, COMPANY_STATUS_LABEL } from '@/domain/labels'
import type { CompanyHealth, CompanyStatus } from '@/domain/types'
import { useMonitor } from '@/hooks/queries'

const PAGE_SIZE = 15

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function CompaniesPage() {
  usePageMeta('Empresas', 'Cadastro e situação das empresas atendidas pelo escritório')
  const { catalog, overviews, isLoading, error, refetch } = useMonitor()
  const { can } = useSession()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [sectorId, setSectorId] = useState('')
  const [health, setHealth] = useState<CompanyHealth | ''>('')
  const [status, setStatus] = useState<CompanyStatus | ''>('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    const qCnpj = normalizeCnpj(query)
    return (overviews ?? [])
      .filter(
        (o) =>
          (!sectorId || o.company.sectorId === sectorId) &&
          (!health || o.health === health) &&
          (!status || o.company.status === status) &&
          (!q || normalize(`${o.company.legalName} ${o.company.tradeName}`).includes(q) || (qCnpj.length >= 2 && o.company.cnpj.includes(qCnpj))),
      )
      .sort((a, b) => a.company.legalName.localeCompare(b.company.legalName, 'pt-BR'))
  }, [overviews, query, sectorId, health, status])

  if (error) return <ErrorState error={error} onRetry={refetch} />

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v)
    setPage(1)
  }

  return (
    <Card className="mt-[9px] p-[14px]">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={query} onChange={resetPage(setQuery)} placeholder="Pesquisar empresa ou CNPJ..." label="Pesquisar empresa ou CNPJ" className="min-w-[220px] flex-1" />
        <Select value={sectorId} onChange={(e) => resetPage(setSectorId)(e.target.value)} aria-label="Filtrar por setor" className="w-auto">
          <option value="">Todos os setores</option>
          {catalog?.sectors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select value={health} onChange={(e) => resetPage(setHealth)(e.target.value as CompanyHealth | '')} aria-label="Filtrar por situação" className="w-auto">
          <option value="">Todas as situações</option>
          {Object.entries(COMPANY_HEALTH_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => resetPage(setStatus)(e.target.value as CompanyStatus | '')} aria-label="Filtrar por status" className="w-auto">
          <option value="">Todos os status</option>
          {Object.entries(COMPANY_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        {can('company:write') && (
          <Button icon={<Plus className="size-4" strokeWidth={2.6} />} onClick={() => navigate('/empresas/nova')}>
            Nova Empresa
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState icon={Building} title="Nenhuma empresa encontrada" description="Ajuste os filtros ou cadastre uma nova empresa." />
      ) : (
        <TableFrame className="mt-3">
          <Table className="text-[13px]">
            <THead>
              <tr className="h-[38px] text-[12.5px]">
                <TH>Empresa</TH>
                <TH>CNPJ</TH>
                <TH>Setor</TH>
                <TH>Município</TH>
                <TH>Status</TH>
                <TH>Situação</TH>
                <TH className="text-right">Índice</TH>
                <TH>Última verificação</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((o) => (
                <TR key={o.company.id} className="h-[38px] hover:bg-[#f7faff]">
                  <TD>
                    <Link to={`/empresas/${o.company.id}`} className="text-link hover:underline">
                      {o.company.legalName}
                    </Link>
                    {o.company.tradeName && o.company.tradeName !== o.company.legalName && (
                      <span className="block text-[11.5px] text-muted">{o.company.tradeName}</span>
                    )}
                  </TD>
                  <TD className="tabular whitespace-nowrap text-ink-soft">{formatCnpj(o.company.cnpj)}</TD>
                  <TD className="whitespace-nowrap">{o.sector?.name ?? '—'}</TD>
                  <TD className="whitespace-nowrap">
                    {o.company.address.city} - {o.company.address.state}
                  </TD>
                  <TD>
                    <Badge tone={o.company.status === 'ativa' ? 'ok' : o.company.status === 'inativa' ? 'neutral' : 'blue'}>{COMPANY_STATUS_LABEL[o.company.status]}</Badge>
                  </TD>
                  <TD>{o.monitored ? <HealthBadge health={o.health} /> : <span className="text-muted">—</span>}</TD>
                  <TD className="tabular text-right">{o.regularityIndex === null ? '—' : `${o.regularityIndex}%`}</TD>
                  <TD className="tabular whitespace-nowrap text-ink-soft">{formatDateTime(o.lastCheckedAt)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-ink-soft">
          Mostrando {rows.length} de {filtered.length} empresas
        </p>
        <Pagination page={current} totalPages={totalPages} onChange={setPage} />
      </div>
    </Card>
  )
}
