import { ScrollText } from 'lucide-react'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { formatDateTime } from '@/domain/format'
import { useAuditLogs, useCompanies } from '@/hooks/queries'
import { SectionHeader } from './SectionHeader'

function summarize(values: Record<string, unknown> | null): string {
  if (!values) return '—'
  return Object.entries(values)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ')
}

export function AuditSection() {
  const { data, isLoading, error, refetch } = useAuditLogs({ limit: 200 })
  const { data: companies } = useCompanies()
  const name = new Map((companies ?? []).map((c) => [c.id, c.legalName]))

  return (
    <div>
      <SectionHeader title="Auditoria" description="Operações importantes: quem fez, quando, em qual registro, valor anterior e novo valor." />
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : !data?.length ? (
        <EmptyState icon={ScrollText} title="Nenhum registro de auditoria" />
      ) : (
        <TableFrame>
          <Table className="text-[12px]">
            <THead>
              <tr className="h-[34px]">
                <TH>Data/hora</TH>
                <TH>Usuário</TH>
                <TH>Ação</TH>
                <TH>Empresa</TH>
                <TH>Anterior</TH>
                <TH>Novo</TH>
                <TH>Origem</TH>
              </tr>
            </THead>
            <tbody>
              {data.map((a) => (
                <TR key={a.id} className="h-[36px] align-top">
                  <TD className="tabular py-2 whitespace-nowrap">{formatDateTime(a.occurredAt)}</TD>
                  <TD className="py-2 whitespace-nowrap">{a.userName ?? 'Sistema'}</TD>
                  <TD className="py-2">
                    <span className="font-semibold text-ink">{a.action.replaceAll('_', ' ')}</span>
                    <span className="block text-[11px] text-muted">{a.tableName}</span>
                  </TD>
                  <TD className="py-2">{a.companyId ? (name.get(a.companyId) ?? '—') : '—'}</TD>
                  <TD className="max-w-[220px] py-2 break-words text-ink-soft">{summarize(a.oldValues)}</TD>
                  <TD className="max-w-[220px] py-2 break-words text-ink-soft">{summarize(a.newValues)}</TD>
                  <TD className="py-2">{a.origin}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  )
}
