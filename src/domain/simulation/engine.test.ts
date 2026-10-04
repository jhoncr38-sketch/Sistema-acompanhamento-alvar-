import { describe, expect, it } from 'vitest'
import { collectQuestions, findOverlappingVersion, findPendingNorms, legalTextKey, NO_RULE_MESSAGE, runSimulation, selectApplicableVersions } from './engine'
import type {
  CnaeRule,
  Legislation,
  LegislationAnnex,
  LegislationVersion,
  LicenseOutcome,
  LicenseRule,
  LicenseTypeRef,
  RiskClassification,
  RuleBase,
  RuleCondition,
  RuleQuestion,
  SimulationInput,
} from './types'

// Regras FICTÍCIAS, usadas apenas para testar o motor.
const cls = (code: string, name: string, severity: number): RiskClassification => ({ id: code, code, name, severity, tone: 'gray', active: true })
const A = cls('a', 'Baixo Risco A', 10)
const B = cls('b', 'Baixo Risco B', 20)
const ALTO = cls('alto', 'Alto Risco', 40)

const AREA: RuleQuestion = { id: 'q-area', code: 'area_m2', text: 'Área utilizada pelo estabelecimento', type: 'numero', unit: 'm²', options: [], helpText: null, active: true }
const RESIDENCIA: RuleQuestion = { id: 'q-res', code: 'residencia', text: 'A atividade é exercida em residência?', type: 'sim_nao', unit: null, options: [], helpText: null, active: true }
const PORTE: RuleQuestion = {
  id: 'q-porte',
  code: 'porte',
  text: 'Porte',
  type: 'opcoes',
  unit: null,
  options: [
    { value: 'mei', label: 'MEI' },
    { value: 'me', label: 'ME' },
    { value: 'epp', label: 'EPP' },
  ],
  helpText: null,
  active: true,
}

const lt = (code: string, name: string, agency: string): LicenseTypeRef => ({ id: `lt-${code}`, code, name, shortName: name, agency })
const ALVARA = lt('alvara', 'Alvará de Funcionamento', 'Prefeitura')
const SANITARIA = lt('vigilancia', 'Vigilância Sanitária', 'DIVISA')
const AMBIENTAL = lt('ambiental', 'Licença Ambiental', 'SEMARH')
const BOMBEIROS = lt('bombeiros', 'Bombeiros', 'CBMEPI')
const CRMV = lt('crmv', 'Registro no CRMV', 'CRMV-PI')
const LICENSE_TYPES = [ALVARA, SANITARIA, AMBIENTAL, BOMBEIROS, CRMV]
const CORE = ['alvara', 'vigilancia', 'ambiental', 'bombeiros']

let seq = 0
const id = (prefix: string) => `${prefix}-${++seq}`

function leg(overrides: Partial<Legislation> = {}): Legislation {
  return {
    id: id('leg'),
    kind: 'decreto',
    number: '000',
    year: 2024,
    title: 'Norma de teste',
    issuingBody: 'Teste',
    level: 'municipal',
    uf: 'PI',
    city: 'Teresina',
    definesGeneralClassification: true,
    officialUrl: null,
    notes: null,
    active: true,
    normDate: null,
    parentLegislationId: null,
    relation: null,
    ...overrides,
  }
}

function ver(legislation: Legislation, overrides: Partial<LegislationVersion> = {}): LegislationVersion {
  return {
    id: id('ver'),
    legislationId: legislation.id,
    label: 'Redação original',
    validFrom: '2024-01-01',
    validTo: null,
    highestRiskPrevails: true,
    sourceUrl: null,
    notes: null,
    active: true,
    amendedByLegislationId: null,
    ...overrides,
  }
}

const cond = (question: RuleQuestion, operator: RuleCondition['operator'], value: RuleCondition['value']): RuleCondition => ({
  id: id('cond'),
  questionId: question.id,
  operator,
  value,
  description: '',
})

function rule(version: LegislationVersion, cnaeCode: string | null, classification: RiskClassification, overrides: Partial<CnaeRule> = {}): CnaeRule {
  return {
    id: id('rule'),
    legislationVersionId: version.id,
    cnaeCode,
    priority: 1,
    classificationId: classification.id,
    elseClassificationId: null,
    conditions: [],
    article: null,
    annex: 'Anexo I',
    item: null,
    description: 'Regra de teste',
    active: true,
    annexId: null,
    licenseTypeId: null,
    cboCode: null,
    notes: null,
    sourceDocumentId: null,
    sourcePage: null,
    ...overrides,
  }
}

const effect = (version: LegislationVersion, classification: RiskClassification, license: LicenseTypeRef, outcome: LicenseOutcome): LicenseRule => ({
  id: id('lr'),
  legislationVersionId: version.id,
  classificationId: classification.id,
  licenseTypeId: license.id,
  outcome,
  notes: null,
  active: true,
})

