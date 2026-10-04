import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export function TableFrame({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('overflow-x-auto rounded-lg border border-line', className)} {...props} />
}

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse text-left', className)} {...props} />
}

export function THead({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('bg-table-head', className)} {...props} />
}

export function TH({ className, ...props }: ComponentProps<'th'>) {
  return <th scope="col" className={cn('px-2.5 font-bold whitespace-nowrap text-ink', className)} {...props} />
}

export function TR({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-t border-line-soft', className)} {...props} />
}

export function TD({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-2.5', className)} {...props} />
}
