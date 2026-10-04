import { ClipboardList, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Form'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import type { CatalogSnapshot } from '@/data/types'
import { formatDate, formatDateTime } from '@/domain/format'
import { CONSULTATION_TYPE_LABEL } from '@/domain/labels'
import type { CompanyOverview } from '@/domain/monitoring'
import type { FieldChange, LicenseConsultation } from '@/domain/types'
import { useChanges, useConsultations } from '@/hooks/queries'
import { cn } from '@/lib/cn'
import { ChangeComparison } from '../../consultations/ChangeComparison'
import { ConsultationResult } from '../../consultations/ConsultationResult'
import { providerLabel } from '../../licenses/license-labels'

/** Linha do tempo de consultas da empresa. Nada é sobrescrito: cada consulta é um registro. */
export function HistoryTab({ overview, catalog, onRegister }: { overview: CompanyOverview; catalog: CatalogSnapshot; onRegister?: () => void }) {
  const [licenseId, setLicenseId] = useState('')
  const consultations = useConsultations({ companyId: overview.company.id })
  const changes = useChanges({ companyId: overview.company.id })
  const typeName = useMemo(() => new Map(catalog.licenseTypes.map((t) => [t.id, t.name])), [catalog])
  const byId = useMemo(() => new Map((consultations.data ?? []).map((c) => [c.id, c])), [consultations.data])
  const changeByConsultation = useMemo(() => new Map((changes.data ?? []).map((c) => [c.consultationId, c])), [changes.data])

  const list = (consultations.data ?? []).filter((c) => !licenseId || c.companyLicenseId === licenseId)

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={licenseId} onChange={(e) => setLicenseId(e.target.value)} aria-label="Filtrar por licença" className="w-auto min-w-[200px] flex-1 sm:flex-none">
          <option value="">Todas as licenças</option>
          {overview.licenses.map((e) => (
            <option key={e.license.id} value={e.license.id}>
              {e.type.name}
            </option>
          ))}
        </Select>
        {onRegister && (
          <Button size="sm" className="ml-auto" icon={<Plus className="size-4" />} onClick={onRegister}>
            Registrar consulta
          </Button>
        )}
      </div>

      {consultations.isLoading ? (
        <LoadingState />
      ) : consultations.error ? (
        <ErrorState error={consultations.error} onRetry={() => consultations.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nenhuma consulta registrada" description="As consultas manuais e automáticas aparecerão aqui." />
      ) : (
        <ol className="relative ml-2 border-l-2 border-line pl-5">
          {list.map((c) => (
            <TimelineItem
              key={c.id}
              consultation={c}
              previous={c.previousConsultationId ? byId.get(c.previousConsultationId) : undefined}
              changes={changeByConsultation.get(c.id)?.changes ?? []}
              licenseName={typeName.get(c.licenseTypeId) ?? 'Licença'}
              source={c.sourceLabel ?? providerLabel(catalog, c.providerCode)}
            />
          ))}
        </ol>
      )}
    </div>
  )
}

function TimelineItem({
  consultation: c,
  previous,
  changes,
  licenseName,
  source,
}: {
  consultation: LicenseConsultation
  previous: LicenseConsultation | undefined
  changes: FieldChange[]
  licenseName: string
  source: string
}) {
  return (
    <li className="relative pb-4 last:pb-0">
      <span
        className={cn(
          'absolute top-1 -left-[27px] size-3 rounded-full border-2 border-white ring-2',
          c.outcome === 'erro' ? 'bg-danger ring-[#fbd0d6]' : c.changeDetected ? 'bg-warn ring-[#fde3b8]' : 'bg-ok ring-[#cdeedd]',
        )}
        aria-hidden
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="tabular text-[12px] font-semibold text-ink-soft">{formatDateTime(c.consultedAt)}</p>
        <Badge tone={c.type === 'automatica' ? 'blue' : 'neutral'} className="h-[18px] text-[10.5px]">
          {CONSULTATION_TYPE_LABEL[c.type].toUpperCase()}
        </Badge>
        {c.outcome === 'sucesso' &&
          (c.changeDetected ? (
            <Badge tone="warn" className="h-[18px] text-[10.5px]">ALTERAÇÃO DETECTADA</Badge>
          ) : c.previousConsultationId ? (
            <span className="text-[11px] text-muted">Nenhuma alteração identificada</span>
          ) : null)}
      </div>
      <p className="mt-0.5 text-[13px] font-semibold text-ink">{licenseName}</p>
      <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-ink-soft">
        <ConsultationResult consultation={c} />
        {c.outcome === 'sucesso' && <span>Validade: {formatDate(c.expiresAt)}</span>}
        <span>Fonte: {source}</span>
        <span>Responsável: {c.responsibleName}</span>
        {c.documentNumber && <span>Doc.: {c.documentNumber}</span>}
        {c.protocolNumber && <span>Protocolo: {c.protocolNumber}</span>}
      </div>
      {c.errorMessage && <p className="mt-1 text-[12px] text-danger-ink">{c.errorMessage}</p>}
      {c.notes && <p className="mt-1 text-[12px] text-ink-soft italic">“{c.notes}”</p>}
      {c.changeDetected && previous && <ChangeComparison className="mt-2" previous={previous} current={c} changes={changes} />}
    </li>
  )
}
