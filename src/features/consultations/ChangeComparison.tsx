import { ArrowRight } from 'lucide-react'
import type { ConsultationSnapshot } from '@/domain/change-detection'
import { COMPARABLE_FIELDS } from '@/domain/change-detection'
import { formatDate } from '@/domain/format'
import { FIELD_LABEL, LICENSE_SITUATION_LABEL } from '@/domain/labels'
import type { ComparableField, FieldChange, LicenseSituation } from '@/domain/types'
import { cn } from '@/lib/cn'

function display(field: ComparableField, value: string | null): string {
  if (!value) return '—'
  if (field === 'situation') return LICENSE_SITUATION_LABEL[value as LicenseSituation] ?? value
  if (field === 'expiresAt' || field === 'issuedAt') return formatDate(value)
  return value
}

/** Quadro ANTERIOR × ATUAL. Sempre mostra situação e validade; demais campos só quando mudaram. */
export function ChangeComparison({
  previous,
  current,
  changes,
  className,
}: {
  previous: ConsultationSnapshot
  current: ConsultationSnapshot
  changes: readonly FieldChange[]
  className?: string
}) {
  const changed = new Set(changes.map((c) => c.field))
  const fields = COMPARABLE_FIELDS.filter((f) => f === 'situation' || f === 'expiresAt' || changed.has(f))

  const column = (title: string, snap: ConsultationSnapshot, highlight: boolean) => (
    <div className={cn('flex-1 rounded-lg border p-3', highlight ? 'border-[#f5c27a] bg-[#fffaf0]' : 'border-line bg-[#f8fafc]')}>
      <p className="mb-1.5 text-[11px] font-bold tracking-wider text-muted uppercase">{title}</p>
      <dl className="space-y-1">
        {fields.map((f) => (
          <div key={f} className="flex gap-2 text-[12.5px]">
            <dt className="w-[92px] shrink-0 text-muted">{FIELD_LABEL[f]}</dt>
            <dd className={cn('font-semibold text-ink', highlight && changed.has(f) && 'text-warn-ink')}>{display(f, snap[f])}</dd>
          </div>
        ))}
      </dl>
    </div>
  )

  return (
    <div className={cn('flex flex-col items-stretch gap-2 sm:flex-row sm:items-center', className)}>
      {column('Anterior', previous, false)}
      <ArrowRight className="mx-auto size-5 shrink-0 rotate-90 text-muted sm:rotate-0" aria-hidden />
      {column('Atual', current, true)}
    </div>
  )
}