function base(parts: Partial<RuleBase>): RuleBase {
  return { legislations: [], versions: [], annexes: [], documents: [], classifications: [A, B, ALTO], questions: [AREA, RESIDENCIA, PORTE], cnaeRules: [], licenseRules: [], ...parts }
}

function input(cnaes: string[], overrides: Partial<SimulationInput> = {}): SimulationInput {
  return {
    cnaes: cnaes.map((code, i) => ({ code, description: null, primary: i === 0 })),
    uf: 'PI',
    city: 'Teresina',
    referenceDate: '2026-10-04',
    answers: {},
    licenseTypes: LICENSE_TYPES,
    coreLicenseCodes: CORE,
    ...overrides,
  }
}

const ADVOCACIA = '6911701'
const RESTAURANTE = '5611201'
const LANCHONETE = '5611203'
const METALURGICA = '2512800'

/** Norma municipal geral: A dispensa alvará; B e Alto exigem. Trata só do Alvará. */
function municipal(options: { highestRiskPrevails?: boolean } = {}) {
  const legislation = leg()
  const version = ver(legislation, { highestRiskPrevails: options.highestRiskPrevails ?? true })
  const licenseRules = [effect(version, A, ALVARA, 'dispensada'), effect(version, B, ALVARA, 'exigivel'), effect(version, ALTO, ALVARA, 'exigivel')]
  return { legislation, version, licenseRules }
}

describe('enquadramento por CNAE', () => {
  it('classifica um CNAE com regra sem condições', () => {
    const m = municipal()
    const result = runSimulation(base({ legislations: [m.legislation], versions: [m.version], cnaeRules: [rule(m.version, ADVOCACIA, A)], licenseRules: m.licenseRules }), input([ADVOCACIA]))
    expect(result.overall).toMatchObject({ status: 'classificada', confidence: 'completa', drivers: [] })
    expect(result.overall.classification?.name).toBe('Baixo Risco A')
    expect(result.cnaes[0]).toMatchObject({ status: 'classificada', primary: true })
    expect(result.norms).toHaveLength(1)
    expect(result.engineVersion).toBeTruthy()
  })

  it('aceita o CNAE com ou sem máscara e ignora duplicados', () => {
    const m = municipal()
    const rb = base({ legislations: [m.legislation], versions: [m.version], cnaeRules: [rule(m.version, ADVOCACIA, A)] })
    const result = runSimulation(rb, input(['6911-7/01', '6911701']))
    expect(result.cnaes.map((c) => c.code)).toEqual([ADVOCACIA])
  })

  it('CNAE sem regra → Regra não cadastrada, sem concluir nada', () => {
    const m = municipal()
    const rb = base({ legislations: [m.legislation], versions: [m.version], cnaeRules: [rule(m.version, ADVOCACIA, A)], licenseRules: m.licenseRules })
    const result = runSimulation(rb, input(['8630503']))
    expect(result.overall).toMatchObject({ status: 'regra_nao_cadastrada', classification: null, confidence: 'nao_cadastrada', headline: NO_RULE_MESSAGE })
    expect(result.cnaes[0]?.status).toBe('regra_nao_cadastrada')
    expect(result.licenses.find((l) => l.code === 'alvara')?.outcome).toBe('sem_regra')
    expect(result.suggestions.some((s) => s.text.includes('8630-5/03 sem regra'))).toBe(true)
  })

  it('base vazia → Regra não cadastrada para tudo', () => {
    const result = runSimulation(base({}), input([ADVOCACIA]))
    expect(result.overall.status).toBe('regra_nao_cadastrada')
    expect(result.licenses.map((l) => l.outcome)).toEqual(['sem_regra', 'sem_regra', 'sem_regra', 'sem_regra'])
    expect(result.norms).toEqual([])
  })
})

