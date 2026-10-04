import { describe, expect, it } from 'vitest'
import { isCnpjChecksumValid } from '@/domain/cnpj'
import {
  buildCompanyOverviews,
  computeDashboardMetrics,
  computeSectorSummaries,
} from '@/domain/monitoring'
import { DEFAULT_SETTINGS } from '@/domain/settings'
import { createDemoDatabase } from './demo-seed'

const TODAY = '2026-10-04'
const db = createDemoDatabase(TODAY)
const overviews = buildCompanyOverviews(db, TODAY, DEFAULT_SETTINGS)

describe('dados de demonstração', () => {
  it('usa apenas CNPJs fictícios (dígito verificador inválido)', () => {
    expect(db.companies.filter((c) => isCnpjChecksumValid(c.cnpj))).toEqual([])
    expect(new Set(db.companies.map((c) => c.cnpj)).size).toBe(db.companies.length)
  })

  it('reproduz os cards de setor da referência', () => {
    const summary = computeSectorSummaries(db.sectors, overviews).map((s) => [
      s.sector.name,
      s.total,
      s.pendencia,
      s.atencao,
      s.regular,
    ])
    expect(summary).toEqual([
      ['Restaurante e Padaria', 14, 2, 3, 9],
      ['Saúde', 12, 0, 2, 10],
      ['Advocacia', 8, 1, 1, 6],
      ['Indústria', 7, 3, 2, 2],
      ['Pet Shop', 11, 0, 1, 10],
    ])
  })

  it('KPIs coerentes com os setores', () => {
    expect(computeDashboardMetrics(overviews, DEFAULT_SETTINGS)).toEqual({
      monitoredCompanies: 52,
      expiredLicenses: 4,
      expiringWithin30: 7,
      expiringWithin60: 12,
      fullyRegularCompanies: 37,
    })
  })

  it('Padaria Central igual ao painel da referência', () => {
    const o = overviews.find((x) => x.company.legalName === 'Padaria Central LTDA')!
    expect(o.regularityIndex).toBe(85)
    expect(o.health).toBe('atencao')
    expect(o.licenses.map((l) => [l.type.shortName, l.evaluation.status, l.license.expiresAt])).toEqual([
      ['Alvará', 'regular', '2026-12-31'],
      ['Vigilância', 'regular', '2027-03-15'],
      ['Bombeiros', 'atencao', '2026-10-28'],
      ['Ambiental', 'nao_aplicavel', null],
      ['Acessibilidade', 'em_analise', null],
    ])
    const last = new Date(o.lastCheckedAt!)
    expect([last.getHours(), last.getMinutes()]).toEqual([9, 42])
  })

  it('tabela do setor na mesma ordem e situação da referência', () => {
    const restaurante = db.sectors.find((s) => s.slug === 'restaurante-padaria')!
    const rows = overviews
      .filter((o) => o.monitored && o.company.sectorId === restaurante.id)
      .sort((a, b) => a.company.createdAt.localeCompare(b.company.createdAt))
      .slice(0, 10)
      .map((o) => [o.company.legalName, o.health])
    expect(rows).toEqual([
      ['Padaria Central LTDA', 'atencao'],
      ['Restaurante ABC', 'pendencia'],
      ['Panificadora Pão Bom', 'regular'],
      ['Delícias da Terra', 'atencao'],
      ['Sabor & Cia', 'regular'],
      ['Padaria Nova Geração', 'pendencia'],
      ['Restaurante Tradição', 'regular'],
      ['Panificadora Ki-Pão', 'atencao'],
      ['Cantinho do Pão', 'regular'],
      ['Restaurante Sabor Nordestino', 'regular'],
    ])
  })

  it('sugere a Licença de Acessibilidade em todos os setores como "em análise" e a mostra na tabela (até 5 colunas)', () => {
    const type = db.licenseTypes.find((t) => t.code === 'acessibilidade')!
    const rules = db.sectorLicenseRules.filter((r) => r.licenseTypeId === type.id)
    expect(rules).toHaveLength(db.sectors.length)
    expect(new Set(rules.map((r) => r.defaultApplicability))).toEqual(new Set(['em_analise']))
    expect(rules.every((r) => r.showInTable)).toBe(true)
    for (const sector of db.sectors) {
      expect(db.sectorLicenseRules.filter((r) => r.sectorId === sector.id && r.showInTable).length).toBeLessThanOrEqual(5)
    }
  })

  it('mantém 3 alertas não lidos (contador do sino)', () => {
    expect(db.alerts.filter((a) => a.status === 'aberto')).toHaveLength(3)
  })
})
