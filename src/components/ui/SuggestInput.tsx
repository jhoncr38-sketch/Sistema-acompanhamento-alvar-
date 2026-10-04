import { useId, useState, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Input } from './Form'

export interface SuggestOption {
  key: string
  title: string
  subtitle?: string
}

/** Campo de texto com sugestões (setas ↑/↓, Enter seleciona, Esc fecha). */
export function SuggestInput({
  value,
  onChange,
  onSelect,
  options,
  className,
  emptyHint,
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onSelect'> & {
  value: string
  onChange: (text: string) => void
  onSelect: (key: string) => void
  options: readonly SuggestOption[]
  /** Texto exibido quando há busca digitada e nenhuma sugestão. */
  emptyHint?: string
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const visible = open && (options.length > 0 || !!emptyHint)
  const index = Math.min(active, options.length - 1)

  function choose(key: string) {
    onSelect(key)
    setOpen(false)
  }

  return (
    <div className={cn('relative', className)}>
      <Input
        {...inputProps}
        value={value}
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={visible && options[index] ? `${listId}-${index}` : undefined}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={(e) => {
          setOpen(true)
          inputProps.onFocus?.(e)
        }}
        onBlur={(e) => {
          setOpen(false)
          inputProps.onBlur?.(e)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && options.length > 0) {
            e.preventDefault()
            setOpen(true)
            setActive(Math.min(index + 1, options.length - 1))
          } else if (e.key === 'ArrowUp' && options.length > 0) {
            e.preventDefault()
            setActive(Math.max(index - 1, 0))
          } else if (e.key === 'Enter' && visible && options[index]) {
            e.preventDefault()
            choose(options[index].key)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
          inputProps.onKeyDown?.(e)
        }}
      />
      {visible && (
        <div className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-xl border border-line bg-white shadow-pop">
          {options.length === 0 ? (
            <p className="px-3 py-2.5 text-[12.5px] text-muted">{emptyHint}</p>
          ) : (
            <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1">
              {options.map((option, i) => (
                <li
                  key={option.key}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === index}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    choose(option.key)
                  }}
                  className={cn('cursor-pointer px-3 py-1.5', i === index && 'bg-[#eef5fe]')}
                >
                  <span className="block truncate text-[13px] text-ink">{option.title}</span>
                  {option.subtitle && <span className="block truncate text-[11.5px] text-muted">{option.subtitle}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