describe('múltiplos CNAEs', () => {
  it('analisa todos, não só o principal', () => {
    const m = municipal()
    const rb = base({
      legislations: [m.legislation],
      versions: [m.version],
      cnaeRules: [rule(m.version, ADVOCACIA, A), rule(m.version, RESTAURANTE, A), rule(m.version, METALURGICA, ALTO)],
      licenseRules: m.licenseRules,
    })
    const result = runSimulation(rb, input([ADVOCACIA, RESTAURANTE, METALURGICA]))
    expect(result.cnaes.map((c) => c.classification?.name)).toEqual(['Baixo Risco A', 'Baixo Risco A', 'Alto Risco'])
    expect(result.overall.status).toBe('classificada')
    expect(result.overall.classification?.name).toBe('Alto Risco')
    expect(result.overall.headline).toBe('A empresa não atende integralmente aos critérios de Baixo Risco A.')
    expect(result.overall.drivers).toEqual([METALURGICA])
    expect(result.suggestions.some((s) => s.text === 'Existe CNAE secundário que altera o enquadramento: 2512-8/00.')).toBe(true)
    const alvara = result.licenses.find((l) => l.code === 'alvara')!
    expect(alvara.outcome).toBe('exigivel')
    expect(alvara.summary).toBe('Exigível em razão do CNAE 2512-8/00.')
  })

  it('todos na mesma classificação → resultado direto, sem "driver"', () => {
    const m = municipal({ highestRiskPrevails: false })
    const rb = base({ legislations: [m.legislation], versions: [m.version], cnaeRules: [rule(m.version, ADVOCACIA, A), rule(m.version, RESTAURANTE, A)], licenseRules: m.licenseRules })
    const result = runSimulation(rb, input([ADVOCACIA, RESTAURANTE]))
    expect(result.overall).toMatchObject({ status: 'classificada', headline: 'Todos os CNAEs informados enquadram-se como Baixo Risco A.', drivers: [] })
    expect(result.licenses.find((l) => l.code === 'alvara')?.outcome).toBe('dispensada')
  })

  it('classificações diferentes sem regra de combinação na norma → necessita análise', () => {
    const m = municipal({ highestRiskPrevails: false })
    const rb = base({ legislations: [m.legislation], versions: [m.version], cnaeRules: [rule(m.version, ADVOCACIA, A), rule(m.version, METALURGICA, ALTO)] })
    const result = runSimulation(rb, input([ADVOCACIA, METALURGICA]))
    expect(result.overall).toMatchObject({ status: 'necessita_analise', classification: null, confidence: 'completa' })
    expect(result.overall.partialHighest?.name).toBe('Alto Risco')
  })

  it('um CNAE sem regra impede a conclusão geral, mas mostra o que já se sabe', () => {
    const m = municipal()
    const rb = base({ legislations: [m.legislation], versions: [m.version], cnaeRules: [rule(m.version, METALURGICA, ALTO)], licenseRules: m.licenseRules })
    const result = runSimulation(rb, input([METALURGICA, '8630503']))
    expect(result.overall).toMatchObject({ status: 'regra_nao_cadastrada', drivers: ['8630503'] })
    expect(result.overall.partialHighest?.name).toBe('Alto Risco')
    expect(result.licenses.find((l) => l.code === 'alvara')?.outcome).toBe('exigivel')
  })
})

