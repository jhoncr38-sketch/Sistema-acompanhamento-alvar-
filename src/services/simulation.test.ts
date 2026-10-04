import { beforeEach, describe, expect, it } from 'vitest'
import { createMockDataSource } from '@/data/mock/mock-data-source'
import { createDemoDatabase } from '@/data/mock/demo-seed'
import type { CatalogSnapshot, DataSource } from '@/data/types'
import { DEMO_CITY } from '@/config/simulation'
import { planCompanyChanges, toAppliedChanges } from '@/domain/simulation/apply'
import { parseRulesCsv } from '@/domain/simulation/csv-import'
import { collectQuestions, legalTextKey, runSimulation } from '@/domain/simulation/engine'
import { baseVersionFor, buildPublication, previewImport } from '@/domain/simulation/rule-import'
import type { AnswerValue, RuleBase } from '@/domain/simulation/types'
import { buildSimulationInput, companyCnaes, saveSimulationRun, searchCnpjForSimulation, validateSimulationForm, type SimulationForm } from './simulation-service'

// Usa a norma FICTÍCIA do modo demonstração (EXEMPLO FICTÍCIO, na "Cidade Exemplo"), nunca legislação real.
const TODAY = '2026-10-04'
const DEMO_TEXT = 'Desde que não haja preparo de alimentos no local (texto fictício de exemplo).'
const CURRENT_LABEL = 'Redação dada pelo Decreto fictício nº 001/2025'
let ds: DataSource
let catalog: CatalogSnapshot
let base: RuleBase

const form = (codes: string[], extra: Partial<SimulationForm> = {}): SimulationForm => ({
  company: null,
  cnpj: null,
  cnaes: codes.map((code, i) => ({ code, description: null, primary: i === 0 })),
  uf: 'PI',
  city: DEMO_CITY,
  referenceDate: TODAY,
  ...extra,
})

function simulate(f: SimulationForm, answersByCode: Record<string, AnswerValue> = {}) {
  const answers = Object.fromEntries(
    Object.entries(answersByCode).map(([code, value]) => [code.startsWith('texto:') ? code : base.questions.find((q) => q.code === code)!.id, value]),
  )
  return runSimulation(base, buildSimulationInput(catalog, f, answers))
}

beforeEach(async () => {
  ds = createMockDataSource({ latencyMs: 0, storage: null, today: () => TODAY })
  catalog = await ds.catalog.getCatalog()
  base = await ds.simulation.getRuleBase()
})

