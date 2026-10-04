import { describe, expect, it } from 'vitest'
import { changeAlertFor, describeChanges, expirationAlertFor } from './alert-rules'
import { detectChanges, type ConsultationSnapshot } from './change-detection'
import { formatCnpj, isCnpjChecksumValid, isCnpjShapeValid } from './cnpj'
import { evaluateCompanyHealth } from './company-health'
import { addDays, daysBetween } from './dates'
import { classifyExpiration, resolveLicenseStatus } from './license-status'
import { suggestLicenses, suggestSector } from './licensing-profile'
import { buildAttentionList, buildCompanyOverviews, computeDashboardMetrics, computeSectorSummaries } from './monitoring'
import { can } from './permissions'
import { calculateRegularityIndex } from './regularity'
import { DEFAULT_SETTINGS, validateThresholds } from './settings'
import type { Company, CompanyLicense, LicenseType, Sector } from './types'

const TODAY = '2026-10-04'
const T = DEFAULT_SETTINGS.expirationThresholds

describe('datas', () => {
  it('conta dias corridos e soma dias', () => {
    expect(daysBetween(TODAY, '2026-10-28')).toBe(24)
    expect(daysBetween(TODAY, '2026-12-31')).toBe(88)
    expect(addDays(TODAY, -1)).toBe('2026-10-03')
  })
})

describe('faixas de vencimento', () => {
  it.each([
    [61, 'regular'],
    [60, 'atencao_preventiva'],
    [31, 'atencao_preventiva'],
    [30, 'atencao'],
    [16, 'atencao'],
    [15, 'atencao_alta'],
    [8, 'atencao_alta'],
    [7, 'critico'],
    [0, 'critico'],
    [-1, 'vencida'],
  ])('%i dias → %s', (days, level) => {
    expect(classifyExpiration(addDays(TODAY, days), TODAY, T).level).toBe(level)
  })

  it('respeita faixas configuradas', () => {
    const custom = { preventiveDays: 90, attentionDays: 45, highDays: 20, criticalDays: 10 }
    expect(classifyExpiration(addDays(TODAY, 80), TODAY, custom).level).toBe('atencao_preventiva')
    expect(classifyExpiration(addDays(TODAY, 10), TODAY, custom).level).toBe('critico')
  })

  it('valida a ordem das faixas', () => {
    expect(validateThresholds(T)).toBeNull()
    expect(validateThresholds({ ...T, highDays: 40 })).not.toBeNull()
  })
})

describe('status da licença', () => {
  const base = { applicability: 'aplicavel' as const, situation: 'regular' as const, expiresAt: '2026-10-28' }

  it('fonte diz Regular, mas vencimento em 24 dias → Atenção (caso Bombeiros da referência)', () => {
    const e = resolveLicenseStatus(base, TODAY, T)
    expect(e).toEqual({ status: 'atencao', level: 'atencao', daysRemaining: 24 })
  })

  it('validade passada vira Vencida mesmo com situação Regular', () => {
    expect(resolveLicenseStatus({ ...base, expiresAt: '2026-09-20' }, TODAY, T).status).toBe('vencida')
  })

  it('aplicabilidade prevalece', () => {
    expect(resolveLicenseStatus({ ...base, applicability: 'nao_aplicavel' }, TODAY, T).status).toBe('nao_aplicavel')
    expect(resolveLicenseStatus({ ...base, applicability: 'dispensada' }, TODAY, T).status).toBe('dispensada')
    expect(resolveLicenseStatus({ ...base, applicability: 'em_analise' }, TODAY, T).status).toBe('em_analise')
  })

  it('sem consulta e sem validade → Pendente', () => {
    expect(resolveLicenseStatus({ ...base, situation: null, expiresAt: null }, TODAY, T).status).toBe('pendente')
  })

  it('situação informada pela fonte é respeitada', () => {
    expect(resolveLicenseStatus({ ...base, situation: 'em_renovacao' }, TODAY, T).status).toBe('em_renovacao')
    expect(resolveLicenseStatus({ ...base, situation: 'vencida', expiresAt: null }, TODAY, T).status).toBe('vencida')
  })

  it('licença sem validade (ex.: registro) com situação Regular → Regular', () => {
    expect(resolveLicenseStatus({ ...base, expiresAt: null }, TODAY, T).status).toBe('regular')
  })
})

