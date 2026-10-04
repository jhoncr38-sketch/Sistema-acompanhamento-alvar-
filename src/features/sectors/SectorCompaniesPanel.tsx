import { Eye, Plus, SearchX } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useSession } from '@/app/session'
import { HealthBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, IconTile } from '@/components/ui/Card'
import { SearchInput } from '@/components/ui/Form'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/States'
import { LicenseCellIcon, SolidStatusIcon } from '@/components/ui/StatusIcon'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { SECTOR_ICONS, sectorTheme } from '@/config/sector-theme'
import type { CatalogSnapshot } from '@/data/types'
import { formatCnpj, normalizeCnpj } from '@/domain/cnpj'
import { EXPIRATION_LEVEL_LABEL, LICENSE_STATUS_LABEL } from '@/domain/labels'
import { countHealth, type CompanyOverview, type EvaluatedLicense } from '@/domain/monitoring'
import type { CompanyHealth, LicenseType, Sector } from '@/domain/types'
import { cn } from '@/lib/cn'

const PAGE_SIZE = 10
/** Rótulos longos quebram em duas linhas (hífen opcional) para manter a largura das colunas do layout. */
const HEADER_BREAKS: Record<string, string> = { Acessibilidade: 'Acessi\u00ADbilidade' }
type Filter = 'todos' | CompanyHealth

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function sectorTableColumns(catalog: CatalogSnapshot, sectorId: string): LicenseType[] {
  const types = new Map(catalog.licenseTypes.map((t) => [t.id, t]))
  return catalog.sectorLicenseRules
    .filter((r) => r.sectorId === sectorId && r.showInTable)
    .map((r) => types.get(r.licenseTypeId))
    .filter((t): t is LicenseType => !!t && t.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

function cellLabel(type: LicenseType, e: EvaluatedLicense | undefined) {
  if (!e) return `${type.name}: não monitorada`
  const { status, level, daysRemaining } = e.evaluation
  let detail = LICENSE_STATUS_LABEL[status]
  if (status === 'atencao' && daysRemaining !== null) detail = `${EXPIRATION_LEVEL_LABEL[level]} — vence em ${daysRemaining} dia(s)`
  if (status === 'vencida' && daysRemaining !== null && daysRemaining < 0) detail = `Vencida há ${-daysRemaining} dia(s)`
  return `${type.name}: ${detail}`
}

function FilterChip({ active, onClick, children, icon }: { active: boolean; onClick: () => void; children: ReactNode; icon?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-[30px] items-center gap-2 rounded-full px-3.5 text-[12.5px] whitespace-nowrap transition-colors',
        active
          ? 'bg-primary-strong font-semibold text-white shadow-[0_2px_6px_rgb(12_96_192/0.35)]'
          : 'border border-[#dde4ee] bg-white text-ink shadow-[0_1px_2px_rgb(15_45_82/0.06)] hover:bg-[#f5f8fc]',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export function SectorCompaniesPanel({
  sector,
  overviews,
  catalog,
  selectedCompanyId,
  onSelectCompany,
  className,
}: {
  sector: Sector
  overviews: CompanyOverview[]
  catalog: CatalogSnapshot
  selectedCompanyId: string | null
  onSelectCompany: (companyId: string) => void
  className?: string
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  const { can } = useSession()
  const theme = sectorTheme(sector.color)
  const Icon = SECTOR_ICONS[sector.icon]
  const columns = useMemo(() => sectorTableColumns(catalog, sector.id), [catalog, sector.id])

  const rows = useMemo(
    () =>
      overviews
        .filter((o) => o.monitored && o.company.sectorId === sector.id)
        .sort((a, b) => a.company.createdAt.localeCompare(b.company.createdAt)),
    [overviews, sector.id],
  )
  const counts = countHealth(rows)

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    const qCnpj = normalizeCnpj(query)
    return rows.filter((o) => {
      if (filter !== 'todos' && o.health !== filter) return false
      if (!q) return true
      return (
        normalize(`${o.company.legalName} ${o.company.tradeName}`).includes(q) ||
        (qCnpj.length >= 2 && o.company.cnpj.includes(qCnpj))
      )
    })
  }, [rows, filter, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const changeFilter = (f: Filter) => {
    setFilter(f)
    setPage(1)
  }

  return (
    <Card className={cn('flex flex-col p-[14px]', className)}>
      <div className="flex flex-wrap items-start gap-3">
        <IconTile className={cn('size-[46px]', theme.soft)}>
          <Icon className={cn('size-[26px]', theme.text, sector.icon !== 'scale' && 'fill-current')} strokeWidth={sector.icon === 'scale' ? 2.2 : 1.6} />
        </IconTile>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[21px] leading-tight font-bold text-ink">{sector.name}</h2>
          <p className="text-[14px] text-ink-soft">
            {rows.length} {rows.length === 1 ? 'empresa cadastrada' : 'empresas cadastradas'}
          </p>
        </div>
        <div className="flex w-full items-center gap-2.5 sm:w-auto">
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v)
              setPage(1)
            }}
            placeholder="Pesquisar empresa ou CNPJ..."
            label={`Pesquisar empresa ou CNPJ em ${sector.name}`}
            className="min-w-0 flex-1 sm:w-[222px] sm:flex-none"
          />
          {can('company:write') && (
            <Button icon={<Plus className="size-4" strokeWidth={2.6} />} onClick={() => navigate(`/empresas/nova?setor=${sector.slug}`)}>
              Nova Empresa
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar por situação">
        <FilterChip active={filter === 'todos'} onClick={() => changeFilter('todos')}>
          Todos ({counts.total})
        </FilterChip>
        <FilterChip active={filter === 'regular'} onClick={() => changeFilter('regular')} icon={<SolidStatusIcon tone="ok" glyph="check" size={14} />}>
          Regulares ({counts.regular})
        </FilterChip>
        <FilterChip active={filter === 'atencao'} onClick={() => changeFilter('atencao')} icon={<SolidStatusIcon tone="warn" glyph="alert" size={14} />}>
          Atenção ({counts.atencao})
        </FilterChip>
        <FilterChip active={filter === 'pendencia'} onClick={() => changeFilter('pendencia')} icon={<SolidStatusIcon tone="danger" glyph="alert" size={14} />}>
          Vencidas ({counts.pendencia})
        </FilterChip>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          className="flex-1"
          title={rows.length === 0 ? 'Nenhuma empresa neste setor' : 'Nenhuma empresa encontrada'}
          description={rows.length === 0 ? 'Cadastre a primeira empresa para começar o monitoramento.' : 'Ajuste a pesquisa ou o filtro.'}
        />
      ) : (
        <>
          {/* Tabela (tablet/desktop) */}
          <TableFrame className="mt-2.5 hidden md:block">
            <Table className="min-w-[640px] table-fixed text-[13px]">
              <THead>
                <tr className="h-[38px] text-[12.5px]">
                  <TH className="pl-2.5">Empresa</TH>
                  <TH className="w-[128px] border-l border-line-soft px-2">CNPJ</TH>
                  {columns.map((t, i) => (
                    <TH key={t.id} title={t.name} className={cn('w-[63px] px-0.5 text-center leading-tight whitespace-normal', i === 0 && 'border-l border-line-soft')}>
                      {HEADER_BREAKS[t.shortName] ?? t.shortName}
                    </TH>
                  ))}
                  <TH className="w-[96px] border-l border-line-soft px-2.5">Status</TH>
                  <TH className="w-[48px] border-l border-line-soft px-1 text-center">Ações</TH>
                </tr>
              </THead>
              <tbody>
                {pageRows.map((o) => {
                  const byType = new Map(o.licenses.map((e) => [e.type.id, e]))
                  const selected = o.company.id === selectedCompanyId
                  return (
                    <TR key={o.company.id} className={cn('h-[31.5px] transition-colors hover:bg-[#f7faff]', selected && 'bg-[#eef5fe] hover:bg-[#eef5fe]')}>
                      <TD className="py-[5px] pl-2.5 align-top leading-[1.32]">
                        <button
                          type="button"
                          onClick={() => onSelectCompany(o.company.id)}
                          className="text-left text-link hover:underline"
                          aria-current={selected || undefined}
                        >
                          {o.company.legalName}
                        </button>
                      </TD>
                      <TD className="tabular border-l border-line-soft px-2 py-[5px] align-top text-[12.5px] leading-[1.38] whitespace-nowrap text-ink-soft">
                        {formatCnpj(o.company.cnpj)}
                      </TD>
                      {columns.map((t, i) => {
                        const e = byType.get(t.id)
                        return (
                          <TD key={t.id} className={cn('px-0.5 text-center', i === 0 && 'border-l border-line-soft')}>
                            <span className="inline-flex align-middle">
                              <LicenseCellIcon status={e?.evaluation.status ?? 'nao_aplicavel'} label={cellLabel(t, e)} />
                            </span>
                          </TD>
                        )
                      })}
                      <TD className="border-l border-line-soft px-2.5">
                        <HealthBadge health={o.health} />
                      </TD>
                      <TD className="border-l border-line-soft px-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => onSelectCompany(o.company.id)}
                          className="inline-grid size-7 place-items-center rounded-full text-[#1d3a66] hover:bg-[#e8f0fb]"
                          aria-label={`Ver ${o.company.legalName}`}
                        >
                          <Eye className="size-[18px]" strokeWidth={2.4} />
                        </button>
                      </TD>
                    </TR>
                  )
                })}
              </tbody>
            </Table>
          </TableFrame>

          {/* Lista (celular) */}
          <ul className="mt-2.5 flex flex-col gap-2 md:hidden">
            {pageRows.map((o) => {
              const byType = new Map(o.licenses.map((e) => [e.type.id, e]))
              return (
                <li key={o.company.id}>
                  <button
                    type="button"
                    onClick={() => onSelectCompany(o.company.id)}
                    className={cn('w-full rounded-lg border border-line p-3 text-left', o.company.id === selectedCompanyId && 'border-primary-line bg-[#eef5fe]')}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold text-link">{o.company.legalName}</span>
                        <span className="tabular block text-[12px] text-ink-soft">{formatCnpj(o.company.cnpj)}</span>
                      </span>
                      <HealthBadge health={o.health} className="shrink-0" />
                    </span>
                    <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {columns.map((t) => {
                        const e = byType.get(t.id)
                        return (
                          <span key={t.id} className="inline-flex items-center gap-1.5 text-[12px] text-ink-soft">
                            <LicenseCellIcon status={e?.evaluation.status ?? 'nao_aplicavel'} label={cellLabel(t, e)} />
                            {t.shortName}
                          </span>
                        )
                      })}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
        <p className="text-[12px] text-ink-soft" aria-live="polite">
          Mostrando {pageRows.length} de {filtered.length} {filtered.length === 1 ? 'empresa' : 'empresas'}
        </p>
        <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
      </div>
    </Card>
  )
}
