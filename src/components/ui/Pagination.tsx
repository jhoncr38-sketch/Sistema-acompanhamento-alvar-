import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

function pages(current: number, total: number): (number | '…')[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set([1, total, current, current - 1, current + 1].filter((p) => p >= 1 && p <= total))
  const sorted = [...set].sort((a, b) => a - b)
  const out: (number | '…')[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push('…')
    out.push(p)
  })
  return out
}

const BTN = 'grid size-[30px] place-items-center rounded-md border text-[12.5px] transition-colors'

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <nav aria-label="Paginação" className="flex items-center gap-1.5">
      {page > 1 && (
        <button type="button" className={cn(BTN, 'border-[#dde4ee] bg-white text-ink hover:bg-[#f3f7fc]')} onClick={() => onChange(page - 1)} aria-label="Página anterior">
          <ChevronLeft className="size-4" />
        </button>
      )}
      {pages(page, totalPages).map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="px-1 text-muted">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn(
              BTN,
              p === page
                ? 'border-primary bg-primary font-semibold text-white shadow-[0_2px_6px_rgb(12_108_240/0.35)]'
                : 'border-[#dde4ee] bg-white text-ink hover:bg-[#f3f7fc]',
            )}
          >
            {p}
          </button>
        ),
      )}
      {page < totalPages && (
        <button type="button" className={cn(BTN, 'border-[#dde4ee] bg-white text-ink hover:bg-[#f3f7fc]')} onClick={() => onChange(page + 1)} aria-label="Próxima página">
          <ChevronRight className="size-4" />
        </button>
      )}
    </nav>
  )
}
