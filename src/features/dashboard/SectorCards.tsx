import { ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { SolidStatusIcon } from '@/components/ui/StatusIcon'
import { SECTOR_ICONS, sectorTheme } from '@/config/sector-theme'
import type { SectorSummary } from '@/domain/monitoring'
import type { Sector } from '@/domain/types'
import { cn } from '@/lib/cn'

export function SectorBanner({ sector }: { sector: Sector }) {
  const theme = sectorTheme(sector.color)
  const Icon = SECTOR_ICONS[sector.icon]
  return (
    <div className={cn('relative h-[74px] overflow-hidden', theme.banner)}>
      {sector.coverImageUrl && (
        <img
          src={sector.coverImageUrl}
          alt=""
          aria-hidden
          loading="lazy"
          className="absolute inset-y-0 right-0 h-full w-[70%] object-cover [mask-image:linear-gradient(to_right,transparent,black_28%)]"
        />
      )}
      <span className={cn('absolute -top-[6px] -left-[3px] grid size-[86px] place-items-center rounded-full', theme.circle)}>
        <Icon className={cn('size-[36px] text-white', sector.icon === 'paw' && 'fill-white')} strokeWidth={2.2} />
      </span>
    </div>
  )
}

function Stat({ tone, glyph, value, one, many, className }: {
  tone: 'danger' | 'warn' | 'ok'
  glyph: 'alert' | 'check'
  value: number
  one: string
  many: string
  className: string
}) {
  return (
    <li className={cn('flex items-center gap-2.5 text-[14.5px] leading-6', className)}>
      <SolidStatusIcon tone={tone} glyph={glyph} size={17} />
      <span>
        {value} {value === 1 ? one : many}
      </span>
    </li>
  )
}

export function SectorCards({
  summaries,
  selectedSlug,
  onSelect,
}: {
  summaries: SectorSummary[]
  selectedSlug: string | null
  onSelect: (sector: Sector) => void
}) {
  return (
    <section aria-label="Setores" className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {summaries.map(({ sector, total, pendencia, atencao, regular }) => {
        const theme = sectorTheme(sector.color)
        const selected = sector.slug === selectedSlug
        return (
          <Card key={sector.id} className={cn('@container flex flex-col overflow-hidden', selected && cn('ring-[1.5px]', theme.ring))}>
            <SectorBanner sector={sector} />
            <div className="flex flex-1 flex-col px-3 pt-[7px] pb-2.5 @[230px]:px-4">
              <h2 className="truncate text-[16px] leading-6 font-bold text-ink @[230px]:text-[19px]" title={sector.name}>
                {sector.name}
              </h2>
              <p className="text-[16px] leading-6 text-ink @[230px]:text-[17px]">
                {total} {total === 1 ? 'empresa' : 'empresas'}
              </p>
              <ul className="mt-[5px] mb-[9px] flex flex-col">
                <Stat tone="danger" glyph="alert" value={pendencia} one="vencida" many="vencidas" className="text-danger-ink" />
                <Stat tone="warn" glyph="alert" value={atencao} one="em atenção" many="em atenção" className="text-warn-ink" />
                <Stat tone="ok" glyph="check" value={regular} one="regular" many="regulares" className="text-ok-ink" />
              </ul>
              <button
                type="button"
                onClick={() => onSelect(sector)}
                aria-pressed={selected}
                className={cn(
                  'mt-auto -mx-1 flex h-8 items-center justify-center gap-3 rounded-md text-[13.5px] font-semibold text-white shadow-[0_2px_6px_rgb(0_0_0/0.12)] transition-colors @[230px]:-mx-1.5',
                  theme.button,
                )}
              >
                Ver empresas <ArrowRight className="size-4" aria-hidden />
                <span className="sr-only">de {sector.name}</span>
              </button>
            </div>
          </Card>
        )
      })}
    </section>
  )
}