describe('índice de regularidade', () => {
  const ev = (expiresAt: string | null, applicability: CompanyLicense['applicability'] = 'aplicavel') => ({
    applicability,
    evaluation: resolveLicenseStatus({ applicability, situation: 'regular', expiresAt }, TODAY, T),
  })

  it('reproduz os 85% da Padaria Central', () => {
    const items = [ev('2026-12-31'), ev('2027-03-15'), ev('2026-10-28'), ev(null, 'nao_aplicavel')]
    expect(calculateRegularityIndex(items, DEFAULT_SETTINGS.regularityWeights)).toBe(85)
  })

  it('licenças não aplicáveis não reduzem o índice', () => {
    const items = [ev('2027-03-15'), ev(null, 'nao_aplicavel'), ev(null, 'dispensada'), ev(null, 'em_analise')]
    expect(calculateRegularityIndex(items, DEFAULT_SETTINGS.regularityWeights)).toBe(100)
  })

  it('sem licenças aplicáveis → null', () => {
    expect(calculateRegularityIndex([ev(null, 'nao_aplicavel')], DEFAULT_SETTINGS.regularityWeights)).toBeNull()
  })
})

describe('situação da empresa', () => {
  const e = (status: Parameters<typeof evaluateCompanyHealth>[0][number]['status']) => ({
    status,
    level: 'sem_validade' as const,
    daysRemaining: null,
  })
  it('pendência > atenção > regular', () => {
    expect(evaluateCompanyHealth([e('regular'), e('atencao'), e('vencida')])).toBe('pendencia')
    expect(evaluateCompanyHealth([e('regular'), e('pendente')])).toBe('pendencia')
    expect(evaluateCompanyHealth([e('regular'), e('em_renovacao')])).toBe('atencao')
    expect(evaluateCompanyHealth([e('regular'), e('nao_aplicavel')])).toBe('regular')
  })
})

describe('detecção de alterações', () => {
  const prev: ConsultationSnapshot = {
    outcome: 'sucesso',
    situation: 'regular',
    expiresAt: '2026-11-20',
    issuedAt: null,
    documentNumber: 'ABC-1',
    protocolNumber: null,
  }

  it('nada mudou', () => {
    expect(detectChanges(prev, { ...prev })).toEqual({ comparable: true, changed: false, changes: [] })
  })

  it('Regular → Vencida com mesma validade', () => {
    const r = detectChanges(prev, { ...prev, situation: 'vencida' })
    expect(r.changed).toBe(true)
    expect(r.changes).toEqual([{ field: 'situation', previous: 'regular', current: 'vencida' }])
    expect(describeChanges(r.changes)).toBe('Situação: Regular → Vencida')
  })

  it('campo não informado na nova consulta não é alteração', () => {
    expect(detectChanges(prev, { ...prev, documentNumber: null }).changed).toBe(false)
  })

  it('primeira consulta ou consulta com erro não são comparadas', () => {
    expect(detectChanges(null, prev).comparable).toBe(false)
    expect(detectChanges(prev, { ...prev, outcome: 'erro', situation: null }).comparable).toBe(false)
  })

  it('gera alerta de alteração com prioridade alta quando piora', () => {
    const alert = changeAlertFor({
      companyId: 'c',
      companyName: 'Restaurante ABC',
      companyLicenseId: 'l',
      licenseName: 'Vigilância Sanitária',
      changes: [{ field: 'situation', previous: 'regular', current: 'vencida' }],
      consultationId: 'x',
      changeId: 'y',
    })
    expect(alert.priority).toBe('alta')
    expect(alert.category).toBe('alteracao_detectada')
  })
})

describe('CNPJ', () => {
  it('formata e valida CNPJ numérico', () => {
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81')
    expect(isCnpjChecksumValid('11.222.333/0001-81')).toBe(true)
    expect(isCnpjChecksumValid('11.222.333/0001-82')).toBe(false)
    expect(isCnpjChecksumValid('11.111.111/1111-11')).toBe(false)
  })

  it('aceita CNPJ alfanumérico', () => {
    expect(isCnpjShapeValid('12.ABC.345/01DE-35')).toBe(true)
    expect(isCnpjChecksumValid('12ABC34501DE35')).toBe(true)
    expect(isCnpjShapeValid('12.ABC.345/01DE-3X')).toBe(false)
  })
})

describe('permissões', () => {
  it('perfil Consulta só lê; só administrador mexe em configurações', () => {
    expect(can('consulta', 'company:write')).toBe(false)
    expect(can('colaborador', 'consultation:create')).toBe(true)
    expect(can('contador', 'settings:manage')).toBe(false)
    expect(can('administrador', 'settings:manage')).toBe(true)
  })
})