describe('condições e questionário', () => {
  function conditional() {
    const m = municipal()
    const rb = base({
      legislations: [m.legislation],
      versions: [m.version],
      cnaeRules: [rule(m.version, RESTAURANTE, A, { conditions: [cond(AREA, 'lte', 200), cond(RESIDENCIA, 'eq', false)] })],
      licenseRules: m.licenseRules,
    })
    return rb
  }

  it('pergunta somente o que está nas condições cadastradas', () => {
    const rb = conditional()
    const questions = collectQuestions(rb, input([RESTAURANTE, ADVOCACIA]))
    expect(questions.map((q) => [q.question.code, q.usedBy])).toEqual([
      ['area_m2', [RESTAURANTE]],
      ['residencia', [RESTAURANTE]],
    ])
    expect(collectQuestions(rb, input([ADVOCACIA]))).toEqual([])
  })

  it('condição pendente → ENQUADRAMENTO CONDICIONADO (nunca dispensa presumida)', () => {
    const result = runSimulation(conditional(), input([RESTAURANTE], { answers: { 'q-area': 150 } }))
    expect(result.overall).toMatchObject({
      status: 'condicionada',
      confidence: 'condicionada',
      headline: 'Esta atividade pode ser classificada como Baixo Risco A desde que as condições previstas na legislação sejam atendidas.',
    })
    expect(result.overall.classification).toBeNull()
    expect(result.overall.conditionalClassification?.name).toBe('Baixo Risco A')
    expect(result.cnaes[0]).toMatchObject({ status: 'condicionada', classification: null })
    expect(result.cnaes[0]?.evaluations[0]?.pending).toBe(true)
    expect(result.cnaes[0]?.evaluations[0]?.rules[0]?.conditions.map((c) => c.state)).toEqual(['atendida', 'pendente'])
    expect(result.licenses.find((l) => l.code === 'alvara')?.outcome).toBe('necessita_analise')
    expect(result.suggestions.at(-1)?.text).toBe('Responder às condições previstas na legislação para confirmar o enquadramento como Baixo Risco A.')
  })

  it('todas atendidas → classificação da regra, regra completa', () => {
    const result = runSimulation(conditional(), input([RESTAURANTE], { answers: { 'q-area': 200, 'q-res': false } }))
    expect(result.overall).toMatchObject({ status: 'classificada', confidence: 'completa' })
    expect(result.overall.classification?.code).toBe('a')
    expect(result.answers.map((a) => a.answerLabel)).toEqual(['200 m²', 'Não'])
    expect(result.cnaes[0]?.evaluations[0]?.rules[0]?.conditions[0]).toMatchObject({ expected: '≤ 200 m²', state: 'atendida' })
  })

  it('não atendida sem alternativa → necessita análise (regra completa, não é pendência)', () => {
    const result = runSimulation(conditional(), input([RESTAURANTE], { answers: { 'q-area': 350, 'q-res': false } }))
    expect(result.overall).toMatchObject({ status: 'necessita_analise', confidence: 'completa' })
    expect(result.cnaes[0]?.reason).toContain('não define classificação alternativa')
  })

  it('uma condição comprovadamente não atendida dispensa as demais respostas', () => {
    const result = runSimulation(conditional(), input([RESTAURANTE], { answers: { 'q-area': 350 } }))
    expect(result.overall.confidence).toBe('completa')
    expect(result.cnaes[0]?.evaluations[0]?.pending).toBe(false)
  })

  it('não atendida com classificação alternativa', () => {
    const m = municipal()
    const rb = base({
      legislations: [m.legislation],
      versions: [m.version],
      cnaeRules: [rule(m.version, RESTAURANTE, A, { conditions: [cond(AREA, 'lte', 200)], elseClassificationId: B.id })],
      licenseRules: m.licenseRules,
    })
    const result = runSimulation(rb, input([RESTAURANTE], { answers: { 'q-area': 201 } }))
    expect(result.overall.classification?.code).toBe('b')
    expect(result.cnaes[0]?.evaluations[0]?.rules[0]?.state).toBe('alternativa')
    expect(result.licenses.find((l) => l.code === 'alvara')?.outcome).toBe('exigivel')
  })

  it('regras em ordem (faixas): vale a primeira atendida', () => {
    const m = municipal()
    const rb = base({
      legislations: [m.legislation],
      versions: [m.version],
      cnaeRules: [
        rule(m.version, RESTAURANTE, B, { priority: 2, conditions: [cond(AREA, 'lte', 750)], elseClassificationId: ALTO.id }),
        rule(m.version, RESTAURANTE, A, { priority: 1, conditions: [cond(AREA, 'lte', 200)] }),
      ],
    })
    const classify = (area: number) => runSimulation(rb, input([RESTAURANTE], { answers: { 'q-area': area } })).overall.classification?.code
    expect([classify(100), classify(500), classify(900)]).toEqual(['a', 'b', 'alto'])
    expect(collectQuestions(rb, input([RESTAURANTE]))).toHaveLength(1)
  })

  it('avalia sim/não e opções', () => {
    const m = municipal()
    const rb = base({
      legislations: [m.legislation],
      versions: [m.version],
      cnaeRules: [rule(m.version, ADVOCACIA, A, { conditions: [cond(RESIDENCIA, 'eq', true), cond(PORTE, 'in', ['mei', 'me'])], elseClassificationId: B.id })],
    })
    const classify = (answers: SimulationInput['answers']) => runSimulation(rb, input([ADVOCACIA], { answers })).overall.classification?.code
    expect(classify({ 'q-res': true, 'q-porte': 'me' })).toBe('a')
    expect(classify({ 'q-res': true, 'q-porte': 'epp' })).toBe('b')
    expect(classify({ 'q-res': false, 'q-porte': 'mei' })).toBe('b')
  })

  it('regra padrão da norma vale só para CNAE sem regra específica', () => {
    const m = municipal()
    const rb = base({ legislations: [m.legislation], versions: [m.version], cnaeRules: [rule(m.version, ADVOCACIA, A), rule(m.version, null, ALTO)] })
    const result = runSimulation(rb, input([ADVOCACIA, '8630503']))
    expect(result.cnaes.map((c) => c.classification?.code)).toEqual(['a', 'alto'])
    expect(result.cnaes[1]?.evaluations[0]?.rules[0]?.isDefault).toBe(true)
  })
})

