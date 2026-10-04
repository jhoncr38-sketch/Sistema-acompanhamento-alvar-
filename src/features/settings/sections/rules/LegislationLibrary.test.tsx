// @vitest-environment jsdom
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DataSourceProvider } from '@/app/data-context'
import { SessionProvider } from '@/app/session'
import { ToastProvider } from '@/components/ui/Toast'
import { createMockDataSource } from '@/data/mock/mock-data-source'
import type { DataSource } from '@/data/types'
import { useCatalog } from '@/hooks/queries'
import { RulesSection } from './RulesSection'

// A biblioteca (legislacao/) é servida pelo app em /legislacao; no teste, os arquivos vêm do disco.
beforeAll(() => {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const path = String(input)
    if (!path.startsWith('/legislacao/')) return new Response('', { status: 404 })
    try {
      const body = readFileSync(join(process.cwd(), decodeURIComponent(path.split('#')[0]!)))
      return new Response(body, { status: 200 })
    } catch {
      return new Response('', { status: 404 })
    }
  })
})
afterAll(() => vi.unstubAllGlobals())
afterEach(cleanup)

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

describe('Configurações › Legislação › Documentos (Teresina)', { timeout: 60_000 }, () => {
  it('cards dos documentos oficiais com situação, publicação, anexos, dados extraídos e as ações', async () => {
    const user = userEvent.setup()
    renderWith(createMockDataSource({ latencyMs: 0, storage: null }))
    await screen.findByRole('heading', { name: /TERESINA — PI/ })
    await user.click(screen.getByRole('tab', { name: 'Documentos' }))

    const card = (await screen.findAllByText('Decreto Municipal nº 24.861/2023'))[0]!.closest('div.flex.flex-col') as HTMLElement
    expect(within(card).getByText('Oficial confirmado')).toBeTruthy()
    expect(within(card).getByText(/28\/09\/2023 · DOM nº 3\.609/)).toBeTruthy()
    expect(await within(card).findByText('1332 CNAEs · 85 CBOs')).toBeTruthy()
    expect(within(card).getByText('Aguardando importação e aprovação')).toBeTruthy()
    expect(within(card).getByRole('link', { name: /ver documento/i }).getAttribute('href')).toBe('/legislacao/teresina/2023/Decreto_24861_2023_original_DOM3609.pdf')

    await user.click(within(card).getByRole('button', { name: /ver dados extraídos/i }))
    const dialog = await screen.findByRole('dialog', { name: /Dados extraídos — Decreto Municipal nº 24\.861\/2023/ })
    expect(within(dialog).getByRole('tab', { name: 'Anexo I (1034)' })).toBeTruthy()
    await user.type(within(dialog).getByRole('searchbox', { name: 'Buscar' }), '4721-1/02')
    const row = within(dialog).getByText('4721-1/02').closest('tr')!
    expect(within(row).getByRole('link', { name: /pág\. 12/ }).getAttribute('href')).toBe('/legislacao/teresina/2023/Decreto_24861_2023_original_DOM3609.pdf#page=12')
    await user.click(within(dialog).getByRole('tab', { name: /^Anexo II —/ }))
    await user.clear(within(dialog).getByRole('searchbox', { name: 'Buscar' }))
    await user.type(within(dialog).getByRole('searchbox', { name: 'Buscar' }), '6203')
    expect(within(dialog).getByText(/Desde que não haja o desenvolvimento de softwares/)).toBeTruthy()
  })

  it('ver alterações do Decreto nº 24.861/2023: regra anterior × nova regra, norma modificadora e vigência', async () => {
    const user = userEvent.setup()
    renderWith(createMockDataSource({ latencyMs: 0, storage: null }))
    await screen.findByRole('heading', { name: /TERESINA — PI/ })
    await user.click(screen.getByRole('tab', { name: 'Documentos' }))
    const card = (await screen.findAllByText('Decreto Municipal nº 24.861/2023'))[0]!.closest('div.flex.flex-col') as HTMLElement
    await within(card).findByText('1332 CNAEs · 85 CBOs')
    await user.click(within(card).getByRole('button', { name: /ver alterações/i }))
    const dialog = await screen.findByRole('dialog', { name: /Alterações — Decreto Municipal nº 24\.861\/2023/ })
    await user.type(within(dialog).getByRole('searchbox', { name: 'Buscar' }), '1099-6/99')
    const row = within(dialog).getByText('1099-6/99').closest('tr')!
    expect(within(row).getByText('COMPETÊNCIA ESTADUAL')).toBeTruthy()
    expect(within(row).getByText('Decreto nº 28.436/2025')).toBeTruthy()
    expect(within(row).getByText('09/12/2025')).toBeTruthy()
  })

  it('verificar nova legislação: arquitetura pronta, sem raspagem (integração pendente)', async () => {
    const user = userEvent.setup()
    renderWith(createMockDataSource({ latencyMs: 0, storage: null }))
    await screen.findByRole('heading', { name: /TERESINA — PI/ })
    await user.click(screen.getByRole('tab', { name: 'Documentos' }))
    await user.click(await screen.findByRole('button', { name: /verificar nova legislação/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Verificar nova legislação' })
    await user.click(within(dialog).getByRole('button', { name: /verificar agora/i }))
    expect(await within(dialog).findByText(/INTEGRAÇÃO PENDENTE/)).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: /Abrir o Diário Oficial/ }).getAttribute('href')).toBe('https://dom.pmt.pi.gov.br/lista_diario.php')
  })

  it('pacote extraído carregado no assistente: prévia com efeitos, revisão obrigatória e publicação com fonte', async () => {
    const user = userEvent.setup()
    const ds = createMockDataSource({ latencyMs: 0, storage: null })
    renderWith(ds)
    await screen.findByRole('heading', { name: /TERESINA — PI/ })
    await user.click(screen.getByRole('tab', { name: 'Importar legislação' }))
    const packages = await screen.findByRole('region', { name: 'Pacotes extraídos dos documentos oficiais' })
    const original = (await within(packages).findByText('Redação original (Decreto nº 24.861/2023)')).closest('li')!
    expect(within(original).getByText('Aguardando aprovação')).toBeTruthy()
    await user.click(within(original).getByRole('button', { name: 'Carregar no assistente' }))

    const preview = await screen.findByRole('region', { name: 'Prévia da importação' }, { timeout: 15000 })
    expect(within(preview).getByText('Novos').nextSibling?.textContent).toBe('3570')
    expect(within(preview).getByText('Efeitos nas licenças').nextSibling?.textContent).toBe('13')
    expect((screen.getByLabelText(/Início da vigência/) as HTMLInputElement).value).toBe('2023-09-28')
    expect((within(preview).getByRole('button', { name: /confirmar importação/i }) as HTMLButtonElement).disabled).toBe(true)
    expect((await ds.simulation.getRuleBase()).versions.some((v) => v.label.startsWith('Redação original (Decreto'))).toBe(false)

    await user.click(within(preview).getByRole('button', { name: /revisar alterações/i }))
    const review = await screen.findByRole('dialog', { name: 'Revisar alterações' })
    await user.click(within(review).getByRole('tab', { name: 'Efeitos nas licenças (13)' }))
    expect(within(review).getAllByText(/Decreto nº 24\.861\/2023, art\. 2º/).length).toBeGreaterThan(0)
    await user.click(within(review).getByRole('button', { name: 'Concluir revisão' }))
    await user.click(within(preview).getByRole('button', { name: /confirmar importação/i }))
    const confirm = await screen.findByRole('dialog', { name: 'Confirmar importação?' })
    await user.click(within(confirm).getByRole('button', { name: /confirmar importação/i }))
    expect(await screen.findByText(/Publicado:/, undefined, { timeout: 15000 })).toBeTruthy()

    const base = await ds.simulation.getRuleBase()
    const version = base.versions.find((v) => v.label === 'Redação original (Decreto nº 24.861/2023)')!
    expect(version).toMatchObject({ validFrom: '2023-09-28', highestRiskPrevails: true })
    const rules = base.cnaeRules.filter((r) => r.legislationVersionId === version.id)
    expect(rules).toHaveLength(3570)
    expect(rules.every((r) => r.sourceDocumentId && r.sourcePage)).toBe(true)
    expect(base.licenseRules.filter((r) => r.legislationVersionId === version.id)).toHaveLength(13)
  }, 60_000)
})
