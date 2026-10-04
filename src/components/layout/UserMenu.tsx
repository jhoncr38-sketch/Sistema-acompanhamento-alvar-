import { ChevronDown, LogOut, Settings, User } from 'lucide-react'
import { Link } from 'react-router'
import { useSession } from '@/app/session'
import { useDataSource } from '@/app/data-context'
import { Popover } from '@/components/ui/Popover'
import { useToast } from '@/components/ui/Toast'
import { ROLE_LABEL } from '@/domain/labels'
import type { UserRole } from '@/domain/types'
import { cn } from '@/lib/cn'

const ROLES: UserRole[] = ['administrador', 'contador', 'colaborador', 'consulta']

export function UserMenu() {
  const { user, signOut, switchDemoRole } = useSession()
  const ds = useDataSource()
  const toast = useToast()
  if (!user) return null

  return (
    <Popover
      className="w-64"
      trigger={({ toggle, ...aria }) => (
        <button type="button" onClick={toggle} {...aria} aria-haspopup="menu" className="flex items-center gap-3 rounded-full py-1 pr-1 pl-1 hover:bg-white/60 sm:pr-2">
          <span className="grid size-[38px] place-items-center overflow-hidden rounded-full bg-navy-900 text-white">
            <User className="mt-2 size-8 fill-white" strokeWidth={1} aria-hidden />
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-[13.5px] leading-tight font-semibold text-ink">{user.fullName}</span>
            <span className="block text-[12.5px] leading-tight text-ink-soft">{ROLE_LABEL[user.role]}</span>
          </span>
          <ChevronDown className="ml-3 hidden size-5 text-ink sm:block" aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <div role="menu" className="py-1.5">
          <div className="border-b border-line px-4 pt-1.5 pb-3">
            <p className="text-[13px] font-semibold text-ink">{user.fullName}</p>
            <p className="truncate text-[12px] text-muted">{user.email}</p>
          </div>
          {switchDemoRole && (
            <div className="border-b border-line px-4 py-2.5">
              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">Perfil (demonstração)</p>
              <div className="grid grid-cols-2 gap-1">
                {ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    role="menuitemradio"
                    aria-checked={user.role === role}
                    onClick={async () => {
                      await switchDemoRole(role)
                      toast.info(`Perfil alterado para ${ROLE_LABEL[role]}`, 'As permissões da tela foram atualizadas.')
                      close()
                    }}
                    className={cn(
                      'rounded-md border px-2 py-1 text-[11.5px]',
                      user.role === role ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-line text-ink-soft hover:bg-[#f3f7fc]',
                    )}
                  >
                    {ROLE_LABEL[role]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Link role="menuitem" to="/configuracoes" onClick={close} className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-ink hover:bg-[#f3f7fc]">
            <Settings className="size-4 text-muted" aria-hidden /> Configurações
          </Link>
          {ds.auth.requiresLogin && (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                close()
                void signOut()
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-ink hover:bg-[#f3f7fc]"
            >
              <LogOut className="size-4 text-muted" aria-hidden /> Sair
            </button>
          )}
        </div>
      )}
    </Popover>
  )
}