describe('simulação com a base de regras', () => {
  it('a norma de demonstração é fictícia e fica na "Cidade Exemplo"; Teresina tem as normas e os documentos oficiais, sem regras', () => {
    const demo = base.legislations.filter((l) => l.city === DEMO_CITY)
    expect(demo.length).toBeGreaterThan(0)
    expect(demo.every((l) => l.title.includes('EXEMPLO FICTÍCIO'))).toBe(true)
    const teresina = base.legislations.filter((l) => l.city === 'Teresina')
    expect(teresina.map((l) => `${l.number}/${l.year}`)).toEqual(['5.788/2022', '24.861/2023', '25.363/2023', '6.048/2023', '28.436/2025'])
    expect(base.documents.filter((d) => teresina.some((l) => l.id === d.legislationId)).every((d) => d.status === 'oficial_confirmado' && d.sha256?.length === 64)).toBe(true)
    expect(base.cnaeRules.filter((r) => base.versions.some((v) => v.id === r.legislationVersionId && teresina.some((l) => l.id === v.legislationId)))).toEqual([])
    expect(base.versions.filter((v) => teresina.some((l) => l.id === v.legislationId))).toEqual([])
    const decree = teresina.find((l) => l.number === '24.861')!
    expect(base.annexes.filter((a) => a.legislationId === decree.id).map((a) => a.code)).toEqual(['I', 'II', 'III'])
    expect(teresina.filter((l) => l.relation === 'altera' && l.kind === 'decreto').every((l) => l.parentLegislationId === decree.id)).toBe(true)
  })

  it('Teresina: sem o conteúdo oficial, o resultado é Regra não cadastrada (nunca dispensa)', () => {
    const result = simulate(form(['6911701'], { city: 'Teresina' }))
    expect(result.overall.status).toBe('regra_nao_cadastrada')
    expect(result.pendingNorms.map((p) => [p.label, p.reason])).toEqual([['Decreto Municipal nº 24.861/2023', 'sem_versao_vigente']])
    expect(result.licenses.some((l) => l.outcome === 'dispensada')).toBe(false)
  })

  it('valida o formulário', () => {
    expect(validateSimulationForm(form([]))).toBe('Informe ao menos um CNAE.')
    expect(validateSimulationForm(form(['123']))).toContain('incompleto')
    expect(validateSimulationForm(form(['6911701', '6911-7/01']))).toContain('repetido')
    expect(validateSimulationForm(form(['6911701'], { city: ' ' }))).toBe('Informe o município.')
    expect(validateSimulationForm(form(['6911701']))).toBeNull()
  })

  it('simula sem empresa, só com o CNAE', () => {
    const result = simulate(form(['6911-7/01']))
    expect(result.overall).toMatchObject({ status: 'classificada', confidence: 'completa' })
    expect(result.overall.classification?.name).toBe('Baixo Risco A')
    expect(Object.fromEntries(result.licenses.map((l) => [l.code, l.outcome]))).toEqual({
      alvara: 'dispensada',
      vigilancia: 'dispensada',
      bombeiros: 'analise_separada',
      ambiental: 'dispensada',
    })
    expect(result.legalBasis).toMatchObject({ locality: `${DEMO_CITY} – PI`, referenceDate: TODAY })
    expect(result.legalBasis.amendments).toEqual(['Decreto Municipal nº 001/2025 (altera o Decreto Municipal nº 000/2024; vigência desde 01/01/2026)'])
  })

  it('múltiplos CNAEs: o de maior risco define o resultado e é apontado', () => {
    const result = simulate(form(['6911701', '1091102', '2512800']))
    expect(result.cnaes.map((c) => c.classification?.name)).toEqual(['Baixo Risco A', 'Baixo Risco B', 'Alto Risco'])
    expect(result.overall.classification?.name).toBe('Alto Risco')
    expect(result.overall.drivers).toEqual(['2512800'])
    expect(result.licenses.find((l) => l.code === 'alvara')?.outcome).toBe('exigivel')
  })

  it('CNAE sem regra: não conclui o enquadramento', () => {
    const result = simulate(form(['6911701', '8630503']))
    expect(result.overall).toMatchObject({ status: 'regra_nao_cadastrada', confidence: 'nao_cadastrada', drivers: ['8630503'] })
    expect(result.licenses.find((l) => l.code === 'alvara')?.outcome).toBe('necessita_analise')
  })

  it('condição pendente: pergunta o que a regra exige (inclusive o texto da norma) e condiciona o resultado', () => {
    const f = form(['5611203'])
    expect(collectQuestions(base, f).map((q) => [q.question.code, q.legalText])).toEqual([
      [legalTextKey(DEMO_TEXT), true],
      ['armazena_produto', false],
    ])
    expect(simulate(f, { armazena_produto: false }).overall).toMatchObject({ status: 'condicionada', confidence: 'condicionada' })
    expect(simulate(f, { [legalTextKey(DEMO_TEXT)]: true, armazena_produto: false }).overall).toMatchObject({ status: 'classificada', confidence: 'completa' })
    expect(simulate(f, { [legalTextKey(DEMO_TEXT)]: false }).overall.status).toBe('necessita_analise')
  })

  it('classificação de área do Anexo I: risco sanitário alto exige a Vigilância mesmo com enquadramento geral B', () => {
    const result = simulate(form(['1091102']))
    expect(result.overall.classification?.name).toBe('Baixo Risco B')
    expect(result.licenses.find((l) => l.code === 'vigilancia')).toMatchObject({ outcome: 'exigivel' })
  })

  it('versionamento por data: a mesma atividade em 2025 e em 2026', () => {
    const in2025 = simulate(form(['5611201'], { referenceDate: '2025-06-30' }))
    expect(in2025.overall.classification?.name).toBe('Baixo Risco B')
    expect(in2025.norms[0]).toMatchObject({ versionLabel: 'Redação original (exemplo)', validTo: '2025-12-31' })
    expect(collectQuestions(base, form(['5611201'], { referenceDate: '2025-06-30' }))).toEqual([])

    const in2026 = simulate(form(['5611201']), { area_m2: 150 })
    expect(in2026.overall.classification?.name).toBe('Baixo Risco A')
    expect(in2026.norms[0]).toMatchObject({ versionLabel: CURRENT_LABEL, validTo: null })
    expect(in2026.norms[0]?.amendedBy?.label).toBe('Decreto Municipal nº 001/2025')
    expect(simulate(form(['5611201']), { area_m2: 400 }).overall.classification?.name).toBe('Baixo Risco B')
    expect(simulate(form(['5611201'], { referenceDate: '2023-06-30' })).overall.status).toBe('regra_nao_cadastrada')
  })

  it('outra localidade não usa a norma da Cidade Exemplo', () => {
    expect(simulate(form(['6911701'], { city: 'Parnaíba' })).overall.status).toBe('regra_nao_cadastrada')
  })
})

