import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { can as canDo, type Permission } from '@/domain/permissions'
import type { UserProfile, UserRole } from '@/domain/types'
import { useDataSource } from './data-context'

interface SessionValue {
  user: UserProfile | null
  loading: boolean
  requiresLogin: boolean
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  can(permission: Permission): boolean
  /** Somente no modo demonstração: troca o perfil para testar permissões. */
  switchDemoRole?: (role: UserRole) => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ds.auth
      .getCurrentUser()
      .then((u) => active && setUser(u))
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false))
    const off = ds.auth.onChange((u) => {
      setUser(u)
      queryClient.invalidateQueries()
    })
    return () => {
      active = false
      off()
    }
  }, [ds, queryClient])

  const signIn = useCallback(
    async (email: string, password: string) => {
      setUser(await ds.auth.signIn(email, password))
      await queryClient.invalidateQueries()
    },
    [ds, queryClient],
  )

  const signOut = useCallback(async () => {
    await ds.auth.signOut()
    queryClient.clear()
    setUser(ds.auth.requiresLogin ? null : await ds.auth.getCurrentUser())
  }, [ds, queryClient])

  const value = useMemo<SessionValue>(
    () => ({
      user,
      loading,
      requiresLogin: ds.auth.requiresLogin,
      signIn,
      signOut,
      can: (permission) => canDo(user?.role, permission),
      switchDemoRole: ds.demo
        ? async (role) => {
            setUser(await ds.demo!.switchUser(role))
          }
        : undefined,
    }),
    [user, loading, ds, signIn, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession precisa de <SessionProvider>')
  return ctx
}