describe('vigência e localidade', () => {
  function versioned() {
    const legislation = leg()
    const v1 = ver(legislation, { label: 'Redação original', validFrom: '2024-01-01', validTo: '2025-12-31' })
    const v2 = ver(legislation, { label: 'Redação de 2026', validFrom: '2026-01-01' })
    const rb = base({ legislations: [legislation], versions: [v1, v2], cnaeRules: [rule(v1, RESTAURANTE, B), rule(v2, RESTAURANTE, A)] })
    return { rb, v1, v2 }
  }

  it('usa a versão vigente na data de referência', () => {
    const { rb } = versioned()
    const at = (referenceDate: string) => runSimulation(rb, input([RESTAURANTE], { referenceDate }))
    expect(at('2025-06-30').overall.classification?.code).toBe('b')
    expect(at('2025-06-30').norms[0]).toMatchObject({ versionLabel: 'Redação original', validTo: '2025-12-31' })
    expect(at('2025-12-31').overall.classification?.code).toBe('b')
    expect(at('2026-01-01').overall.classification?.code).toBe('a')
    expect(at('2026-10-04').norms[0]).toMatchObject({ versionLabel: 'Redação de 2026', validTo: null })
  })

  it('antes do início da vigência não há regra', () => {
    const { rb } = versioned()
    expect(runSimulation(rb, input([RESTAURANTE], { referenceDate: '2023-12-31' })).overall.status).toBe('regra_nao_cadastrada')
  })

  it('detecta sobreposição de vigência entre versões ativas da mesma norma', () => {
    const { rb, v1, v2 } = versioned()
    const candidate = { legislationId: v1.legislationId, validFrom: '2025-07-01', validTo: null, active: true }
    expect(findOverlappingVersion(rb.versions, candidate)?.id).toBe(v1.id)
    expect(findOverlappingVersion(rb.versions, { ...candidate, id: v2.id, validFrom: '2026-01-01' })).toBeNull()
    expect(findOverlappingVersion(rb.versions, { ...candidate, active: false })).toBeNull()
  })

  it('norma municipal só vale no próprio município; nome sem acento/caixa também casa', () => {
    const m = municipal()
    const rb = base({ legislations: [m.legislation], versions: [m.version], cnaeRules: [rule(m.version, ADVOCACIA, A)] })
    expect(runSimulation(rb, input([ADVOCACIA], { city: 'Parnaíba' })).overall.status).toBe('regra_nao_cadastrada')
    expect(runSimulation(rb, input([ADVOCACIA], { city: '  TERESINA ' })).overall.status).toBe('classificada')
    expect(runSimulation(rb, input([ADVOCACIA], { uf: 'MA' })).overall.status).toBe('regra_nao_cadastrada')
  })

  it('norma estadual vale em todo o estado e federal em qualquer lugar', () => {
    const estadual = leg({ level: 'estadual', city: null })
    const federal = leg({ level: 'federal', uf: null, city: null })
    const rb = base({ legislations: [estadual, federal], versions: [ver(estadual), ver(federal)] })
    expect(selectApplicableVersions(rb, { uf: 'PI', city: 'Picos' }, '2026-10-04')).toHaveLength(2)
    expect(selectApplicableVersions(rb, { uf: 'CE', city: 'Fortaleza' }, '2026-10-04').map((v) => v.norm.level)).toEqual(['federal'])
  })

  it('ignora norma, versão e regra desativadas', () => {
    const m = municipal()
    const active = base({ legislations: [m.legislation], versions: [m.version], cnaeRules: [rule(m.version, ADVOCACIA, A)] })
    const off = (patch: Partial<RuleBase>) => runSimulation({ ...active, ...patch }, input([ADVOCACIA])).overall.status
    expect(off({})).toBe('classificada')
    expect(off({ legislations: [{ ...m.legislation, active: false }] })).toBe('regra_nao_cadastrada')
    expect(off({ versions: [{ ...m.version, active: false }] })).toBe('regra_nao_cadastrada')
    expect(off({ cnaeRules: active.cnaeRules.map((r) => ({ ...r, active: false })) })).toBe('regra_nao_cadastrada')
  })
})

