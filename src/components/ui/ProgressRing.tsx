import { cn } from '@/lib/cn'

/** Anel do Índice de Regularidade. Cor acompanha a faixa do valor. */
export function ProgressRing({ value, size = 66, stroke = 7, className }: { value: number | null; size?: number; stroke?: number; className?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value))
  const color = value === null ? '#c7ced8' : pct >= 80 ? '#13a35c' : pct >= 50 ? '#f08a06' : '#e0102a'
  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={value === null ? 'Sem licenças aplicáveis' : `Índice de regularidade: ${pct}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e3e8ef" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[19px] font-bold text-ink">
        {value === null ? '—' : `${pct}%`}
      </span>
    </div>
  )
}
