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
import { RulesSection } from './RulesSection'

// Teresina: só a identificação das normas. Importação testada com a norma FICTÍCIA da "Cidade Exemplo".
function Harness() {
  const { data } = useCatalog()
  return data ? <RulesSection catalog={data} readOnly={false} /> : <p>carregando</p>
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

describe('Configurações › Legislação', () => {
  it('Base Legal: Teresina com o decreto, os anexos I, II e III e os decretos que o alteram', async () => {
    const user = userEvent.setup()
    renderWith(createMockDataSource({ latencyMs: 0, storage: null }))
    expect(await screen.findByRole('heading', { name: /TERESINA — PI/ })).toBeTruthy()
    expect(screen.getByText('Decreto Municipal nº 24.861/2023')).toBeTruthy()
    expect(screen.getByText('Anexo II — Classificação das atividades de “baixo risco A”')).toBeTruthy()
    expect(screen.getByText('Decreto Municipal nº 25.363/2023')).toBeTruthy()
    expect(screen.getByText('Decreto Municipal nº 28.436/2025')).toBeTruthy()
    expect(screen.getByText('Lei Complementar Municipal nº 6.048/2023')).toBeTruthy()
    expect(screen.getAllByText('Documento na biblioteca — aguardando importação').length).toBeGreaterThan(0)

    const anexoII = screen.getByText('Anexo II — Classificação das atividades de “baixo risco A”').closest('li')!
    await user.click(within(anexoII).getByRole('button', { name: 'Visualizar' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Conteúdo do anexo ainda não cadastrado/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: /fechar/i }))

    await user.type(screen.getByLabelText('CNAE (7 dígitos)'), '6911701')
    await user.click(screen.getByRole('button', { name: 'Pesquisar' }))
    expect(await screen.findByText(/REGRA NÃO CADASTRADA/)).toBeTruthy()
  })

  it('Pesquisar CNAE na Cidade Exemplo mostra classificação, Baixo Risco A e histórico legal', async () => {
    const user = userEvent.setup()
    renderWith(createMockDataSource({ latencyMs: 0, storage: null }))
    await screen.findByRole('heading', { name: /TERESINA — PI/ })
    await user.selectOptions(screen.getByLabelText('Localidade'), 'CIDADE EXEMPLO — PI')
    await user.type(screen.getByLabelText('CNAE (7 dígitos)'), '5611201')
    await user.click(screen.getByRole('button', { name: 'Pesquisar' }))
    const table = await screen.findByRole('table')
    expect(within(table).getByText('Sim, condicionado')).toBeTruthy()
    expect(screen.getAllByText('Alterada').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Vigente').length).toBeGreaterThan(0)
  })

  it('Importar legislação: prévia, revisão obrigatória e só então a confirmação do administrador', async () => {
    const user = userEvent.setup()
    const ds = createMockDataSource({ latencyMs: 0, storage: null })
    renderWith(ds)
    await screen.findByRole('heading', { name: /TERESINA — PI/ })
    await user.click(screen.getByRole('tab', { name: 'Importar legislação' }))

    const norm = (await ds.simulation.getRuleBase()).legislations.find((l) => l.city === 'Cidade Exemplo' && l.relation === null)!
    await user.selectOptions(screen.getByLabelText('Norma'), norm.id)
    await user.type(screen.getByLabelText(/Identificação da versão/), 'Redação de 2027 (teste)')
    await user.type(screen.getByLabelText(/Início da vigência/), '2027-01-01')
    const csv = 'cnae;anexo;classificacao\n6911701;II;Alto Risco\n7777777;II;Baixo Risco A\n'
    await user.upload(screen.getByLabelText('Arquivo'), new File([csv], 'anexo-ii.csv', { type: 'text/csv' }))

    const preview = await screen.findByRole('region', { name: 'Prévia da importação' })
    expect(within(preview).getByText('Novos').nextSibling?.textContent).toBe('1')
    expect(within(preview).getByText('Alterados').nextSibling?.textContent).toBe('1')
    const confirm = within(preview).getByRole('button', { name: /confirmar importação/i })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    expect(within(preview).getByText(/Revise as alterações antes de confirmar/)).toBeTruthy()

    await user.click(within(preview).getByRole('button', { name: /revisar alterações/i }))
    const review = await screen.findByRole('dialog', { name: 'Revisar alterações' })
    expect(within(review).getByText('6911-7/01')).toBeTruthy()
    await user.click(within(review).getByRole('button', { name: 'Concluir revisão' }))

    await waitFor(() => expect((within(preview).getByRole('button', { name: /confirmar importação/i }) as HTMLButtonElement).disabled).toBe(false))
    expect((await ds.simulation.getRuleBase()).versions.some((v) => v.label === 'Redação de 2027 (teste)')).toBe(false)

    await user.click(within(preview).getByRole('button', { name: /confirmar importação/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar importação?' })
    await user.click(within(dialog).getByRole('button', { name: /confirmar importação/i }))

    expect(await screen.findByText(/Publicado:/)).toBeTruthy()
    const base = await ds.simulation.getRuleBase()
    expect(base.versions.find((v) => v.label === 'Redação de 2027 (teste)')).toMatchObject({ validFrom: '2027-01-01' })
    expect(await ds.simulation.listImportBatches()).toHaveLength(1)
    expect(await screen.findByText('anexo-ii.csv')).toBeTruthy()
  })

  it('linhas com erro bloqueiam a publicação', async () => {
    const user = userEvent.setup()
    renderWith(createMockDataSource({ latencyMs: 0, storage: null }))
    await screen.findByRole('heading', { name: /TERESINA — PI/ })
    await user.click(screen.getByRole('tab', { name: 'Importar legislação' }))
    await user.type(screen.getByLabelText(/Identificação da versão/), 'Teste')
    await user.type(screen.getByLabelText(/Início da vigência/), '2027-01-01')
    await user.upload(screen.getByLabelText('Arquivo'), new File(['cnae;classificacao\n6911701;Risco Inventado\n'], 'erro.csv', { type: 'text/csv' }))
    expect(await screen.findByText(/classificação "Risco Inventado" não cadastrada/)).toBeTruthy()
    const preview = await screen.findByRole('region', { name: 'Prévia da importação' })
    expect((within(preview).getByRole('button', { name: /confirmar importação/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(preview).getByText(/Corrija as linhas com erro/)).toBeTruthy()
  })
})
