import { describe, expect, it } from 'vitest'
import { planCompanyChanges, toAppliedChanges } from './apply'
import { parseBrazilianNumber, parseCondition, parseCsv, parseRulesCsv } from './csv-import'
import type { LicenseResult, LicenseResultOutcome, RiskClassification, RuleQuestion, SimulationResult } from './types'

const classifications: RiskClassification[] = [
  { id: 'a', code: 'baixo_risco_a', name: 'Baixo Risco A', severity: 10, tone: 'green', active: true },
  { id: 'b', code: 'baixo_risco_b', name: 'Baixo Risco B', severity: 20, tone: 'blue', active: true },
  { id: 'x', code: 'antiga', name: 'Antiga', severity: 5, tone: 'gray', active: false },
]
const questions: RuleQuestion[] = [
  { id: 'q1', code: 'area_m2', text: 'Área', type: 'numero', unit: 'm²', options: [], helpText: null, active: true },
  { id: 'q2', code: 'residencia', text: 'Em residência?', type: 'sim_nao', unit: null, options: [], helpText: null, active: true },
  { id: 'q3', code: 'porte', text: 'Porte', type: 'opcoes', unit: null, options: [{ value: 'mei', label: 'MEI' }, { value: 'me', label: 'Microempresa' }], helpText: null, active: true },
]
const refs = { classifications, questions }

describe('importação de regras por CSV', () => {
  it('lê CSV com ";" ou ",", aspas e BOM', () => {
    expect(parseCsv('a;"b;c";"d ""e"""\r\n1;2;3', ';')).toEqual([['a', 'b;c', 'd "e"'], ['1', '2', '3']])
    const semicolon = parseRulesCsv('﻿CNAE;Descrição;Classificação\n5611-2/01;Restaurantes e similares;Baixo Risco A\n', refs)
    const comma = parseRulesCsv('cnae,descricao,classificacao\n5611201,"Restaurantes, e similares",baixo_risco_a\n', refs)
    expect(semicolon.rows[0]).toMatchObject({ line: 2, cnaeCode: '5611201', cnaeDescription: 'Restaurantes e similares', classificationId: 'a', priority: 1, conditions: [] })
    expect(comma.rows[0]).toMatchObject({ cnaeCode: '5611201', cnaeDescription: 'Restaurantes, e similares', classificationId: 'a' })
    expect(semicolon.errors).toEqual([])
  })

  it('interpreta condições, alternativa, ordem e base normativa', () => {
    const csv = [
      'cnae;classificacao;condicao;classificacao_se_nao_atender;ordem;artigo;anexo;item;resumo',
      '5611-2/01;Baixo Risco A;area_m2 <= 200 & residencia = não & porte = MEI|Microempresa;Baixo Risco B;2;Art. 5º;Anexo I;12;Resumo',
      '*;Baixo Risco B;;;;;;;Regra padrão',
    ].join('\n')
    const { rows, errors } = parseRulesCsv(csv, refs)
    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({ elseClassificationId: 'b', priority: 2, article: 'Art. 5º', annexText: 'Anexo I', annexId: null, item: '12', description: 'Resumo' })
    expect(rows[0]?.conditions).toEqual([
      { questionId: 'q1', operator: 'lte', value: 200, description: '' },
      { questionId: 'q2', operator: 'eq', value: false, description: '' },
      { questionId: 'q3', operator: 'in', value: ['mei', 'me'], description: '' },
    ])
    expect(rows[1]).toMatchObject({ cnaeCode: null, classificationId: 'b' })
  })

  it('não cria perguntas nem classificações: aponta o erro com a linha', () => {
    const csv = [
      'cnae;classificacao;condicao',
      '5611-2/01;Risco Inexistente;',
      '123;Baixo Risco A;',
      '6911-7/01;Baixo Risco A;pergunta_inventada = sim',
      '6911-7/01;Antiga;',
      '6911-7/01;Baixo Risco A;area_m2 = grande',
      ';;',
      '6911-7/01;Baixo Risco A;',
    ].join('\n')
    const { rows, errors, totalLines } = parseRulesCsv(csv, refs)
    expect(totalLines).toBe(6)
    expect(rows.map((r) => r.line)).toEqual([8])
    expect(errors.map((e) => [e.line, e.message])).toEqual([
      [2, 'classificação "Risco Inexistente" não cadastrada'],
      [3, 'CNAE "123" inválido (use 7 dígitos, ex.: 5611-2/01)'],
      [4, 'pergunta "pergunta_inventada" não cadastrada'],
      [5, 'classificação "Antiga" não cadastrada'],
      [6, 'valor "grande" não é um número (pergunta area_m2)'],
    ])
  })

  it('exige as colunas cnae e classificacao e informa colunas não usadas', () => {
    expect(parseRulesCsv('codigo_x;risco_y\n1;2', refs).errors[0]?.line).toBe(1)
    const result = parseRulesCsv('cnae;classificacao;Órgão;Licença;Norma;Vigência\n6911701;Baixo Risco A;Prefeitura;Alvará;Decreto;2026', refs)
    expect(result.ignoredColumns).toEqual(['Órgão', 'Licença', 'Norma', 'Vigência'])
    expect(result.rows).toHaveLength(1)
  })

  it('números no padrão brasileiro e condições inválidas', () => {
    expect([parseBrazilianNumber('1.500'), parseBrazilianNumber('200,5'), parseBrazilianNumber('1.234,56'), parseBrazilianNumber('2.5'), parseBrazilianNumber('abc')]).toEqual([1500, 200.5, 1234.56, 2.5, null])
    expect(parseCondition('residencia > sim', questions)).toContain('aceita apenas')
    expect(parseCondition('porte = gigante', questions)).toContain('não existe')
    expect(parseCondition('sem operador', questions)).toContain('fora do formato')
  })
})