describe('licenças: cada órgão com sua regra', () => {
  it('a dispensa municipal não é estendida a outros órgãos', () => {
    const m = municipal()
    const rb = base({ legislations: [m.legislation], versions: [m.version], cnaeRules: [rule(m.version, ADVOCACIA, A)], licenseRules: m.licenseRules })
    const result = runSimulation(rb, input([ADVOCACIA]))
    expect(Object.fromEntries(result.licenses.map((l) => [l.code, l.outcome]))).toEqual({
      alvara: 'dispensada',
      vigilancia: 'sem_regra',
      ambiental: 'sem_regra',
      bombeiros: 'sem_regra',
    })
    expect(result.suggestions.map((s) => s.text)).toContain('Não existe regra cadastrada para Licença Ambiental.')
    expect(result.suggestions.map((s) => s.text)).toContain('Registrar o fundamento da dispensa no cadastro da empresa.')
  })

  it('norma específica de um órgão alimenta só a sua licença, não o enquadramento geral', () => {
    const m = municipal()
    const fire = leg({ level: 'estadual', city: null, number: '111', definesGeneralClassification: false })
    const fireVersion = ver(fire)
    const rb = base({
      legislations: [m.legislation, fire],
      versions: [m.version, fireVersion],
      cnaeRules: [rule(m.version, ADVOCACIA, A), rule(fireVersion, null, ALTO, { conditions: [cond(AREA, 'gt', 200)], elseClassificationId: A.id })],
      licenseRules: [...m.licenseRules, effect(fireVersion, ALTO, BOMBEIROS, 'exigivel'), effect(fireVersion, A, BOMBEIROS, 'dispensada')],
    })
    const small = runSimulation(rb, input([ADVOCACIA], { answers: { 'q-area': 80 } }))
    expect(small.overall.classification?.code).toBe('a')
    expect(small.licenses.find((l) => l.code === 'bombeiros')?.outcome).toBe('dispensada')

    const large = runSimulation(rb, input([ADVOCACIA], { answers: { 'q-area': 900 } }))
    expect(large.overall.classification?.code).toBe('a')
    expect(large.licenses.find((l) => l.code === 'bombeiros')?.outcome).toBe('exigivel')
    expect(large.licenses.find((l) => l.code === 'alvara')?.outcome).toBe('dispensada')
    expect(large.norms).toHaveLength(2)

    const semNormaGeral = runSimulation({ ...rb, legislations: [fire], versions: [fireVersion] }, input([ADVOCACIA], { answers: { 'q-area': 900 } }))
    expect(semNormaGeral.overall.status).toBe('regra_nao_cadastrada')
    expect(semNormaGeral.licenses.find((l) => l.code === 'bombeiros')?.outcome).toBe('exigivel')
  })

  it('análise separada, e licença extra regulada aparece além das principais', () => {
    const m = municipal()
    const rb = base({
      legislations: [m.legislation],
      versions: [m.version],
      cnaeRules: [rule(m.version, ADVOCACIA, A)],
      licenseRules: [...m.licenseRules, effect(m.version, A, BOMBEIROS, 'analise_separada'), effect(m.version, A, CRMV, 'dispensada')],
    })
    const result = runSimulation(rb, input([ADVOCACIA]))
    expect(result.licenses.map((l) => l.code)).toEqual(['alvara', 'vigilancia', 'ambiental', 'bombeiros', 'crmv'])
    expect(result.licenses.find((l) => l.code === 'bombeiros')).toMatchObject({ outcome: 'analise_separada' })
    expect(result.suggestions.map((s) => s.text)).toContain('Verificar Bombeiros (CBMEPI) separadamente.')
  })

  it('só é dispensada se a regra cobre TODOS os CNAEs', () => {
    const m = municipal()
    const rb = base({ legislations: [m.legislation], versions: [m.version], cnaeRules: [rule(m.version, ADVOCACIA, A)], licenseRules: m.licenseRules })
    const alvara = runSimulation(rb, input([ADVOCACIA, LANCHONETE])).licenses.find((l) => l.code === 'alvara')!
    expect(alvara.outcome).toBe('necessita_analise')
    expect(alvara.uncoveredCnaes).toEqual([LANCHONETE])
    expect(alvara.summary).toBe('Sem regra cadastrada desta licença para o CNAE 5611-2/03.')
  })

  it('duas normas gerais divergentes para o mesmo CNAE → necessita análise', () => {
    const m = municipal()
    const other = leg({ number: '222' })
    const otherVersion = ver(other)
    const rb = base({ legislations: [m.legislation, other], versions: [m.version, otherVersion], cnaeRules: [rule(m.version, ADVOCACIA, A), rule(otherVersion, ADVOCACIA, B)] })
    const result = runSimulation(rb, input([ADVOCACIA]))
    expect(result.overall.status).toBe('necessita_analise')
    expect(result.cnaes[0]?.reason).toContain('divergem')
  })
})

describe('auditabilidade', () => {
  it('é determinístico e não altera a base de regras', () => {
    const m = municipal()
    const rb = base({
      legislations: [m.legislation],
      versions: [m.version],
      cnaeRules: [rule(m.version, RESTAURANTE, A, { conditions: [cond(AREA, 'lte', 200)], elseClassificationId: B.id, article: 'Art. 5º', item: 'Item 12' })],
      licenseRules: m.licenseRules,
    })
    const frozen = JSON.stringify(rb)
    const run = () => runSimulation(rb, input([RESTAURANTE], { answers: { 'q-area': 120 } }))
    expect(run()).toEqual(run())
    expect(JSON.stringify(rb)).toBe(frozen)
  })

  it('o resultado carrega a fundamentação completa (norma, versão, vigência, artigo/anexo/item, condições)', () => {
    const m = municipal()
    const r = rule(m.version, RESTAURANTE, A, { conditions: [cond(AREA, 'lte', 200)], article: 'Art. 5º', item: 'Item 12', description: 'Resumo da regra' })
    const result = runSimulation(base({ legislations: [m.legislation], versions: [m.version], cnaeRules: [r] }), input([RESTAURANTE], { answers: { 'q-area': 120 } }))
    const evaluation = result.cnaes[0]!.evaluations[0]!
    expect(evaluation.decidingRuleId).toBe(r.id)
    expect(evaluation.norm).toMatchObject({ kind: 'decreto', number: '000', year: 2024, level: 'municipal', city: 'Teresina', validFrom: '2024-01-01' })
    expect(evaluation.rules[0]).toMatchObject({ article: 'Art. 5º', annex: 'Anexo I', item: 'Item 12', description: 'Resumo da regra', state: 'aplicada' })
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })
})

