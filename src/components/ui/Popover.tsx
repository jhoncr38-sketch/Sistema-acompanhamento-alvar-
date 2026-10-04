import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Menu suspenso simples (fecha com clique fora e Esc). */
export function Popover({
  trigger,
  children,
  align = 'right',
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void; 'aria-expanded': boolean }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v), 'aria-expanded': open })}
      {open && (
        <div
          className={cn(
            'absolute top-full z-40 mt-2 rounded-xl border border-line bg-white shadow-pop',
            align === 'right' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
