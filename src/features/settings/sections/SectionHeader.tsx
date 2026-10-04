import type { ReactNode } from 'react'

export function SectionHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="max-w-2xl">
        <h2 className="text-[17px] font-bold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  )
}