describe('histórico de simulações', () => {
  it('cada simulação é salva com número, usuário e cópia completa do resultado', async () => {
    const f = form(['6911701', '2512800'])
    const first = await saveSimulationRun(ds, f, simulate(f))
    const second = await saveSimulationRun(ds, form(['8630503']), simulate(form(['8630503'])))
    expect([first.number, second.number]).toEqual([1, 2])
    expect(first).toMatchObject({ userName: 'João Ribeiro', uf: 'PI', city: DEMO_CITY, referenceDate: TODAY, overallStatus: 'classificada', classificationName: 'Alto Risco' })

    const list = await ds.simulation.listRuns()
    expect(list.map((r) => r.number)).toEqual([2, 1])
    expect(list[0]).toMatchObject({ overallStatus: 'regra_nao_cadastrada', confidence: 'nao_cadastrada' })
    expect('result' in list[0]!).toBe(false)

    const stored = await ds.simulation.getRun(first.id)
    expect(stored?.result).toEqual(first.result)
    expect(stored?.result.norms[0]?.versionLabel).toBe(CURRENT_LABEL)
    expect(stored?.result.justification.length).toBeGreaterThan(0)
  })

  it('a simulação guardada não muda quando a regra é alterada depois', async () => {
    const f = form(['6911701'])
    const run = await saveSimulationRun(ds, f, simulate(f))
    const rule = base.cnaeRules.find((r) => r.cnaeCode === '6911701' && r.active && r.legislationVersionId === base.versions.find((v) => v.validTo === null)!.id)!
    const alto = base.classifications.find((c) => c.code === 'alto_risco')!
    await ds.simulation.saveCnaeRule({ ...rule, classificationId: alto.id })

    expect((await ds.simulation.getRun(run.id))?.result.overall.classification?.name).toBe('Baixo Risco A')
    base = await ds.simulation.getRuleBase()
    expect(simulate(f).overall.classification?.name).toBe('Alto Risco')
  })

  it('perfil Consulta simula, mas não grava no histórico', async () => {
    await ds.demo!.switchUser('consulta')
    const f = form(['6911701'])
    await expect(saveSimulationRun(ds, f, simulate(f))).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(await ds.simulation.listRuns()).toEqual([])
  })
})

