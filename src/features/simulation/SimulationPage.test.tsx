// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { DataSourceProvider } from '@/app/data-context'
import { PageMetaProvider } from '@/app/page-meta'
import { SessionProvider } from '@/app/session'
import { Sidebar } from '@/components/layout/Sidebar'
import { ToastProvider } from '@/components/ui/Toast'
import { createMockDataSource } from '@/data/mock/mock-data-source'
import type { DataSource } from '@/data/types'
import { SimulationHistoryPage } from './SimulationHistoryPage'
import { SimulationPage } from './SimulationPage'
import { SimulationRunPage } from './SimulationRunPage'

// A tela é testada com a norma FICTÍCIA do modo demonstração (localidade "Cidade Exemplo").
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})
afterEach(cleanup)

function renderApp(ds: DataSource, path = '/simulacao') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DataSourceProvider dataSource={ds}>
        <ToastProvider>
          <SessionProvider>
            <PageMetaProvider>
              <MemoryRouter initialEntries={[path]}>
                <Routes>
                  <Route path="/simulacao" element={<SimulationPage />} />
                  <Route path="/simulacao/historico" element={<SimulationHistoryPage />} />
                  <Route path="/simulacao/:id" element={<SimulationRunPage />} />
                  <Route path="/menu" element={<Sidebar open={false} onClose={() => {}} />} />
                </Routes>
              </MemoryRouter>
            </PageMetaProvider>
          </SessionProvider>
        </ToastProvider>
      </DataSourceProvider>
    </QueryClientProvider>,
  )
}

const newDataSource = () => createMockDataSource({ latencyMs: 0, storage: null })

async function typeCnae(user: ReturnType<typeof userEvent.setup>, text: string, { demoCity = true } = {}) {
  const input = await screen.findByRole('combobox', { name: /informe o cnae principal/i })
  if (demoCity) await user.click(screen.getByRole('button', { name: 'Cidade Exemplo (PI)' }))
  await user.type(input, text)
}

