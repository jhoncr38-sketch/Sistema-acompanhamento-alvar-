import { cn } from '@/lib/cn'

/**
 * Ícones sólidos com recortes (janelas), como na referência. O Lucide só oferece versões
 * de contorno destes desenhos; aqui o recorte usa `fill-rule="evenodd"` e herda `currentColor`.
 */
interface IconProps {
  className?: string
  strokeWidth?: number
}

export function SolidBuildingIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-6', className)} aria-hidden>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M6 2h12a2 2 0 0 1 2 2v18H4V4a2 2 0 0 1 2-2Zm1.5 3.5v2h2v-2h-2Zm3.5 0v2h2v-2h-2Zm3.5 0v2h2v-2h-2Zm-7 4v2h2v-2h-2Zm3.5 0v2h2v-2h-2Zm3.5 0v2h2v-2h-2Zm-7 4v2h2v-2h-2Zm3.5 0v2h2v-2h-2Zm3.5 0v2h2v-2h-2ZM10 18.5V22h4v-3.5h-4Z"
      />
    </svg>
  )
}

export function SolidFactoryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-6', className)} aria-hidden>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M3 21V4.5A1.5 1.5 0 0 1 4.5 3h3A1.5 1.5 0 0 1 9 4.5v6l5.5-3.5v3.5L20 7v14H3Zm4-6v2.5h2.5V15H7Zm4 0v2.5h2.5V15H11Zm4 0v2.5h2.5V15H15Z"
      />
    </svg>
  )
}
