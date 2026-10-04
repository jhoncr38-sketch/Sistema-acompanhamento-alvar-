import {
  Bell,
  ChevronDown,
  ChevronUp,
  Clock,
  Cross,
  FileChartColumn,
  Grid3x3,
  House,
  SearchCheck,
  Settings,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import { Mascot, BrandLogo } from '@/components/brand/Brand'
import { SECTOR_ICONS } from '@/config/sector-theme'
import type { SectorIcon } from '@/domain/types'
import { useCatalog } from '@/hooks/queries'
import { cn } from '@/lib/cn'

/** No menu lateral a referência usa a cruz para Saúde; nos cards, o estetoscópio. */
const SIDEBAR_SECTOR_ICONS: Partial<Record<SectorIcon, LucideIcon>> = { stethoscope: Cross }

const ITEM =
  'flex h-10 items-center gap-[13px] rounded-lg pr-1.5 pl-[13px] text-[13px] tracking-[-0.01em] text-white/95 transition-colors hover:bg-white/[0.07] focus-visible:outline-white'
const ACTIVE = 'bg-gradient-to-r from-[#1660b3] to-[#124890] shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_4px_14px_rgb(0_0_0/0.25)] hover:bg-transparent'

function MonitorIcon() {
  return (
    <span className="grid size-[19px] place-items-center rounded-[5px] bg-white" aria-hidden>
      <span className="grid size-[11px] place-items-center rounded-full border-[1.8px] border-navy-900">
        <ChevronDown className="size-2 text-navy-900" strokeWidth={4} />
      </span>
    </span>
  )
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data: catalog } = useCatalog()
  const location = useLocation()
  const [monitorOpen, setMonitorOpen] = useState(true)
  const sectors = (catalog?.sectors ?? []).filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder)
  const inMonitor = location.pathname.startsWith('/monitor')

  const link = (to: string, label: string, icon: ReactNode, end = false) => (
    <NavLink to={to} end={end} onClick={onNavigate} className={({ isActive }) => cn(ITEM, isActive && ACTIVE)}>
      {icon}
      <span className="truncate">{label}</span>
    </NavLink>
  )

  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-[7px] px-2.5">
      {link('/', 'Dashboard', <House className="size-5 fill-white [&>path:last-child]:fill-navy-900" strokeWidth={1.8} />, true)}
      {link('/empresas', 'Empresas', <Grid3x3 className="size-5" strokeWidth={2.4} />)}

      <div>
        <button
          type="button"
          onClick={() => setMonitorOpen((v) => !v)}
          aria-expanded={monitorOpen}
          aria-controls="submenu-monitor"
          className={cn(ITEM, 'w-full pr-1', inMonitor && !monitorOpen && ACTIVE)}
        >
          <MonitorIcon />
          <span className="flex-1 truncate text-left">Monitor de Licenças</span>
          {monitorOpen ? <ChevronUp className="-ml-2.5 size-4 shrink-0" /> : <ChevronDown className="-ml-2.5 size-4 shrink-0" />}
        </button>
        {monitorOpen && (
          <ul id="submenu-monitor" className="mt-0.5 mb-1 flex flex-col gap-[2px]">
            {sectors.map((sector) => {
              const Icon = SIDEBAR_SECTOR_ICONS[sector.icon] ?? SECTOR_ICONS[sector.icon]
              return (
                <li key={sector.id}>
                  <NavLink
                    to={`/monitor/${sector.slug}`}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex h-[36px] items-center gap-[14px] rounded-lg pr-0.5 pl-[31px] text-[12px] text-white/90 transition-colors hover:bg-white/[0.07]',
                        isActive && ACTIVE,
                      )
                    }
                  >
                    <Icon className={cn('size-[18px] shrink-0', sector.icon !== 'scale' && sector.icon !== 'factory' && 'fill-white')} strokeWidth={sector.icon === 'scale' ? 2 : 1.6} />
                    <span className="truncate">{sector.name}</span>
                  </NavLink>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {link('/simulacao', 'Simulação', <SearchCheck className="size-5" strokeWidth={2.4} />)}
      {link('/historico', 'Histórico de Consultas', <Clock className="size-5" strokeWidth={2.4} />)}
      {link('/alertas', 'Alertas', <Bell className="size-5 fill-white" strokeWidth={1.8} />)}
      {link('/relatorios', 'Relatórios', <FileChartColumn className="size-5 fill-white [&>path:not(:first-child)]:stroke-navy-900" strokeWidth={1.8} />)}
      {link('/configuracoes', 'Configurações', <Settings className="size-5 fill-white [&>circle]:fill-navy-900" strokeWidth={1.8} />)}
    </nav>
  )
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[204px] shrink-0 flex-col bg-navy-900 lg:flex">
        <SidebarContent />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-navy-950/55" onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 flex w-[260px] max-w-[85vw] flex-col bg-navy-900 shadow-pop">
            <button type="button" onClick={onClose} className="absolute top-3 right-3 rounded-md p-1.5 text-white/80 hover:bg-white/10" aria-label="Fechar menu">
              <X className="size-5" />
            </button>
            <SidebarContent onNavigate={onClose} />
          </aside>
        </div>
      )}
    </>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="scrollbar-thin flex h-full flex-col overflow-y-auto">
      <div className="flex h-[86px] shrink-0 items-center justify-center pt-1">
        <BrandLogo />
      </div>
      <div className="mt-1">
        <SidebarNav onNavigate={onNavigate} />
      </div>
      <div className="mt-auto pt-6 [@media(max-height:820px)]:hidden">
        <Mascot />
      </div>
    </div>
  )
}
