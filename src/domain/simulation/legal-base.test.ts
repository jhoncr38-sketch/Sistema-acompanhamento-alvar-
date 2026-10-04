import { describe, expect, it } from 'vitest'
import { parseRulesCsv } from './csv-import'
import { amendmentsOf, annexContent, cnaeRuleHistory, legalLocalities, lookupCnae, versionChanges, versionLegalStatus } from './legal-base'
import { baseVersionFor, buildPublication, previewImport } from './rule-import'
import type { CnaeRule, Legislation, LegislationAnnex, LegislationVersion, RiskClassification, RuleBase, RuleQuestion } from './types'

// Dados FICTÍCIOS, apenas para testar a base legal e a importação.
const cls = (code: string, name: string, severity: number): RiskClassification => ({ id: code, code, name, severity, tone: 'gray', active: true })
const A = cls('baixo_risco_a', 'Baixo Risco A', 10)
const B = cls('baixo_risco_b', 'Baixo Risco B', 20)
const ALTO = cls('alto_risco', 'Alto Risco', 40)
const AREA: RuleQuestion = { id: 'q-area', code: 'area_m2', text: 'Área', type: 'numero', unit: 'm²', options: [], helpText: null, active: true }
const LICENSES = [
  { id: 'lt-vig', code: 'vigilancia', name: 'Vigilância Sanitária', shortName: 'Sanitária' },
  { id: 'lt-amb', code: 'ambiental', name: 'Licença Ambiental', shortName: 'Ambiental' },
]

const legislation = (id: string, overrides: Partial<Legislation> = {}): Legislation => ({
  id,
  kind: 'decreto',
  number: id,
  year: 2023,
  title: 'Norma de teste',
  issuingBody: '',
  level: 'municipal',
  uf: 'PI',
  city: 'Cidade Teste',
  definesGeneralClassification: true,
  officialUrl: null,
  notes: null,
  active: true,
  normDate: null,
  parentLegislationId: null,
  relation: null,
  ...overrides,
})
const annex = (id: string, code: string, kind: LegislationAnnex['kind']): LegislationAnnex => ({ id, legislationId: 'base', code, title: `Anexo ${code}`, kind, description: null, sortOrder: 1, active: true })
const version = (id: string, validFrom: string, validTo: string | null, amendedBy: string | null = null): LegislationVersion => ({
  id,
  legislationId: 'base',
  label: id,
  validFrom,
  validTo,
  highestRiskPrevails: true,
  sourceUrl: null,
  notes: null,
  active: true,
  amendedByLegislationId: amendedBy,
})
let seq = 0
const rule = (versionId: string, cnaeCode: string | null, classificationId: string, overrides: Partial<CnaeRule> = {}): CnaeRule => ({
  id: `r${++seq}`,
  legislationVersionId: versionId,
  cnaeCode,
  priority: 1,
  classificationId,
  elseClassificationId: null,
  conditions: [],
  article: null,
  annex: null,
  item: null,
  description: '',
  active: true,
  annexId: 'anx-2',
  licenseTypeId: null,
  cboCode: null,
  notes: null,
  sourceDocumentId: null,
  sourcePage: null,
  ...overrides,
})

function fixture(): RuleBase {
  const v1 = version('v1', '2023-10-01', '2025-12-31')
  const v2 = version('v2', '2026-01-01', null, 'alt')
  return {
    legislations: [legislation('base'), legislation('alt', { definesGeneralClassification: false, parentLegislationId: 'base', relation: 'altera', year: 2025 })],
    versions: [v1, v2],
    annexes: [annex('anx-1', 'I', 'classificacao'), annex('anx-2', 'II', 'baixo_risco_a'), annex('anx-3', 'III', 'cbo')],
    documents: [],
    classifications: [A, B, ALTO],
    questions: [AREA],
    cnaeRules: [
      rule('v1', '6911701', B.id, { annexId: 'anx-1' }),
      rule('v1', '5611201', B.id, { annexId: 'anx-1' }),
      rule('v1', '4781400', A.id),
      rule('v2', '6911701', A.id),
      rule('v2', '5611201', A.id, { conditions: [{ id: 'c1', questionId: AREA.id, operator: 'lte', value: 200, description: '' }] }),
      rule('v2', '5611201', B.id, { annexId: 'anx-1', priority: 2 }),
      rule('v2', '5611201', ALTO.id, { annexId: 'anx-1', licenseTypeId: 'lt-vig' }),
    ],
    licenseRules: [],
  }
}