describe('simulação vinculada a empresa', () => {
  it('encontra empresa cadastrada pelo CNPJ e usa todos os CNAEs dela', async () => {
    const companies = await ds.companies.list()
    const found = await searchCnpjForSimulation(ds, catalog, companies, '00.000.000/0001-00')
    expect(found.kind).toBe('empresa')
    if (found.kind !== 'empresa') return
    expect(found.company.legalName).toBe('Padaria Central LTDA')
    expect(found.cnaes.map((c) => [c.code, c.primary])).toEqual([
      ['1091102', true],
      ['4721102', false],
    ])
    expect(companyCnaes(found.company, catalog)[0]?.description).toContain('padaria')
  })

  it('aplica o resultado: dispensa, monitoramento e pendência, sem excluir nada', async () => {
    const companies = await ds.companies.list()
    const company = companies.find((c) => c.legalName === 'Moura & Associados Advocacia')!
    const f = form(['6911701'], { company: { id: company.id, name: company.legalName, cnpj: company.cnpj } })
    const run = await saveSimulationRun(ds, f, simulate(f))
    const before = await ds.licenses.listByCompany(company.id)
    const type = (code: string) => catalog.licenseTypes.find((t) => t.code === code)!.id

    const plans = planCompanyChanges(run.result, before, run)
    expect(plans.find((p) => p.licenseTypeId === type('alvara'))).toMatchObject({ action: 'alterar', current: 'aplicavel', next: 'dispensada' })
    expect(plans.find((p) => p.licenseTypeId === type('vigilancia'))).toMatchObject({ action: 'adicionar', next: 'dispensada' })
    expect(plans.find((p) => p.licenseTypeId === type('bombeiros'))?.next).toBeNull()
    expect(plans.find((p) => p.licenseTypeId === type('ambiental'))?.next).toBe('dispensada')

    const changes = toAppliedChanges(plans)
    const added = plans.filter((p) => p.action === 'adicionar').length
    await ds.simulation.applyToCompany(run.id, company.id, changes)
    const after = await ds.licenses.listByCompany(company.id)
    expect(after).toHaveLength(before.length + added)
    const alvara = after.find((l) => l.licenseTypeId === type('alvara'))!
    expect(alvara.applicability).toBe('dispensada')
    expect(alvara.notes).toContain(`Simulação nº ${run.number}`)
    expect(alvara.expiresAt).toBe(before.find((l) => l.licenseTypeId === type('alvara'))!.expiresAt)
    expect(await ds.consultations.list({ companyId: company.id })).not.toHaveLength(0)

    const stored = await ds.simulation.getRun(run.id)
    expect(stored?.applications).toHaveLength(1)
    expect(stored?.applications[0]?.changes).toHaveLength(changes.length)
    expect((await ds.simulation.listRuns({ companyId: company.id })).map((r) => r.id)).toEqual([run.id])
    await expect(ds.companies.remove(company.id)).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})

describe('painel de regras', () => {
  it('somente administrador altera legislação e regras', async () => {
    await ds.demo!.switchUser('contador')
    await expect(ds.simulation.saveClassification({ code: 'x', name: 'X', severity: 1, tone: 'gray', active: true })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(ds.simulation.setCnaeRuleActive(base.cnaeRules[0]!.id, false)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect((await ds.simulation.getRuleBase()).cnaeRules[0]?.active).toBe(true)
  })

  it('versões não se sobrepõem; nova versão encerra a anterior e copia as regras', async () => {
    const current = base.versions.find((v) => v.validTo === null)!
    const draft = {
      legislationId: current.legislationId,
      label: 'Redação de 2027',
      validFrom: '2027-01-01',
      validTo: null,
      highestRiskPrevails: true,
      sourceUrl: null,
      notes: null,
      active: true,
      amendedByLegislationId: null,
    }
    await expect(ds.simulation.saveVersion(draft)).rejects.toMatchObject({ code: 'CONFLICT' })

    const created = await ds.simulation.saveVersion(draft, { closePreviousVersionId: current.id, copyRulesFromVersionId: current.id })
    const next = await ds.simulation.getRuleBase()
    expect(next.versions.find((v) => v.id === current.id)?.validTo).toBe('2026-12-31')
    const copied = next.cnaeRules.filter((r) => r.legislationVersionId === created.id)
    const original = next.cnaeRules.filter((r) => r.legislationVersionId === current.id)
    expect(copied).toHaveLength(original.length)
    expect(copied.every((r) => original.every((o) => o.id !== r.id))).toBe(true)
    expect(next.licenseRules.filter((r) => r.legislationVersionId === created.id).length).toBeGreaterThan(0)

    base = next
    expect(simulate(form(['6911701'])).norms[0]?.versionLabel).toBe(CURRENT_LABEL)
    expect(simulate(form(['6911701'], { referenceDate: '2027-03-01' })).norms[0]?.versionLabel).toBe('Redação de 2027')
  })

  it('desativar regra faz o CNAE voltar a "regra não cadastrada", sem apagar a regra', async () => {
    const version = base.versions.find((v) => v.validTo === null)!
    const rule = base.cnaeRules.find((r) => r.cnaeCode === '6911701' && r.legislationVersionId === version.id)!
    await ds.simulation.setCnaeRuleActive(rule.id, false)
    base = await ds.simulation.getRuleBase()
    expect(base.cnaeRules.some((r) => r.id === rule.id && !r.active)).toBe(true)
    expect(simulate(form(['6911701'])).overall.status).toBe('regra_nao_cadastrada')
  })

  it('importação revisada publica NOVA versão: a anterior é preservada e as simulações antigas não mudam', async () => {
    const legislation = base.legislations.find((l) => l.city === DEMO_CITY && l.relation === null)!
    const current = base.versions.find((v) => v.legislationId === legislation.id && v.validTo === null)!
    const before = await saveSimulationRun(ds, form(['6911701']), simulate(form(['6911701'])))
    const csv = ['cnae;descricao;anexo;classificacao;condicao_texto', '6911701;;II;Alto Risco;', '7777777;Atividade de teste;II;Baixo Risco A;Desde que (condição de teste)'].join('\n')
    const parsed = parseRulesCsv(csv, { classifications: base.classifications, questions: base.questions, annexes: base.annexes.filter((a) => a.legislationId === legislation.id), licenseTypes: catalog.licenseTypes })
    expect(parsed.errors).toEqual([])
    expect(baseVersionFor(base, legislation.id, '2027-01-01')?.id).toBe(current.id)
    const preview = previewImport({ base, baseVersionId: current.id, rows: parsed.rows, mode: 'parcial' })
    expect(preview.counts).toMatchObject({ novos: 1, alterados: 1, removidos: 0 })
    const publication = buildPublication(preview, {
      legislationId: legislation.id,
      target: {
        kind: 'nova_versao',
        closeBaseVersion: true,
        version: { label: 'Redação de 2027 (importada)', validFrom: '2027-01-01', validTo: null, highestRiskPrevails: true, sourceUrl: null, notes: null, active: true, amendedByLegislationId: null },
      },
      fileName: 'anexo-ii.csv',
      sourceKind: 'csv',
      rowsTotal: parsed.totalLines,
    })

    await ds.demo!.switchUser('contador')
    await expect(ds.simulation.publishImport(publication)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await ds.demo!.switchUser('administrador')
    expect((await ds.simulation.getRuleBase()).versions).toHaveLength(base.versions.length)

    const { versionId, inserted } = await ds.simulation.publishImport(publication)
    expect(inserted).toBe(2)
    base = await ds.simulation.getRuleBase()
    catalog = await ds.catalog.getCatalog()
    expect(base.versions.find((v) => v.id === current.id)?.validTo).toBe('2026-12-31')
    expect(base.cnaeRules.filter((r) => r.legislationVersionId === current.id && r.active).length).toBeGreaterThan(0)
    expect(base.cnaeRules.filter((r) => r.legislationVersionId === versionId && r.cnaeCode === '6911701').map((r) => r.classificationId)).toEqual([
      base.classifications.find((c) => c.code === 'alto_risco')!.id,
    ])
    expect(catalog.cnaes.find((c) => c.code === '7777777')?.description).toBe('Atividade de teste')

    expect(simulate(form(['6911701'])).overall.classification?.name).toBe('Baixo Risco A')
    expect(simulate(form(['6911701'], { referenceDate: '2027-03-01' })).overall.classification?.name).toBe('Alto Risco')
    expect(simulate(form(['7777777'], { referenceDate: '2027-03-01' })).overall.status).toBe('condicionada')
    expect(simulate(form(['5611201'], { referenceDate: '2027-03-01' }), { area_m2: 100 }).overall.classification?.name).toBe('Baixo Risco A')
    expect((await ds.simulation.getRun(before.id))?.result.overall.classification?.name).toBe('Baixo Risco A')

    const batches = await ds.simulation.listImportBatches()
    expect(batches).toHaveLength(1)
    expect(batches[0]).toMatchObject({ fileName: 'anexo-ii.csv', versionId, mode: 'parcial', counts: { novos: 1, alterados: 1 } })
  })

  it('publicação inválida não grava nada', async () => {
    const legislation = base.legislations.find((l) => l.city === DEMO_CITY && l.relation === null)!
    const current = base.versions.find((v) => v.legislationId === legislation.id && v.validTo === null)!
    const rule = {
      cnaeCode: '7777777',
      cboCode: null,
      cnaeDescription: null,
      annexId: null,
      annex: null,
      licenseTypeId: null,
      classificationId: 'nao-existe',
      elseClassificationId: null,
      priority: 1,
      conditions: [],
      article: null,
      item: null,
      notes: null,
      description: '',
      sourceDocumentId: null,
      sourcePage: null,
    }
    const batch = { fileName: 'x.csv', sourceKind: 'csv' as const, mode: 'parcial' as const, rowsTotal: 1, counts: { encontrados: 1, novos: 1, alterados: 0, removidos: 0, inalterados: 0, condicoesModificadas: 0 } }
    await expect(
      ds.simulation.publishImport({
        legislationId: legislation.id,
        target: { kind: 'nova_versao', closeBaseVersion: true, version: { label: 'Falha', validFrom: '2027-01-01', validTo: null, highestRiskPrevails: true, sourceUrl: null, notes: null, active: true, amendedByLegislationId: null } },
        copyFromVersionId: current.id,
        excludeRuleIds: [],
        deactivateRuleIds: [],
        insertRules: [rule],
        licenseEffects: [],
        batch,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    const after = await ds.simulation.getRuleBase()
    expect(after.versions).toHaveLength(base.versions.length)
    expect(after.versions.find((v) => v.id === current.id)?.validTo).toBeNull()
    expect(after.cnaeRules).toHaveLength(base.cnaeRules.length)
    expect(await ds.simulation.listImportBatches()).toEqual([])
  })

  it('efeito nas licenças pode ser removido (desativado) e a licença volta a "sem regra"', async () => {
    const version = base.versions.find((v) => v.validTo === null)!
    const a = base.classifications.find((c) => c.code === 'baixo_risco_a')!
    const alvara = catalog.licenseTypes.find((t) => t.code === 'alvara')!
    await ds.simulation.saveLicenseRule({ legislationVersionId: version.id, classificationId: a.id, licenseTypeId: alvara.id, outcome: null })
    base = await ds.simulation.getRuleBase()
    expect(simulate(form(['6911701'])).licenses.find((l) => l.code === 'alvara')?.outcome).toBe('sem_regra')
    await ds.simulation.saveLicenseRule({ legislationVersionId: version.id, classificationId: a.id, licenseTypeId: alvara.id, outcome: 'exigivel' })
    base = await ds.simulation.getRuleBase()
    expect(simulate(form(['6911701'])).licenses.find((l) => l.code === 'alvara')?.outcome).toBe('exigivel')
  })
})

describe('atualização dos dados de demonstração', () => {
  it('dados salvos na versão anterior ganham a Simulação sem perder o que já existia', async () => {
    const legacy = createDemoDatabase(TODAY) as unknown as Record<string, unknown>
    for (const key of ['legislations', 'legislationVersions', 'legislationAnnexes', 'riskClassifications', 'ruleQuestions', 'cnaeRules', 'licenseRules', 'simulationRuns', 'simulationApplications', 'importBatches'])
      delete legacy[key]
    legacy.version = 2
    ;(legacy.companies as { legalName: string }[])[0]!.legalName = 'Empresa Alterada Pelo Usuário'
    const store = new Map<string, string>([['alexandre-alvaras:demo-db', JSON.stringify(legacy)]])
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage

    const upgraded = createMockDataSource({ latencyMs: 0, storage, today: () => TODAY })
    expect((await upgraded.companies.list())[0]?.legalName).toBe('Empresa Alterada Pelo Usuário')
    const rules = await upgraded.simulation.getRuleBase()
    expect(rules.classifications).toHaveLength(9)
    expect(rules.legislations.some((l) => l.title.includes('EXEMPLO FICTÍCIO'))).toBe(true)
    expect(rules.annexes.length).toBeGreaterThan(0)
    expect(JSON.parse(store.get('alexandre-alvaras:demo-db')!).version).toBe(6)
  })

  it('versão 5: só liga a coluna da Acessibilidade e preserva as importações já aprovadas', async () => {
    const legacy = createDemoDatabase(TODAY) as unknown as Record<string, unknown>
    const acess = (legacy.licenseTypes as { id: string; code: string }[]).find((t) => t.code === 'acessibilidade')!
    legacy.sectorLicenseRules = (legacy.sectorLicenseRules as { licenseTypeId: string; showInTable: boolean }[]).map((r) => (r.licenseTypeId === acess.id ? { ...r, showInTable: false } : r))
    legacy.importBatches = [{ id: 'lote-aprovado', fileName: 'importacao_decreto_24861_2023_redacao_original.csv' }]
    legacy.version = 5
    const ruleCount = (legacy.cnaeRules as unknown[]).length
    const store = new Map<string, string>([['alexandre-alvaras:demo-db', JSON.stringify(legacy)]])
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage
    const upgraded = createMockDataSource({ latencyMs: 0, storage, today: () => TODAY })
    expect((await upgraded.simulation.listImportBatches()).map((b) => b.id)).toEqual(['lote-aprovado'])
    expect((await upgraded.simulation.getRuleBase()).cnaeRules).toHaveLength(ruleCount)
    const cat = await upgraded.catalog.getCatalog()
    expect(cat.sectorLicenseRules.filter((r) => r.licenseTypeId === acess.id).every((r) => r.showInTable)).toBe(true)
  })

  it('versão 3: atualiza a base de regras e preserva o histórico de simulações', async () => {
    const legacy = createDemoDatabase(TODAY) as unknown as Record<string, unknown>
    delete legacy.legislationAnnexes
    delete legacy.importBatches
    legacy.version = 3
    legacy.simulationRuns = [{ id: 'run-antiga', number: 1, cnaes: [], result: {} }]
    const store = new Map<string, string>([['alexandre-alvaras:demo-db', JSON.stringify(legacy)]])
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage
    const upgraded = createMockDataSource({ latencyMs: 0, storage, today: () => TODAY })
    expect((await upgraded.simulation.listRuns()).map((r) => r.id)).toEqual(['run-antiga'])
    expect((await upgraded.simulation.getRuleBase()).legislations.some((l) => l.city === 'Teresina')).toBe(true)
    expect(await upgraded.simulation.listImportBatches()).toEqual([])
  })
})
