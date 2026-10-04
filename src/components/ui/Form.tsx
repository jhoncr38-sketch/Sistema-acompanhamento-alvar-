import { Search } from 'lucide-react'
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'

const CONTROL =
  'w-full rounded-lg border border-[#d9e1ec] bg-white px-3 text-[13px] text-ink placeholder:text-[#8a94a3] transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none disabled:bg-[#f3f6fa] disabled:text-muted aria-[invalid=true]:border-danger-ink'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(CONTROL, 'h-[34px]', className)} {...props} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(CONTROL, 'h-[34px] pr-8', className)} {...props}>
      {children}
    </select>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(CONTROL, 'min-h-[84px] py-2 leading-relaxed', className)} {...props} />
  },
)

/** Rótulo + controle + mensagem de erro/ajuda, com ids ligados para leitores de tela. */
export function Field({
  label,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string
  error?: string
  hint?: string
  required?: boolean
  className?: string
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactElement
}) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[12px] font-semibold text-ink-soft">
        {label}
        {required && <span className="text-danger-ink"> *</span>}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-[11.5px] text-danger-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[11.5px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  label,
  trailing,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: string
  onChange: (value: string) => void
  label: string
  trailing?: ReactNode
}) {
  return (
    <div className={cn('relative', className)}>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={cn(CONTROL, 'h-[34px] pr-9 text-[12.5px] [&::-webkit-search-cancel-button]:hidden')}
        {...props}
      />
      <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-[#4b5565]" aria-hidden />
      {trailing}
    </div>
  )
}