describe('tela de Simulação de Licenciamento', () => {
  it('o menu lateral ganhou "Simulação" entre Monitor de Licenças e Histórico de Consultas', async () => {
    renderApp(newDataSource(), '/menu')
    await screen.findByRole('link', { name: 'Pet Shop' })
    const labels = within(screen.getByRole('navigation', { name: 'Menu principal' }))
      .getAllByRole('link')
      .map((l) => l.textContent)
    expect(labels.slice(-5)).toEqual(['Simulação', 'Histórico de Consultas', 'Alertas', 'Relatórios', 'Configurações'])
    expect(labels.slice(0, 2)).toEqual(['Dashboard', 'Empresas'])
    expect(screen.getByRole('link', { name: 'Simulação' }).getAttribute('href')).toBe('/simulacao')
  })

  it('CNAE sem condição: resultado imediato, salvo no histórico', async () => {
    const user = userEvent.setup()
    const ds = newDataSource()
    renderApp(ds)
    await typeCnae(user, '6911701')
    await user.click(screen.getByRole('button', { name: /simular licenciamento/i }))

    expect(await screen.findByText('Resultado da simulação')).toBeTruthy()
    expect(screen.getByText('O CNAE informado enquadra-se como Baixo Risco A.')).toBeTruthy()
    expect(screen.getByText('Regra completa')).toBeTruthy()
    expect(screen.getByText('Fundamentação')).toBeTruthy()
    expect(screen.getAllByText('Decreto Municipal nº 000/2024').length).toBeGreaterThan(0)
    expect(screen.getByText('Resultado por área')).toBeTruthy()
    // exemplo fictício: regras sem documento-fonte → aviso obrigatório
    expect(screen.getByText('NECESSITA REVISÃO')).toBeTruthy()
    expect(screen.getAllByText(/Sem documento-fonte vinculado/).length).toBeGreaterThan(0)
    expect(screen.getByText('Base legal utilizada')).toBeTruthy()
    expect(screen.getByText('Decreto Municipal nº 001/2025 (altera o Decreto Municipal nº 000/2024; vigência desde 01/01/2026)')).toBeTruthy()
    expect(await screen.findByText(/Simulação nº 1 salva no histórico/)).toBeTruthy()
    expect(await ds.simulation.listRuns()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /por que este resultado/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Por que este resultado?' })
    expect(within(dialog).getByText('Justificativa')).toBeTruthy()
    expect(within(dialog).getByText('Decreto Municipal nº 001/2025')).toBeTruthy()
    expect(within(dialog).getAllByText('000/2024').length).toBeGreaterThan(0)
  })

  it('Teresina: base legal cadastrada aguardando o conteúdo oficial → Regra não cadastrada', async () => {
    const user = userEvent.setup()
    renderApp(newDataSource())
    await typeCnae(user, '6911701', { demoCity: false })
    await user.click(screen.getByRole('button', { name: /simular licenciamento/i }))

    expect(await screen.findByText('Base legal cadastrada, aguardando importação do conteúdo')).toBeTruthy()
    expect(screen.getByText('Decreto Municipal nº 24.861/2023')).toBeTruthy()
    expect(screen.getAllByText('Regra não cadastrada').length).toBeGreaterThan(0)
    expect(screen.queryByText(/^Dispensad[oa]$/)).toBeNull()
  })

  it('autocomplete pela descrição e questionário gerado pelas condições cadastradas', async () => {
    const user = userEvent.setup()
    const ds = newDataSource()
    renderApp(ds)
    await typeCnae(user, 'lanchon')
    await user.click(await screen.findByRole('option', { name: /5611-2\/03 — Lanchonetes/ }))
    await user.click(screen.getByRole('button', { name: /simular licenciamento/i }))

    expect(await screen.findByText('Precisamos de algumas informações')).toBeTruthy()
    expect(screen.getByText('Condição prevista na norma')).toBeTruthy()
    await user.click(within(screen.getByRole('radiogroup', { name: /preparo de alimentos no local/i })).getByText('Sim'))
    await user.click(within(screen.getByRole('radiogroup', { name: /armazenamento de determinado produto/i })).getByText('Não'))
    await user.click(screen.getByRole('button', { name: /ver resultado/i }))

    expect(await screen.findByText('O CNAE informado enquadra-se como Baixo Risco A.')).toBeTruthy()
    expect(screen.getAllByText(/informado: Sim/).length).toBeGreaterThan(0)
    await waitFor(async () => expect(await ds.simulation.listRuns()).toHaveLength(1))
    const run = (await ds.simulation.listRuns())[0]!
    expect((await ds.simulation.getRun(run.id))?.result.answers.map((a) => a.answerLabel)).toEqual(['Sim', 'Não'])
  })

  it('condição deixada em branco: ENQUADRAMENTO CONDICIONADO', async () => {
    const user = userEvent.setup()
    renderApp(newDataSource())
    await typeCnae(user, '5611-2/03')
    await user.click(screen.getByRole('button', { name: /simular licenciamento/i }))
    await screen.findByText('Precisamos de algumas informações')
    await user.click(screen.getByRole('button', { name: /ver resultado/i }))

    expect(await screen.findByText('Esta atividade pode ser classificada como Baixo Risco A desde que as condições previstas na legislação sejam atendidas.')).toBeTruthy()
    expect(screen.getAllByText('Enquadramento Condicionado').length).toBeGreaterThan(0)
    expect(screen.getByText('Regra condicionada')).toBeTruthy()
    expect(screen.getByText('2 condições pendentes')).toBeTruthy()
  })

  it('CNAE sem regra e CNAE secundário: não conclui e aponta o CNAE', async () => {
    const user = userEvent.setup()
    renderApp(newDataSource())
    await typeCnae(user, '6911701')
    await user.click(screen.getByRole('button', { name: /adicionar outro cnae/i }))
    await user.type(screen.getByRole('combobox', { name: 'CNAE secundário 1' }), '8630-5/03')
    await user.click(screen.getByRole('button', { name: /simular licenciamento/i }))

    expect(await screen.findByText('Não foi possível determinar automaticamente o enquadramento com as regras atualmente cadastradas.')).toBeTruthy()
    expect(screen.getAllByText('Regra não cadastrada').length).toBeGreaterThan(0)
    expect(screen.getByText('Sem regra de enquadramento cadastrada para: 8630-5/03.')).toBeTruthy()
    expect(screen.getByText('CNAE que impediu a conclusão do enquadramento')).toBeTruthy()
  })

  it('valida CNAE incompleto antes de simular', async () => {
    const user = userEvent.setup()
    renderApp(newDataSource())
    await typeCnae(user, '123')
    await user.click(screen.getByRole('button', { name: /simular licenciamento/i }))
    expect((await screen.findByRole('alert')).textContent).toContain('CNAE incompleto')
  })

  it('histórico lista a simulação e "Ver" mostra o resultado guardado', async () => {
    const user = userEvent.setup()
    const ds = newDataSource()
    const first = renderApp(ds)
    await typeCnae(user, '2512800')
    await user.click(screen.getByRole('button', { name: /simular licenciamento/i }))
    await screen.findByText(/Simulação nº 1 salva no histórico/)
    first.unmount()

    renderApp(ds, '/simulacao/historico')
    const row = (await screen.findByText('2512-8/00')).closest('tr')!
    expect(within(row).getByText('Alto Risco')).toBeTruthy()
    await user.click(within(row).getByRole('link', { name: 'Ver simulação nº 1' }))
    expect(await screen.findByText('O CNAE informado enquadra-se como Alto Risco.')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('button', { name: /simular novamente/i })).toBeTruthy())
  })
})
