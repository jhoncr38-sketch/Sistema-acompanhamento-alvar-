import { CircleAlert, Inbox, LoaderCircle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { errorMessage } from '@/data/errors'
import { cn } from '@/lib/cn'
import { Button } from './Button'

export function LoadingState({ label = 'Carregando…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 py-10 text-[13px] text-muted', className)}>
      <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden />
      {label}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-4 py-10 text-center', className)}>
      <span className="grid size-11 place-items-center rounded-full bg-[#eef3f9] text-muted">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {description && <p className="max-w-sm text-[12.5px] text-muted">{description}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-2 px-4 py-10 text-center', className)}>
      <CircleAlert className="size-7 text-danger-ink" aria-hidden />
      <p className="text-[14px] font-semibold text-ink">Não foi possível carregar os dados</p>
      <p className="max-w-sm text-[12.5px] text-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-[#e6edf6]', className)} aria-hidden />
}