describe('base legal', () => {
  it('situação de cada versão na data (vigente, substituída) e normas que alteram', () => {
    const base = fixture()
    expect(versionLegalStatus(base.versions[0]!, base.versions, '2026-10-04')).toBe('substituida')
    expect(versionLegalStatus(base.versions[1]!, base.versions, '2026-10-04')).toBe('vigente')
    expect(versionLegalStatus(base.versions[0]!, base.versions, '2024-05-01')).toBe('vigente')
    expect(amendmentsOf(base, 'base').map((a) => [a.legislation.id, a.versions.map((v) => v.id)])).toEqual([['alt', ['v2']]])
    expect(legalLocalities(base).map((l) => l.label)).toEqual(['CIDADE TESTE — PI'])
  })

  it('anexo mostra o conteúdo da versão vigente na data', () => {
    const base = fixture()
    expect(annexContent(base, base.annexes[1]!, '2026-10-04').rules.map((r) => r.cnaeCode)).toEqual(['5611201', '6911701'])
    expect(annexContent(base, base.annexes[1]!, '2024-01-01').rules.map((r) => r.cnaeCode)).toEqual(['4781400'])
    expect(annexContent(base, base.annexes[1]!, '2020-01-01')).toEqual({ version: null, rules: [] })
  })

  it('alterações de uma versão: incluídas, alteradas e revogadas', () => {
    const { previous, changes } = versionChanges(fixture(), 'v2')
    expect(previous?.id).toBe('v1')
    expect(changes.map((c) => [c.activity, c.annexId, c.licenseTypeId, c.status])).toEqual([
      ['4781400', 'anx-2', null, 'revogada'],
      ['5611201', 'anx-2', null, 'incluida'],
      // mesma classificação, mas passou a ser a 2ª regra avaliada (depois do Anexo II)
      ['5611201', 'anx-1', null, 'alterada'],
      ['5611201', 'anx-1', 'lt-vig', 'incluida'],
      ['6911701', 'anx-2', null, 'incluida'],
      ['6911701', 'anx-1', null, 'revogada'],
    ])
  })

  it('histórico legal do CNAE: ALTERADA pelo decreto e VIGENTE; REVOGADA quando sai da norma', () => {
    const base = fixture()
    expect(cnaeRuleHistory(base, 'base', '6911701', '2026-10-04').map((h) => [h.status, h.validFrom, h.validTo, h.changedBy, h.amendedBy])).toEqual([
      ['alterada', '2023-10-01', '2025-12-31', 'Decreto Municipal nº alt/2025', null],
      ['vigente', '2026-01-01', null, null, 'Decreto Municipal nº alt/2025'],
    ])
    expect(cnaeRuleHistory(base, 'base', '4781400', '2026-10-04').map((h) => h.status)).toEqual(['revogada'])
  })

  it('Pesquisar CNAE: classificação, risco por área, Baixo Risco A condicionado e última atualização', () => {
    const [entry] = lookupCnae(fixture(), '5611-2/01', { uf: 'PI', city: 'cidade teste' }, '2026-10-04')
    expect(entry).toMatchObject({ baixoRiscoA: 'condicionado', lastUpdate: '2026-01-01', amendedBy: 'Decreto Municipal nº alt/2025' })
    expect(entry?.generalRules.map((r) => r.classificationId)).toEqual(['baixo_risco_a', 'baixo_risco_b'])
    expect(entry?.areaRules.map((r) => [r.licenseTypeId, r.classificationId])).toEqual([['lt-vig', 'alto_risco']])
    expect(lookupCnae(fixture(), '8630503', { uf: 'PI', city: 'Cidade Teste' }, '2026-10-04')).toEqual([])
  })
})

