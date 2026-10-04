/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createMockDataSource } from '@/data/mock/mock-data-source'
import type { CatalogSnapshot, DataSource } from '@/data/types'
import { csvToTable, parseRuleTable } from '@/domain/simulation/csv-import'
import { legalTextKey, runSimulation } from '@/domain/simulation/engine'
import type { LegislationPackage, PackageImport } from '@/domain/simulation/legislation-package'
import { packageNormId } from '@/domain/simulation/legislation-package'
import { baseVersionFor, buildPublication, previewImport, type ImportLicenseEffect } from '@/domain/simulation/rule-import'
import type { AnswerValue, RuleBase } from '@/domain/simulation/types'
import { buildSimulationInput, type SimulationForm } from './simulation-service'

/**
 * Pipeline completo com os dados REAIS extraídos dos PDFs oficiais de Teresina (legislacao/teresina/dados):
 * pacote → prévia → publicação (como o administrador faria) → simulação com fonte documental.
 */
const DATA = join(process.cwd(), 'legislacao', 'teresina', 'dados')
const pkg = JSON.parse(readFileSync(join(DATA, 'legislacao_teresina.json'), 'utf8')) as LegislationPackage

let ds: DataSource
let catalog: CatalogSnapshot
let base: RuleBase

async function publish(item: PackageImport) {
  base = await ds.simulation.getRuleBase()
  const legislation = base.legislations.find((l) => packageNormId(l) === item.norma && l.city === 'Teresina')!
  const amendedBy = item.versao.alterada_por ? base.legislations.find((l) => packageNormId(l) === item.versao.alterada_por && l.city === 'Teresina')! : null
  const table = csvToTable(readFileSync(join(DATA, item.arquivo), 'utf8'))
  const parsed = parseRuleTable(table, {
    classifications: base.classifications,
    questions: base.questions,
    annexes: base.annexes.filter((a) => a.legislationId === legislation.id),
    licenseTypes: catalog.licenseTypes,
    documents: base.documents,
  })
  expect(parsed.errors).toEqual([])
  const baseVersion = baseVersionFor(base, legislation.id, item.versao.inicio)
  const preview = previewImport({ base, baseVersionId: baseVersion?.id ?? null, rows: parsed.rows, removals: parsed.removals, mode: item.modo })
  const effects: ImportLicenseEffect[] = item.efeitos
    ? pkg.efeitos.map((e) => ({
        classificationId: base.classifications.find((c) => c.code === e.classificacao_codigo)!.id,
        licenseTypeId: catalog.licenseTypes.find((t) => t.code === e.licenca)!.id,
        outcome: e.efeito,
        notes: e.fundamento,
      }))
    : []
  const publication = buildPublication(preview, {
    legislationId: legislation.id,
    target: {
      kind: 'nova_versao',
      closeBaseVersion: !!baseVersion,
      version: {
        label: item.versao.rotulo,
        validFrom: item.versao.inicio,
        validTo: null,
        highestRiskPrevails: item.versao.maior_risco_prevalece,
        sourceUrl: item.versao.fonte,
        notes: null,
        active: true,
        amendedByLegislationId: amendedBy?.id ?? null,
      },
    },
    fileName: item.arquivo.split('/').pop()!,
    sourceKind: 'csv',
    rowsTotal: parsed.totalLines,
    licenseEffects: effects,
  })
  await ds.simulation.publishImport(publication)
  return preview
}

function simulate(codes: string[], date: string, answersByCode: Record<string, AnswerValue> = {}) {
  const answers = Object.fromEntries(
    Object.entries(answersByCode).map(([code, value]) => [code.startsWith('texto:') ? code : base.questions.find((q) => q.code === code)!.id, value]),
  )
  const form: SimulationForm = { company: null, cnpj: null, cnaes: codes.map((code, i) => ({ code, description: null, primary: i === 0 })), uf: 'PI', city: 'Teresina', referenceDate: date }
  return runSimulation(base, buildSimulationInput(catalog, form, answers))
}

const outcome = (result: ReturnType<typeof simulate>, code: string) => result.licenses.find((l) => l.code === code)?.outcome

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage
  ds = createMockDataSource({ latencyMs: 0, storage, today: () => '2026-10-04' })
  catalog = await ds.catalog.getCatalog()
  const [original, d25363, d28436] = pkg.pacotes
  const p1 = await publish(original!)
  expect(p1.counts.novos).toBe(1034 * 3 + 298 + 85 * 2)
  const p2 = await publish(d25363!)
  expect(p2.counts).toMatchObject({ alterados: 67, novos: 0, removidos: 0 })
  const p3 = await publish(d28436!)
  expect(p3.counts).toMatchObject({ alterados: 11, novos: 0, removidos: 0 })
  base = await ds.simulation.getRuleBase()
  catalog = await ds.catalog.getCatalog()
  // tamanho dos dados da demonstração no navegador depois das três publicações
  const stored = store.get('alexandre-alvaras:demo-db') ?? ''
  console.info(`[teste] banco da demonstração: ${(stored.length / 1024 / 1024).toFixed(2)} MB`)
}, 120_000)

