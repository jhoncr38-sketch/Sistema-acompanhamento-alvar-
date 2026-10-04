import { Check, Minus, Plus, RefreshCw } from 'lucide-react'
import type { CompanyHealth, LicenseStatus } from '@/domain/types'
import { cn } from '@/lib/cn'

type Glyph = 'check' | 'alert' | 'refresh' | 'question' | 'minus' | 'plus'
type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'blue'

const TONE_BG: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-neutral',
  blue: 'bg-primary',
}

/** Círculo sólido com glifo branco — o padrão de ícone de situação da referência. */
export function SolidStatusIcon({ tone, glyph, size = 16, className, label }: {
  tone: Tone
  glyph: Glyph
  size?: number
  className?: string
  label?: string
}) {
  const inner = Math.round(size * 0.62)
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      title={label}
      className={cn('inline-grid shrink-0 place-items-center rounded-full text-white', TONE_BG[tone], className)}
      style={{ width: size, height: size }}
    >
      {glyph === 'check' && <Check style={{ width: inner, height: inner }} strokeWidth={3.4} />}
      {glyph === 'alert' && (
        <span className="font-black leading-none" style={{ fontSize: Math.round(size * 0.72) }}>
          !
        </span>
      )}
      {glyph === 'refresh' && <RefreshCw style={{ width: inner, height: inner }} strokeWidth={3} />}
      {glyph === 'question' && (
        <span className="font-black leading-none" style={{ fontSize: Math.round(size * 0.66) }}>
          ?
        </span>
      )}
      {glyph === 'minus' && <Minus style={{ width: inner, height: inner }} strokeWidth={3.4} />}
      {glyph === 'plus' && <Plus style={{ width: inner, height: inner }} strokeWidth={3.4} />}
    </span>
  )
}

export const LICENSE_STATUS_VISUAL: Record<LicenseStatus, { tone: Tone; glyph: Glyph; text: string }> = {
  regular: { tone: 'ok', glyph: 'check', text: 'text-ok-ink' },
  atencao: { tone: 'warn', glyph: 'alert', text: 'text-warn-ink' },
  vencida: { tone: 'danger', glyph: 'alert', text: 'text-danger-ink' },
  pendente: { tone: 'danger', glyph: 'alert', text: 'text-danger-ink' },
  em_renovacao: { tone: 'blue', glyph: 'refresh', text: 'text-primary' },
  em_analise: { tone: 'info', glyph: 'question', text: 'text-info' },
  dispensada: { tone: 'neutral', glyph: 'minus', text: 'text-muted' },
  nao_aplicavel: { tone: 'neutral', glyph: 'minus', text: 'text-muted' },
}

export const HEALTH_VISUAL: Record<CompanyHealth, { tone: Tone; glyph: Glyph }> = {
  regular: { tone: 'ok', glyph: 'check' },
  atencao: { tone: 'warn', glyph: 'alert' },
  pendencia: { tone: 'danger', glyph: 'alert' },
}

/** Ícone da célula de licença na tabela do setor ("—" para não aplicável, como na referência). */
export function LicenseCellIcon({ status, label }: { status: LicenseStatus; label: string }) {
  if (status === 'nao_aplicavel') {
    return (
      <span role="img" aria-label={label} title={label} className="inline-block h-px w-3 bg-[#8d96a3]" />
    )
  }
  const v = LICENSE_STATUS_VISUAL[status]
  return <SolidStatusIcon tone={v.tone} glyph={v.glyph} size={16} label={label} />
}
