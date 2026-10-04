import { LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger'
type Size = 'xs' | 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-[0_1px_2px_rgb(12_108_240/0.25)]',
  secondary: 'bg-white text-ink border border-[#d9e1ec] hover:bg-[#f5f8fc]',
  soft: 'bg-primary-soft text-primary border border-primary-line hover:bg-[#cfe2fb]',
  ghost: 'text-ink-soft hover:bg-[#eef3f9]',
  danger: 'bg-danger-ink text-white hover:bg-[#c50d24]',
}

const SIZES: Record<Size, string> = {
  xs: 'h-6 px-2 text-[11px] gap-1 rounded-md',
  sm: 'h-[30px] px-3 text-[12.5px] gap-1.5 rounded-md',
  md: 'h-[34px] px-3.5 text-[13px] gap-2 rounded-md',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <LoaderCircle className="size-[1.1em] animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}