describe('importação revisada', () => {
  const refs = (base: RuleBase) => ({ classifications: base.classifications, questions: base.questions, annexes: base.annexes, licenseTypes: LICENSES })

  it('lê anexo, área, condição transcrita da norma, CBO e ação', () => {
    const csv = [
      'cnae;cbo;descricao;anexo;area;classificacao;condicao_texto;observacoes;acao',
      '5611-2/03;;Lanchonetes;Anexo II;;Baixo Risco A;Desde que não haja manipulação (texto de teste);Obs. de teste;incluir',
      '1091102;;;I;Sanitária;Alto Risco;;;',
      ';2410-05;;III;;Baixo Risco B;;;',
      '4781400;;;II;;;;;remover',
      '5611201;;;IV;Bombeiros;Baixo Risco A;;;',
    ].join('\n')
    const base = fixture()
    const parsed = parseRulesCsv(csv, refs(base))
    expect(parsed.rows.map((r) => [r.cnaeCode, r.cboCode, r.annexId, r.licenseTypeId, r.classificationId])).toEqual([
      ['5611203', null, 'anx-2', null, 'baixo_risco_a'],
      ['1091102', null, 'anx-1', 'lt-vig', 'alto_risco'],
      [null, '241005', 'anx-3', null, 'baixo_risco_b'],
    ])
    expect(parsed.rows[0]?.conditions).toEqual([{ questionId: null, operator: 'eq', value: true, description: 'Desde que não haja manipulação (texto de teste)' }])
    expect(parsed.rows[0]).toMatchObject({ notes: 'Obs. de teste', action: 'incluir' })
    expect(parsed.removals.map((r) => r.cnaeCode)).toEqual(['4781400'])
    expect(parsed.errors.map((e) => e.line)).toEqual([6])
    expect(parsed.errors[0]?.message).toContain('anexo "IV" não cadastrado')
    expect(parsed.errors[0]?.message).toContain('área "Bombeiros" não corresponde')
  })

  it('prévia compara com a versão-base: novos, alterados, removidos, condições modificadas', () => {
    const base = fixture()
    const csv = ['cnae;anexo;classificacao;condicao;acao', '6911701;II;Baixo Risco A;;', '5611201;II;Baixo Risco A;area_m2 <= 150;', '4791400;II;Baixo Risco A;;', '4781400;II;;;remover'].join('\n')
    const parsed = parseRulesCsv(csv, refs(base))
    const v1Base = baseVersionFor(base, 'base', '2027-01-01')
    expect(v1Base?.id).toBe('v2')
    const preview = previewImport({ base, baseVersionId: 'v2', rows: parsed.rows, removals: parsed.removals, mode: 'parcial' })
    expect(preview.counts).toEqual({ encontrados: 3, novos: 1, alterados: 1, removidos: 0, inalterados: 1, condicoesModificadas: 1 })
    expect(preview.items.find((i) => i.activity === '5611201')).toMatchObject({ status: 'alterado', conditionsChanged: true })

    const complete = previewImport({ base, baseVersionId: 'v2', rows: parsed.rows.filter((r) => r.cnaeCode !== '6911701'), mode: 'completo' })
    expect(complete.items.filter((i) => i.status === 'removido').map((i) => i.activity)).toEqual(['6911701'])
  })

  it('publicação: nova versão copia as inalteradas, exclui as substituídas e não toca em outros anexos', () => {
    const base = fixture()
    const parsed = parseRulesCsv(['cnae;anexo;classificacao', '6911701;II;Alto Risco', '7777777;II;Baixo Risco A'].join('\n'), refs(base))
    const preview = previewImport({ base, baseVersionId: 'v2', rows: parsed.rows, mode: 'completo' })
    expect(preview.counts).toMatchObject({ novos: 1, alterados: 1, removidos: 1 })
    const target = {
      kind: 'nova_versao' as const,
      closeBaseVersion: true,
      version: { label: 'Nova', validFrom: '2027-01-01', validTo: null, highestRiskPrevails: true, sourceUrl: null, notes: null, active: true, amendedByLegislationId: null },
    }
    const publication = buildPublication(preview, { legislationId: 'base', target, fileName: 'anexo.csv', sourceKind: 'csv', rowsTotal: 2 })
    const v2Annex2 = base.cnaeRules.filter((r) => r.legislationVersionId === 'v2' && r.annexId === 'anx-2' && r.licenseTypeId === null)
    expect(publication.copyFromVersionId).toBe('v2')
    expect([...publication.excludeRuleIds].sort()).toEqual(v2Annex2.map((r) => r.id).sort())
    expect(publication.deactivateRuleIds).toEqual([])
    expect(publication.insertRules.map((r) => [r.cnaeCode, r.annex, r.annexId])).toEqual([
      ['6911701', 'II', 'anx-2'],
      ['7777777', 'II', 'anx-2'],
    ])
    expect(publication.batch).toMatchObject({ fileName: 'anexo.csv', sourceKind: 'csv', mode: 'completo', rowsTotal: 2 })

    const existing = buildPublication(preview, { legislationId: 'base', target: { kind: 'versao_existente', versionId: 'v2' }, fileName: 'anexo.csv', sourceKind: 'csv', rowsTotal: 2 })
    expect(existing.copyFromVersionId).toBeNull()
    expect(existing.excludeRuleIds).toEqual([])
    expect([...existing.deactivateRuleIds].sort()).toEqual(v2Annex2.map((r) => r.id).sort())
  })
})
