import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SearchX } from 'lucide-react'
import { lazy, useState } from 'react'
import { createBrowserRouter, Link, RouterProvider } from 'react-router'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card } from '@/components/ui/Card'
import { EmptyState, LoadingState } from '@/components/ui/States'
import { ToastProvider } from '@/components/ui/Toast'
import { AppError } from '@/data/errors'
import { LoginPage } from '@/features/auth/LoginPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { SectorPage } from '@/features/sectors/SectorPage'
import { usePageMeta } from './page-meta'
import { DataSourceProvider } from './data-context'
import { PageMetaProvider } from './page-meta'
import { SessionProvider, useSession } from './session'

// Dashboard e setores carregam junto; as demais telas, sob demanda.
const CompaniesPage = lazy(() => import('@/features/companies/CompaniesPage').then((m) => ({ default: m.CompaniesPage })))
const NewCompanyPage = lazy(() => import('@/features/companies/NewCompanyPage').then((m) => ({ default: m.NewCompanyPage })))
const CompanyPage = lazy(() => import('@/features/companies/CompanyPage').then((m) => ({ default: m.CompanyPage })))
const HistoryPage = lazy(() => import('@/features/consultations/HistoryPage').then((m) => ({ default: m.HistoryPage })))
const AlertsPage = lazy(() => import('@/features/alerts/AlertsPage').then((m) => ({ default: m.AlertsPage })))
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const SimulationPage = lazy(() => import('@/features/simulation/SimulationPage').then((m) => ({ default: m.SimulationPage })))
const SimulationHistoryPage = lazy(() => import('@/features/simulation/SimulationHistoryPage').then((m) => ({ default: m.SimulationHistoryPage })))
const SimulationRunPage = lazy(() => import('@/features/simulation/SimulationRunPage').then((m) => ({ default: m.SimulationRunPage })))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))

function NotFoundPage() {
  usePageMeta('Página não encontrada')
  return (
    <Card className="mt-3">
      <EmptyState
        icon={SearchX}
        title="Página não encontrada"
        action={
          <Link to="/" className="text-[13px] font-semibold text-primary hover:underline">
            Voltar ao Dashboard
          </Link>
        }
      />
    </Card>
  )
}

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'monitor/:slug', element: <SectorPage /> },
      { path: 'empresas', element: <CompaniesPage /> },
      { path: 'empresas/nova', element: <NewCompanyPage /> },
      { path: 'empresas/:id', element: <CompanyPage /> },
      { path: 'simulacao', element: <SimulationPage /> },
      { path: 'simulacao/historico', element: <SimulationHistoryPage /> },
      { path: 'simulacao/:id', element: <SimulationRunPage /> },
      { path: 'historico', element: <HistoryPage /> },
      { path: 'alertas', element: <AlertsPage /> },
      { path: 'relatorios', element: <ReportsPage /> },
      { path: 'configuracoes', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

function Gate() {
  const { user, loading, requiresLogin } = useSession()
  if (loading) return <LoadingState className="min-h-screen" label="Carregando…" />
  if (requiresLogin && !user) return <LoginPage />
  return <RouterProvider router={router} />
}

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (count, error) => !(error instanceof AppError && ['FORBIDDEN', 'NOT_FOUND', 'UNAUTHENTICATED'].includes(error.code)) && count < 2,
          },
        },
      }),
  )
  return (
    <QueryClientProvider client={queryClient}>
      <DataSourceProvider>
        <ToastProvider>
          <SessionProvider>
            <PageMetaProvider>
              <Gate />
            </PageMetaProvider>
          </SessionProvider>
        </ToastProvider>
      </DataSourceProvider>
    </QueryClientProvider>
  )
}
