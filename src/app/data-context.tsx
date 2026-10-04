import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { loadDataSource } from '@/data'
import type { DataSource } from '@/data/types'

const DataSourceContext = createContext<DataSource | null>(null)

export function DataSourceProvider({ children, dataSource }: { children: ReactNode; dataSource?: DataSource }) {
  const [ds, setDs] = useState<DataSource | null>(dataSource ?? null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (ds) return
    let active = true
    loadDataSource().then(
      (loaded) => active && setDs(loaded),
      (e) => active && setError(e),
    )
    return () => {
      active = false
    }
  }, [ds])

  if (error) return <ErrorState error={error} onRetry={() => window.location.reload()} className="min-h-screen" />
  if (!ds) return <LoadingState className="min-h-screen" />
  return <DataSourceContext.Provider value={ds}>{children}</DataSourceContext.Provider>
}

export function useDataSource(): DataSource {
  const ds = useContext(DataSourceContext)
  if (!ds) throw new Error('useDataSource precisa de <DataSourceProvider>')
  return ds
}