describe('matriz CNAE → setor → licenças', () => {
  const cnaes = [
    { id: 'c1', code: '7500100', description: 'Atividades veterinárias' },
    { id: 'c2', code: '4789004', description: 'Pet shop' },
  ]
  const types = [
    { id: 'alvara', sortOrder: 1, active: true },
    { id: 'crmv', sortOrder: 5, active: true },
    { id: 'amb', sortOrder: 4, active: true },
  ] as LicenseType[]

  it('sugere setor pelo CNAE principal', () => {
    const rules = [{ id: 'r', cnaeId: 'c2', sectorId: 'pet', priority: 1 }]
    expect(suggestSector(['4789-0/04'], cnaes, rules)).toEqual({ sectorId: 'pet', cnaeCode: '4789004' })
    expect(suggestSector(['0000000'], cnaes, rules)).toBeNull()
  })

  it('CNAE ajusta o perfil do setor', () => {
    const result = suggestLicenses({
      sectorId: 'pet',
      cnaeCodes: ['7500-1/00'],
      sectorRules: [
        { id: '1', sectorId: 'pet', licenseTypeId: 'alvara', defaultApplicability: 'aplicavel', showInTable: true, sortOrder: 1, notes: null },
        { id: '2', sectorId: 'pet', licenseTypeId: 'crmv', defaultApplicability: 'em_analise', showInTable: true, sortOrder: 2, notes: null },
        { id: '3', sectorId: 'pet', licenseTypeId: 'amb', defaultApplicability: 'em_analise', showInTable: true, sortOrder: 3, notes: null },
      ],
      cnaeLicenseRules: [{ id: 'x', cnaeId: 'c1', licenseTypeId: 'crmv', applicability: 'aplicavel', notes: null }],
      cnaes,
      licenseTypes: types,
    })
    expect(result.map((r) => [r.licenseTypeId, r.applicability])).toEqual([
      ['alvara', 'aplicavel'],
      ['amb', 'em_analise'],
      ['crmv', 'aplicavel'],
    ])
    expect(result.find((r) => r.licenseTypeId === 'crmv')?.reason).toBe('CNAE 7500-1/00')
  })
})

describe('indicadores', () => {
  const sector = { id: 's', slug: 's', name: 'S', color: 'orange', icon: 'utensils', coverImageUrl: null, sortOrder: 1, active: true } as Sector
  const type = (id: string, sortOrder: number) =>
    ({ id, code: id, name: id, shortName: id, agency: '', agencyScope: 'municipal', defaultProviderCode: null, hasExpiration: true, sortOrder, active: true }) as LicenseType
  const company = (id: string, status: Company['status'] = 'ativa') => ({ id, sectorId: 's', status, legalName: id, tradeName: '' }) as Company
  const lic = (companyId: string, licenseTypeId: string, expiresAt: string | null, extra: Partial<CompanyLicense> = {}) =>
    ({ id: `${companyId}-${licenseTypeId}`, companyId, licenseTypeId, applicability: 'aplicavel', situation: 'regular', expiresAt, lastCheckedAt: null, ...extra }) as CompanyLicense

  const overviews = buildCompanyOverviews(
    {
      sectors: [sector],
      licenseTypes: [type('a', 1), type('b', 2)],
      companies: [company('ok'), company('warn'), company('bad'), company('off', 'inativa')],
      licenses: [
        lic('ok', 'a', addDays(TODAY, 200)),
        lic('ok', 'b', null, { applicability: 'nao_aplicavel' }),
        lic('warn', 'a', addDays(TODAY, 20)),
        lic('warn', 'b', addDays(TODAY, 45)),
        lic('bad', 'a', addDays(TODAY, -3)),
        lic('bad', 'b', addDays(TODAY, 5)),
        lic('off', 'a', addDays(TODAY, -30)),
      ],
    },
    TODAY,
    DEFAULT_SETTINGS,
  )

  it('calcula KPIs ignorando empresas inativas', () => {
    expect(computeDashboardMetrics(overviews, DEFAULT_SETTINGS)).toEqual({
      monitoredCompanies: 3,
      expiredLicenses: 1,
      expiringWithin30: 2,
      expiringWithin60: 3,
      fullyRegularCompanies: 1,
    })
  })

  it('resume o setor por situação das empresas', () => {
    const [summary] = computeSectorSummaries([sector], overviews)
    expect(summary).toMatchObject({ total: 3, regular: 1, atencao: 1, pendencia: 1 })
  })

  it('ordena "Atenção hoje" pelas situações mais críticas', () => {
    const list = buildAttentionList(overviews)
    expect(list.map((i) => i.message)).toEqual([
      'a: vencida há 3 dias',
      'b vence em 5 dias',
      'a vence em 20 dias',
      'b vence em 45 dias',
    ])
    expect(list.map((i) => i.tone)).toEqual(['danger', 'orange', 'yellow', 'yellow'])
  })

  it('gera alerta de vencimento com prioridade pela faixa', () => {
    const bad = overviews.find((o) => o.company.id === 'bad')!
    const drafts = bad.licenses.map((l) => expirationAlertFor('bad', 'Bad', l))
    expect(drafts.map((d) => d?.priority)).toEqual(['critica', 'critica'])
    expect(drafts.map((d) => d?.category)).toEqual(['licenca_vencida', 'vencimento_proximo'])
  })
})
