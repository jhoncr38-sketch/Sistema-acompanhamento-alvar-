import { SolidStatusIcon } from '@/components/ui/StatusIcon'
import { LICENSE_SITUATION_LABEL } from '@/domain/labels'
import type { LicenseConsultation, LicenseSituation } from '@/domain/types'
import { cn } from '@/lib/cn'

const TONE: Record<LicenseSituation, { tone: 'ok' | 'danger' | 'blue' | 'info'; glyph: 'check' | 'alert' | 'refresh' | 'question'; text: string }> = {
  regular: { tone: 'ok', glyph: 'check', text: 'text-ok-ink' },
  vencida: { tone: 'danger', glyph: 'alert', text: 'text-danger-ink' },
  pendente: { tone: 'danger', glyph: 'alert', text: 'text-danger-ink' },
  em_renovacao: { tone: 'blue', glyph: 'refresh', text: 'text-primary' },
  em_analise: { tone: 'info', glyph: 'question', text: 'text-info' },
}

/** Resultado informado na consulta (o que a fonte disse), com ícone. */
export function ConsultationResult({ consultation, className }: { consultation: Pick<LicenseConsultation, 'outcome' | 'situation'>; className?: string }) {
  if (consultation.outcome === 'erro' || !consultation.situation) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-danger-ink', className)}>
        <SolidStatusIcon tone="danger" glyph="alert" size={13} /> Erro
      </span>
    )
  }
  const v = TONE[consultation.situation]
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-ink', className)}>
      <SolidStatusIcon tone={v.tone} glyph={v.glyph} size={13} />
      {LICENSE_SITUATION_LABEL[consultation.situation]}
    </span>
  )
}
