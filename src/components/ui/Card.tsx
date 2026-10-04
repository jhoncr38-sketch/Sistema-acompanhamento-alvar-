import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl bg-white shadow-card', className)} {...props} />
}

export function IconTile({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-xl', className)} aria-hidden>
      {children}
    </span>
  )
}
