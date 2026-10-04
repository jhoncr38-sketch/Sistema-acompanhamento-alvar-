import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useDataSource } from '@/app/data-context'
import type { AlertFilter, ConsultationFilter } from '@/data/types'
import { todayISO } from '@/domain/dates'
import { buildCompanyOverviews } from '@/domain/monitoring'

export const qk = {
  catalog: ['catalog'] as const,
  companies: ['companies'] as const,
  licenses: ['licenses'] as const,
  consultations: (f: ConsultationFilter = {}) => ['consultations', f] as const,
  changes: (f: { companyId?: string; limit?: number } = {}) => ['changes', f] as const,
  alerts: (f: AlertFilter = {}) => ['alerts', f] as const,
  documents: (f: { companyId?: string; companyLicenseId?: string } = {}) => ['documents', f] as const,
  audit: (f: { companyId?: string; limit?: number } = {}) => ['audit', f] as const,
  users: ['users'] as const,
  notifications: ['notifications'] as const,
  search: (q: string) => ['search', q] as const,
}

export function useCatalog() {
  const ds = useDataSource()
  return useQuery({ queryKey: qk.catalog, queryFn: () => ds.catalog.getCatalog(), staleTime: 5 * 60_000 })
}

export function useCompanies() {
  const ds = useDataSource()
  return useQuery({ queryKey: qk.companies, queryFn: () => ds.companies.list() })
}

export function useAllLicenses() {
  const ds = useDataSource()
  return useQuery({ queryKey: qk.licenses, queryFn: () => ds.licenses.listAll() })
}

export function useConsultations(filter: ConsultationFilter = {}, enabled = true) {
  const ds = useDataSource()
  return useQuery({ queryKey: qk.consultations(filter), queryFn: () => ds.consultations.list(filter), enabled })
}

export function useChanges(filter: { companyId?: string; limit?: number } = {}) {
  const ds = useDataSource()
  return useQuery({ queryKey: qk.changes(filter), queryFn: () => ds.consultations.listChanges(filter) })
}

export function useAlerts(filter: AlertFilter = {}) {
  const ds = useDataSource()
  return useQuery({ queryKey: qk.alerts(filter), queryFn: () => ds.alerts.list(filter) })
}

export function useDocuments(filter: { companyId?: string; companyLicenseId?: string } = {}) {
  const ds = useDataSource()
  return useQuery({ queryKey: qk.documents(filter), queryFn: () => ds.documents.list(filter) })
}

export function useAuditLogs(filter: { companyId?: string; limit?: number } = {}, enabled = true) {
  const ds = useDataSource()
  return useQuery({ queryKey: qk.audit(filter), queryFn: () => ds.audit.list(filter), enabled })
}

export function useUsers(enabled = true) {
  const ds = useDataSource()
  return useQuery({ queryKey: qk.users, queryFn: () => ds.users.list(), enabled })
}

export function useNotificationLogs() {
  const ds = useDataSource()
  return useQuery({ queryKey: qk.notifications, queryFn: () => ds.notifications.list() })
}

export function useGlobalSearch(query: string) {
  const ds = useDataSource()
  const q = query.trim()
  return useQuery({ queryKey: qk.search(q), queryFn: () => ds.search.global(q), enabled: q.length >= 2, staleTime: 10_000 })
}

/**
 * Visão consolidada (empresas + licenças avaliadas). Todos os indicadores da tela vêm daqui,
 * calculados a partir dos registros — nada é fixo.
 */
export function useMonitor() {
  const catalog = useCatalog()
  const companies = useCompanies()
  const licenses = useAllLicenses()
  const today = todayISO()

  const overviews = useMemo(() => {
    if (!catalog.data || !companies.data || !licenses.data) return undefined
    return buildCompanyOverviews(
      {
        companies: companies.data,
        licenses: licenses.data,
        licenseTypes: catalog.data.licenseTypes,
        sectors: catalog.data.sectors,
      },
      today,
      catalog.data.settings,
    )
  }, [catalog.data, companies.data, licenses.data, today])

  return {
    catalog: catalog.data,
    overviews,
    today,
    isLoading: catalog.isLoading || companies.isLoading || licenses.isLoading,
    error: catalog.error ?? companies.error ?? licenses.error,
    refetch: () => {
      void catalog.refetch()
      void companies.refetch()
      void licenses.refetch()
    },
  }
}

/** Invalida os dados afetados depois de uma gravação. */
export function useInvalidate() {
  const client = useQueryClient()
  return useMemo(
    () => ({
      afterConsultation: () =>
        Promise.all(
          ['licenses', 'consultations', 'changes', 'alerts', 'documents', 'audit', 'search'].map((key) =>
            client.invalidateQueries({ queryKey: [key] }),
          ),
        ),
      companies: () =>
        Promise.all(['companies', 'licenses', 'audit', 'search', 'catalog'].map((key) => client.invalidateQueries({ queryKey: [key] }))),
      licenses: () => Promise.all(['licenses', 'audit'].map((key) => client.invalidateQueries({ queryKey: [key] }))),
      alerts: () => client.invalidateQueries({ queryKey: ['alerts'] }),
      documents: () => Promise.all(['documents', 'audit', 'search'].map((key) => client.invalidateQueries({ queryKey: [key] }))),
      catalog: () => Promise.all(['catalog', 'audit'].map((key) => client.invalidateQueries({ queryKey: [key] }))),
      all: () => client.invalidateQueries(),
    }),
    [client],
  )
}