describe('base legal: anexos, áreas, condições da norma e alterações', () => {
  const annex = (legislation: Legislation, code: string, kind: LegislationAnnex['kind']): LegislationAnnex => ({
    id: id('anx'),
    legislationId: legislation.id,
    code,
    title: `Anexo ${code}`,
    kind,
    description: null,
    sortOrder: code.length,
    active: true,
  })
  const legal = (text: string): RuleCondition => ({ id: id('cond'), questionId: null, operator: 'eq', value: true, description: text })
  const TEXTO = 'Desde que não haja manipulação de alimentos no local (texto de teste)'

  function decree() {
    const legislation = leg({ number: '1', year: 2023 })
    const anexoI = annex(legislation, 'I', 'classificacao')
    const anexoII = annex(legislation, 'II', 'baixo_risco_a')
    const version = ver(legislation)
    const licenseRules = [
      effect(version, A, ALVARA, 'dispensada'),
      effect(version, A, SANITARIA, 'dispensada'),
      effect(version, B, ALVARA, 'exigivel'),
      effect(version, ALTO, SANITARIA, 'exigivel'),
      effect(version, A, BOMBEIROS, 'analise_separada'),
      effect(version, B, BOMBEIROS, 'analise_separada'),
    ]
    return { legislation, anexoI, anexoII, version, licenseRules }
  }

  it('condição transcrita da norma vira pergunta Sim/Não e decide entre Anexo II e Anexo I', () => {
    const d = decree()
    const rb = base({
      legislations: [d.legislation],
      versions: [d.version],
      annexes: [d.anexoI, d.anexoII],
      cnaeRules: [
        rule(d.version, LANCHONETE, A, { annexId: d.anexoII.id, conditions: [legal(TEXTO)] }),
        rule(d.version, LANCHONETE, B, { annexId: d.anexoI.id, priority: 2 }),
      ],
      licenseRules: d.licenseRules,
    })
    const questions = collectQuestions(rb, input([LANCHONETE]))
    expect(questions).toHaveLength(1)
    expect(questions[0]).toMatchObject({ legalText: true, question: { id: legalTextKey(TEXTO), type: 'sim_nao', text: TEXTO } })

    const pending = runSimulation(rb, input([LANCHONETE]))
    expect(pending.overall.status).toBe('condicionada')
    expect(pending.cnaes[0]?.evaluations[0]?.rules[0]).toMatchObject({ annexLabel: 'Anexo II — Anexo II', annexKind: 'baixo_risco_a' })

    const yes = runSimulation(rb, input([LANCHONETE], { answers: { [legalTextKey(TEXTO)]: true } }))
    expect(yes.overall.classification?.name).toBe('Baixo Risco A')
    expect(yes.licenses.find((l) => l.code === 'alvara')?.outcome).toBe('dispensada')

    const no = runSimulation(rb, input([LANCHONETE], { answers: { [legalTextKey(TEXTO)]: false } }))
    expect(no.overall.classification?.name).toBe('Baixo Risco B')
    expect(no.cnaes[0]?.evaluations[0]?.rules.map((r) => r.state)).toEqual(['nao_atendida', 'aplicada'])
    expect(no.licenses.find((l) => l.code === 'alvara')?.outcome).toBe('exigivel')
    expect(no.answers.find((a) => a.questionId === legalTextKey(TEXTO))?.answerLabel).toBe('Não')
  })

  it('classificação de área (risco sanitário) vale para a licença quando a geral não tem efeito nela', () => {
    const d = decree()
    const rb = base({
      legislations: [d.legislation],
      versions: [d.version],
      annexes: [d.anexoI, d.anexoII],
      cnaeRules: [rule(d.version, RESTAURANTE, B, { annexId: d.anexoI.id }), rule(d.version, RESTAURANTE, ALTO, { annexId: d.anexoI.id, licenseTypeId: SANITARIA.id })],
      licenseRules: d.licenseRules,
    })
    const result = runSimulation(rb, input([RESTAURANTE]))
    expect(result.overall.classification?.name).toBe('Baixo Risco B')
    expect(result.cnaes[0]?.areaEvaluations.map((a) => [a.licenseName, a.evaluation.classification?.name])).toEqual([['Vigilância Sanitária', 'Alto Risco']])
    const sanitaria = result.licenses.find((l) => l.code === 'vigilancia')!
    expect(sanitaria.outcome).toBe('exigivel')
    expect(sanitaria.contributions[0]).toMatchObject({ fromArea: true })
    expect(result.licenses.find((l) => l.code === 'alvara')?.outcome).toBe('exigivel')
    expect(result.licenses.find((l) => l.code === 'bombeiros')?.outcome).toBe('analise_separada')
  })

  it('classificação de área sem efeito cadastrado → necessita análise (não presume dispensa)', () => {
    const d = decree()
    const rb = base({
      legislations: [d.legislation],
      versions: [d.version],
      cnaeRules: [rule(d.version, RESTAURANTE, B), rule(d.version, RESTAURANTE, B, { licenseTypeId: AMBIENTAL.id })],
      licenseRules: d.licenseRules,
    })
    const result = runSimulation(rb, input([RESTAURANTE]))
    expect(result.licenses.find((l) => l.code === 'ambiental')?.outcome).toBe('necessita_analise')
  })

  it('CNAE só com classificação de área não quebra a avaliação das demais licenças', () => {
    const d = decree()
    const rb = base({
      legislations: [d.legislation],
      versions: [d.version],
      cnaeRules: [rule(d.version, RESTAURANTE, ALTO, { licenseTypeId: SANITARIA.id })],
      licenseRules: d.licenseRules,
    })
    const result = runSimulation(rb, input([RESTAURANTE]))
    expect(result.overall.status).toBe('regra_nao_cadastrada')
    expect(result.licenses.find((l) => l.code === 'vigilancia')?.outcome).toBe('exigivel')
    expect(result.licenses.find((l) => l.code === 'alvara')?.outcome).toBe('sem_regra')
  })

  it('Baixo Risco A de um órgão não dispensa outro órgão sem regra própria', () => {
    const d = decree()
    const rb = base({ legislations: [d.legislation], versions: [d.version], cnaeRules: [rule(d.version, ADVOCACIA, A)], licenseRules: d.licenseRules })
    const result = runSimulation(rb, input([ADVOCACIA]))
    expect(result.licenses.find((l) => l.code === 'alvara')?.outcome).toBe('dispensada')
    expect(result.licenses.find((l) => l.code === 'ambiental')?.outcome).toBe('sem_regra')
  })

  it('redação dada por decreto modificador: base legal, justificativa e histórico pela data', () => {
    const d = decree()
    const amending = leg({ number: '2', year: 2025, definesGeneralClassification: false, parentLegislationId: d.legislation.id, relation: 'altera' })
    const v1 = { ...d.version, validTo: '2025-12-31' }
    const v2 = ver(d.legislation, { label: 'Redação dada pelo Decreto 2/2025', validFrom: '2026-01-01', amendedByLegislationId: amending.id })
    const rb = base({
      legislations: [d.legislation, amending],
      versions: [v1, v2],
      cnaeRules: [rule(v1, ADVOCACIA, B), rule(v2, ADVOCACIA, A)],
      licenseRules: [...d.licenseRules, effect(v2, A, ALVARA, 'dispensada')],
    })
    const now = runSimulation(rb, input([ADVOCACIA]))
    expect(now.overall.classification?.name).toBe('Baixo Risco A')
    expect(now.norms[0]?.amendedBy?.label).toBe('Decreto Municipal nº 2/2025')
    expect(now.legalBasis).toMatchObject({ locality: 'Teresina – PI', referenceDate: '2026-10-04' })
    expect(now.legalBasis.amendments).toEqual(['Decreto Municipal nº 2/2025 (altera o Decreto Municipal nº 1/2023; vigência desde 01/01/2026)'])
    expect(now.justification.join(' ')).toContain('com a redação dada pelo Decreto Municipal nº 2/2025')
    expect(now.pendingNorms).toEqual([])

    const before = runSimulation(rb, input([ADVOCACIA], { referenceDate: '2025-06-30' }))
    expect(before.overall.classification?.name).toBe('Baixo Risco B')
    expect(before.legalBasis.amendments).toEqual([])
  })

  it('norma cadastrada sem conteúdo → Regra não cadastrada e aviso de base pendente (decretos modificadores não entram)', () => {
    const base24861 = leg({ number: '24.861', year: 2023 })
    const amending = leg({ number: '25.363', year: 2023, definesGeneralClassification: false, parentLegislationId: base24861.id, relation: 'altera' })
    const rb = base({ legislations: [base24861, amending], annexes: [annex(base24861, 'II', 'baixo_risco_a')] })
    const result = runSimulation(rb, input([ADVOCACIA]))
    expect(result.overall.status).toBe('regra_nao_cadastrada')
    expect(result.pendingNorms).toEqual([{ legislationId: base24861.id, label: 'Decreto Municipal nº 24.861/2023', reason: 'sem_versao_vigente' }])
    expect(findPendingNorms(rb, { uf: 'PI', city: 'Teresina' }, '2026-10-04')).toHaveLength(1)
    expect(result.licenses.every((l) => l.outcome === 'sem_regra')).toBe(true)
  })

  it('regras por CBO (Anexo III) não entram no enquadramento por CNAE', () => {
    const d = decree()
    const rb = base({ legislations: [d.legislation], versions: [d.version], cnaeRules: [rule(d.version, null, A, { cboCode: '241005' })], licenseRules: d.licenseRules })
    const result = runSimulation(rb, input([ADVOCACIA]))
    expect(result.overall.status).toBe('regra_nao_cadastrada')
  })

  it('CNAE secundário que altera o enquadramento aparece como driver', () => {
    const d = decree()
    const rb = base({ legislations: [d.legislation], versions: [d.version], cnaeRules: [rule(d.version, ADVOCACIA, A), rule(d.version, METALURGICA, ALTO)], licenseRules: d.licenseRules })
    const result = runSimulation(rb, input([ADVOCACIA, METALURGICA]))
    expect(result.overall).toMatchObject({ status: 'classificada', drivers: [METALURGICA] })
    expect(result.overall.classification?.name).toBe('Alto Risco')
  })
})
