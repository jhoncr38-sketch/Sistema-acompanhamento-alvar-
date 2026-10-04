import { Menu } from 'lucide-react'
import { Suspense, useState } from 'react'
import { Outlet } from 'react-router'
import { useDataSource } from '@/app/data-context'
import { usePageMetaValue } from '@/app/page-meta'
import { LoadingState } from '@/components/ui/States'
import { GlobalSearch } from './GlobalSearch'
import { NotificationBell } from './NotificationBell'
import { Sidebar } from './Sidebar'
import { UserMenu } from './UserMenu'

function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { title, subtitle } = usePageMetaValue()
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 pb-2 lg:flex-nowrap lg:pt-[11px]">
      <button type="button" onClick={onOpenMenu} className="-ml-1 rounded-md p-1.5 text-ink hover:bg-white/70 lg:hidden" aria-label="Abrir menu">
        <Menu className="size-6" />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[21px] leading-tight font-bold tracking-[-0.01em] text-ink sm:text-[26px]">{title}</h1>
        {subtitle && <p className="truncate text-[12.5px] text-ink-soft sm:text-[13px]">{subtitle}</p>}
      </div>
      <GlobalSearch className="order-last w-full md:order-none md:mr-5 md:w-[304px]" />
      <div className="flex items-center gap-3 sm:gap-6">
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  )
}

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const ds = useDataSource()
  return (
    <div className="flex min-h-screen">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        {ds.mode === 'demo' && (
          <p className="bg-[#fff6dc] px-4 py-1 text-center text-[11.5px] text-[#7a5600] lg:hidden">
            Modo demonstração — dados fictícios salvos apenas neste navegador.
          </p>
        )}
        <main className="flex-1 px-4 pb-6 lg:pr-3.5 lg:pl-5">
          <Topbar onOpenMenu={() => setMenuOpen(true)} />
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