describe('aplicar resultado à empresa', () => {
  const license = (id: string, name: string, outcome: LicenseResultOutcome): LicenseResult => ({
    licenseTypeId: id,
    code: id,
    name,
    shortName: name,
    agency: 'Órgão',
    outcome,
    summary: '',
    contributions: [],
    uncoveredCnaes: [],
  })
  const result = {
    referenceDate: '2026-10-04',
    licenses: [
      license('alvara', 'Alvará de Funcionamento', 'dispensada'),
      license('sanitaria', 'Licença Sanitária', 'exigivel'),
      license('ambiental', 'Licença Ambiental', 'necessita_analise'),
      license('bombeiros', 'Bombeiros', 'analise_separada'),
      license('crmv', 'Registro no CRMV', 'sem_regra'),
      license('acess', 'Licença de Acessibilidade', 'necessita_analise'),
      license('oab', 'Registro na OAB', 'exigivel'),
    ],
  } as SimulationResult

  const plans = planCompanyChanges(
    result,
    [
      { licenseTypeId: 'alvara', applicability: 'aplicavel' },
      { licenseTypeId: 'bombeiros', applicability: 'aplicavel' },
      { licenseTypeId: 'acess', applicability: 'aplicavel' },
      { licenseTypeId: 'oab', applicability: 'aplicavel' },
    ],
    { number: 7 },
  )
  const byId = Object.fromEntries(plans.map((p) => [p.licenseTypeId, p]))

  it('dispensada → DISPENSADA; exigível → monitoramento; em análise → pendência', () => {
    expect(byId.alvara).toMatchObject({ action: 'alterar', current: 'aplicavel', next: 'dispensada', outcomeLabel: 'Dispensado' })
    expect(byId.sanitaria).toMatchObject({ action: 'adicionar', current: null, next: 'aplicavel' })
    expect(byId.ambiental).toMatchObject({ action: 'adicionar', next: 'em_analise' })
  })

  it('não altera o que não tem regra, é análise separada ou já está correto', () => {
    expect(byId.bombeiros).toMatchObject({ action: 'manter', next: null })
    expect(byId.crmv).toMatchObject({ action: 'manter', next: null })
    expect(byId.acess).toMatchObject({ action: 'manter', next: null })
    expect(byId.oab).toMatchObject({ action: 'manter', next: null, explanation: 'Já está como Aplicável.' })
  })

  it('gera apenas as alterações efetivas, com o fundamento', () => {
    const changes = toAppliedChanges(plans)
    expect(changes.map((c) => [c.licenseTypeId, c.applicability])).toEqual([
      ['alvara', 'dispensada'],
      ['sanitaria', 'aplicavel'],
      ['ambiental', 'em_analise'],
    ])
    expect(changes[0]?.note).toBe('Simulação nº 7 (referência 04/10/2026): Dispensado.')
  })
})
