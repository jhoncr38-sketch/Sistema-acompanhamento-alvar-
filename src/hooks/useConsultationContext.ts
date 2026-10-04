import { useMemo } from 'react'
import { useDataSource } from '@/app/data-context'
import { useSession } from '@/app/session'
import { todayISO } from '@/domain/dates'
import type { ConsultationContext } from '@/services/consultation-service'
import { useCatalog } from './queries'

export function useConsultationContext(): ConsultationContext | null {
  const ds = useDataSource()
  const { user } = useSession()
  const { data: catalog } = useCatalog()
  return useMemo(() => (catalog && user ? { ds, catalog, user, today: todayISO() } : null), [ds, catalog, user])
}