describe('base legal de Teresina importada dos documentos oficiais', () => {
  it('três versões do Decreto nº 24.861/2023, com as vigências encadeadas e o decreto modificador', () => {
    const decree = base.legislations.find((l) => l.number === '24.861')!
    const versions = base.versions.filter((v) => v.legislationId === decree.id).sort((a, b) => a.validFrom.localeCompare(b.validFrom))
    expect(versions.map((v) => [v.validFrom, v.validTo])).toEqual([
      ['2023-09-28', '2023-12-25'],
      ['2023-12-26', '2025-12-08'],
      ['2025-12-09', null],
    ])
    const names = new Map(base.legislations.map((l) => [l.id, l.number]))
    expect(versions.map((v) => (v.amendedByLegislationId ? names.get(v.amendedByLegislationId) : null))).toEqual([null, '25.363', '28.436'])
  })

  it('Baixo Risco A (Anexo II): dispensa municipal, Bombeiros em análise separada e fonte na página do DOM', () => {
    const result = simulate(['4642-7/01'], '2026-10-04')
    expect(result.overall.classification?.name).toBe('Baixo Risco A')
    expect([outcome(result, 'alvara'), outcome(result, 'vigilancia'), outcome(result, 'ambiental'), outcome(result, 'bombeiros')]).toEqual([
      'dispensada',
      'dispensada',
      'dispensada',
      'analise_separada',
    ])
    const rule = result.cnaes[0]!.evaluations[0]!.rules[0]!
    expect(rule.source).toMatchObject({ page: 15, status: 'oficial_confirmado' })
    expect(rule.source?.url).toBe('/legislacao/teresina/2023/Decreto_24861_2023_original_DOM3609.pdf#page=15')
    expect(rule.annexLabel).toContain('Anexo II')
    expect(result.justification.join(' ')).toContain('pág. 15')
  })

  it('Anexo I: não é Baixo Risco A → Alvará exigível; riscos ambiental e sanitário por área', () => {
    const result = simulate(['2013-4/01'], '2026-10-04')
    expect(result.overall.classification?.name).toBe('Não enquadrada como Baixo Risco A')
    expect(outcome(result, 'alvara')).toBe('exigivel')
    expect(outcome(result, 'ambiental')).toBe('exigivel')
    expect(outcome(result, 'vigilancia')).toBe('dispensada')
  })

  it('faixa de área do Decreto nº 25.363/2023 (padaria com revenda): ≤ 10 m² dispensa a licença ambiental', () => {
    expect(outcome(simulate(['4721-1/02'], '2026-10-04', { area_m2: 8 }), 'ambiental')).toBe('dispensada')
    expect(outcome(simulate(['4721-1/02'], '2026-10-04', { area_m2: 50 }), 'ambiental')).toBe('exigivel')
    const pending = simulate(['4721-1/02'], '2026-10-04')
    expect(outcome(pending, 'ambiental')).toBe('necessita_analise')
    const area = pending.cnaes[0]!.areaEvaluations.find((a) => a.licenseName === 'Licença Ambiental')!
    expect(area.evaluation.rules[0]!.source).toMatchObject({ page: 13 })
    expect(area.evaluation.norm.amendedBy?.label).toBe('Decreto Municipal nº 28.436/2025')
    expect(pending.legalBasis.amendments).toEqual([
      'Decreto Municipal nº 25.363/2023 (altera o Decreto Municipal nº 24.861/2023; vigência desde 26/12/2023)',
      'Decreto Municipal nº 28.436/2025 (altera o Decreto Municipal nº 24.861/2023; vigência desde 09/12/2025)',
    ])
  })

  it('simulação histórica: o mesmo CNAE antes e depois do Decreto nº 28.436/2025', () => {
    expect(outcome(simulate(['1099-6/99'], '2025-06-01'), 'vigilancia')).toBe('exigivel')
    expect(outcome(simulate(['1099-6/99'], '2026-10-04'), 'vigilancia')).toBe('analise_separada')
    expect(simulate(['1099-6/99'], '2023-01-01').overall.status).toBe('regra_nao_cadastrada')
  })

  it('condição do Anexo II transcrita da norma: enquadramento condicionado até a resposta', () => {
    const text = pkg.anexo_ii.find((r) => r.cnae === '6203-1/00')!.condicao_enquadramento
    const pending = simulate(['6203-1/00'], '2026-10-04')
    expect(pending.overall.status).toBe('condicionada')
    expect(simulate(['6203-1/00'], '2026-10-04', { [legalTextKey(text)]: true }).overall.classification?.name).toBe('Baixo Risco A')
    expect(simulate(['6203-1/00'], '2026-10-04', { [legalTextKey(text)]: false }).overall.status).toBe('necessita_analise')
  })

  it('vários CNAEs: a atividade de maior risco define o enquadramento (art. 5º) e é apontada', () => {
    const result = simulate(['4642-7/01', '2013-4/01'], '2026-10-04')
    expect(result.overall).toMatchObject({ status: 'classificada', drivers: ['2013401'] })
    expect(outcome(result, 'alvara')).toBe('exigivel')
  })

  it('todas as regras publicadas guardam documento e página', () => {
    const rules = base.cnaeRules.filter((r) => r.active && base.versions.some((v) => v.id === r.legislationVersionId && base.legislations.find((l) => l.id === v.legislationId)?.city === 'Teresina'))
    expect(rules.length).toBeGreaterThan(10_000)
    expect(rules.every((r) => r.sourceDocumentId && r.sourcePage)).toBe(true)
  })
})
