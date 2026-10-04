import { useId, useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem<T extends string> {
  id: T
  label: string
}

/** Abas acessíveis (setas ←/→ navegam). O conteúdo é renderizado por quem usa. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  label,
}: {
  items: readonly TabItem<T>[]
  value: T
  onChange: (id: T) => void
  className?: string
  label: string
}) {
  const baseId = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(e: KeyboardEvent, index: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    refs.current[next]?.focus()
    onChange(items[next]!.id)
  }

  return (
    <div role="tablist" aria-label={label} className={cn('flex overflow-x-auto border-b border-line', className)}>
      {items.map((item, i) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            id={`${baseId}-${item.id}`}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              '-mb-px h-[32px] shrink-0 border-b-2 px-4 text-[13px] whitespace-nowrap transition-colors',
              active
                ? 'rounded-t-md border-primary bg-[#eaf3fe] font-semibold text-primary'
                : 'border-transparent text-ink-soft hover:text-ink',
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
