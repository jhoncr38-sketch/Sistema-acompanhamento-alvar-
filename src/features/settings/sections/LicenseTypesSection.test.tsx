// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { DataSourceProvider } from '@/app/data-context'
import { SessionProvider } from '@/app/session'
import { ToastProvider } from '@/components/ui/Toast'
import { createMockDataSource } from '@/data/mock/mock-data-source'
import type { DataSource } from '@/data/types'
import { useCatalog } from '@/hooks/queries'
import { LicenseTypesSection } from './LicenseTypesSection'

function Harness() {
  const { data } = useCatalog()
  return data ? <LicenseTypesSection catalog={data} readOnly={false} /> : <p>carregando</p>
}

function renderWith(ds: DataSource) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DataSourceProvider dataSource={ds}>
        <ToastProvider>
          <SessionProvider>
            <Harness />
          </SessionProvider>
        </ToastProvider>
      </DataSourceProvider>
    </QueryClientProvider>,
  )
}

afterEach(cleanup)

describe('Configurações › Tipos de licença', () => {
  it('lista a Licença de Acessibilidade no catálogo', async () => {
    renderWith(createMockDataSource({ latencyMs: 0, storage: null }))
    expect(await screen.findByText('Licença de Acessibilidade')).toBeTruthy()
  })

  it('cadastra uma nova licença pelo formulário', async () => {
    const user = userEvent.setup()
    const ds = createMockDataSource({ latencyMs: 0, storage: null })
    renderWith(ds)
    await screen.findByText('Licença de Acessibilidade')

    await user.click(screen.getByRole('button', { name: /nova licença/i }))
    const dialog = screen.getByRole('dialog')
    const [name, shortName, agency] = within(dialog).getAllByRole('textbox')
    await user.type(name!, 'Certificado de Inspeção de Elevadores')
    await user.type(shortName!, 'Elevadores')
    await user.type(agency!, 'Prefeitura')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByText('Certificado de Inspeção de Elevadores')).toBeTruthy()
    const saved = (await ds.catalog.getCatalog()).licenseTypes.find((t) => t.shortName === 'Elevadores')
    expect(saved).toMatchObject({ code: 'inspecao_de_elevadores', agency: 'Prefeitura', agencyScope: 'municipal', active: true })
  })

  it('não salva sem os campos obrigatórios', async () => {
    const user = userEvent.setup()
    renderWith(createMockDataSource({ latencyMs: 0, storage: null }))
    await screen.findByText('Licença de Acessibilidade')
    await user.click(screen.getByRole('button', { name: /nova licença/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Preencha nome, nome curto e órgão.')).toBeTruthy()
  })
})
