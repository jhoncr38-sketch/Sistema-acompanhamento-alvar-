import type { ReactNode } from 'react'
import { COMPANY_HEALTH_LABEL, LICENSE_STATUS_LABEL } from '@/domain/labels'
import type { AlertPriority, CompanyHealth, CompanyStatus, IntegrationStatus, LicenseStatus } from '@/domain/types'
import { cn } from '@/lib/cn'
import { LICENSE_STATUS_VISUAL, SolidStatusIcon } from './StatusIcon'

type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info' | 'blue' | 'solidOk'

const TONES: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok-ink',
  warn: 'bg-warn-soft text-warn-ink',
  danger: 'bg-danger-soft text-danger-ink',
  neutral: 'bg-neutral-soft text-ink-soft',
  info: 'bg-info-soft text-info',
  blue: 'bg-primary-soft text-primary',
  solidOk: 'bg-[#10a872] text-white',
}

export function Badge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center justify-center rounded-md px-2 text-[12px] leading-none font-semibold whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

const HEALTH_TONE: Record<CompanyHealth, Tone> = { regular: 'ok', atencao: 'warn', pendencia: 'danger' }

/** Pílula de situação da empresa (coluna "Status" da tabela do setor). */
export function HealthBadge({ health, className }: { health: CompanyHealth; className?: string }) {
  return (
    <Badge tone={HEALTH_TONE[health]} className={cn('w-[78px] text-[12.5px]', className)}>
      {COMPANY_HEALTH_LABEL[health]}
    </Badge>
  )
}

const STATUS_TONE: Record<LicenseStatus, Tone> = {
  regular: 'ok',
  atencao: 'warn',
  vencida: 'danger',
  pendente: 'danger',
  em_renovacao: 'blue',
  em_analise: 'info',
  dispensada: 'neutral',
  nao_aplicavel: 'neutral',
}

export function LicenseStatusBadge({ status }: { status: LicenseStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{LICENSE_STATUS_LABEL[status]}</Badge>
}

/** Ícone + texto colorido (coluna "Situação" do perfil da empresa). */
export function LicenseStatusLabel({ status, title, className }: { status: LicenseStatus; title?: string; className?: string }) {
  const v = LICENSE_STATUS_VISUAL[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-medium whitespace-nowrap', v.text, className)} title={title}>
      <SolidStatusIcon tone={v.tone} glyph={v.glyph} size={14} />
      {LICENSE_STATUS_LABEL[status]}
    </span>
  )
}

export function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  if (status === 'ativa') return <Badge tone="solidOk" className="h-6 px-2.5 text-[11.5px] font-bold tracking-wide">ATIVA</Badge>
  if (status === 'inativa') return <Badge tone="neutral" className="h-6 px-2.5 text-[11.5px] font-bold tracking-wide">INATIVA</Badge>
  return <Badge tone="blue" className="h-6 px-2.5 text-[11.5px] font-bold tracking-wide">EM IMPLANTAÇÃO</Badge>
}

const PRIORITY_TONE: Record<AlertPriority, Tone> = { baixa: 'neutral', media: 'warn', alta: 'danger', critica: 'danger' }
const PRIORITY_LABEL: Record<AlertPriority, string> = { baixa: 'BAIXA', media: 'MÉDIA', alta: 'ALTA', critica: 'CRÍTICA' }

export function PriorityBadge({ priority }: { priority: AlertPriority }) {
  return (
    <Badge tone={PRIORITY_TONE[priority]} className={cn('text-[10.5px] tracking-wide', priority === 'critica' && 'bg-danger-ink text-white')}>
      {PRIORITY_LABEL[priority]}
    </Badge>
  )
}

export function IntegrationBadge({ status }: { status: IntegrationStatus }) {
  const map: Record<IntegrationStatus, [Tone, string]> = {
    pendente: ['warn', 'INTEGRAÇÃO PENDENTE'],
    ativa: ['ok', 'ATIVA'],
    inativa: ['neutral', 'INATIVA'],
    erro: ['danger', 'COM ERRO'],
  }
  const [tone, label] = map[status]
  return <Badge tone={tone} className="text-[10.5px] tracking-wide">{label}</Badge>
}
