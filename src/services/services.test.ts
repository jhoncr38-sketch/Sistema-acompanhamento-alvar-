import { beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '@/data/errors'
import { createMockDataSource } from '@/data/mock/mock-data-source'
import type { DataSource } from '@/data/types'
import { todayISO } from '@/domain/dates'
import { createInAppChannel } from '@/integrations/notifications/channels'
import { pickTemplate } from '@/integrations/notifications/templates'
import { registerConsultation, consultViaProviders, type ConsultationContext, type ConsultationInput } from './consultation-service'
import { runMonitoringCycle } from './monitoring-job'
import { buildReport, toCsv } from './reports'

let ds: DataSource
let ctx: ConsultationContext

async function licenseOf(companyName: string, code: string) {
  const company = (await ds.companies.list()).find((c) => c.legalName === companyName)!
  const type = ctx.catalog.licenseTypes.find((t) => t.code === code)!
  const license = (await ds.licenses.listByCompany(company.id)).find((l) => l.licenseTypeId === type.id)!
  return { company, license }
}

function input(companyLicenseId: string, extra: Partial<ConsultationInput> = {}): ConsultationInput {
  return {
    companyLicenseId,
    consultedAt: new Date().toISOString(),
    outcome: 'sucesso',
    situation: 'regular',
    expiresAt: null,
    issuedAt: null,
    providerCode: null,
    sourceLabel: 'CBMEPI',
    documentNumber: null,
    protocolNumber: null,
    notes: null,
    errorMessage: null,
    responsibleName: '',
    file: null,
    ...extra,
  }
}

beforeEach(async () => {
  ds = createMockDataSource({ latencyMs: 0, storage: null })
  const user = (await ds.auth.getCurrentUser())!
  ctx = { ds, user, catalog: await ds.catalog.getCatalog(), today: todayISO() }
})

describe('registro de consulta', () => {
  it('nunca sobrescreve: cada consulta gera um novo registro', async () => {
    const { license } = await licenseOf('Padaria Central LTDA', 'bombeiros')
    const before = await ds.consultations.list({ companyLicenseId: license.id })
    const result = await registerConsultation(ctx, input(license.id, { expiresAt: license.expiresAt }))
    const after = await ds.consultations.list({ companyLicenseId: license.id })
    expect(after).toHaveLength(before.length + 1)
    expect(after.slice(1)).toEqual(before)
    expect(result.detection).toEqual({ comparable: true, changed: false, changes: [] })
  })

  it('detecta alteração, registra o evento e gera alerta', async () => {
    const { license, company } = await licenseOf('Padaria Central LTDA', 'bombeiros')
    const result = await registerConsultation(ctx, input(license.id, { situation: 'vencida', expiresAt: license.expiresAt }))
    expect(result.detection.changes).toEqual([{ field: 'situation', previous: 'regular', current: 'vencida' }])
    const [change] = await ds.consultations.listChanges({ companyId: company.id })
    expect(change?.consultationId).toBe(result.consultation.id)
    const alerts = await ds.alerts.list({ companyId: company.id })
    expect(alerts.some((a) => a.category === 'alteracao_detectada' && a.changeId === change?.id)).toBe(true)
    const updated = await ds.licenses.get(license.id)
    expect(updated?.situation).toBe('vencida')
    expect(updated?.lastConsultationId).toBe(result.consultation.id)
  })

  it('consulta com erro fica no histórico mas não altera o estado da licença', async () => {
    const { license } = await licenseOf('Padaria Central LTDA', 'alvara')
    await registerConsultation(ctx, input(license.id, { outcome: 'erro', situation: null, errorMessage: 'Fonte fora do ar' }))
    const updated = await ds.licenses.get(license.id)
    expect(updated).toMatchObject({ situation: license.situation, expiresAt: license.expiresAt, lastConsultationId: license.lastConsultationId })
    const alerts = await ds.alerts.list({ companyId: license.companyId })
    expect(alerts[0]?.category).toBe('consulta_com_erro')
  })

  it('bloqueia consulta retroativa e gravação concorrente', async () => {
    const { license } = await licenseOf('Padaria Central LTDA', 'alvara')
    await expect(registerConsultation(ctx, input(license.id, { consultedAt: '2020-01-01T10:00:00.000Z' }))).rejects.toThrow(/anterior/)
    const previous = await ds.consultations.latestSuccessful(license.id)
    await registerConsultation(ctx, input(license.id))
    await expect(
      ds.consultations.record(
        { consultation: { ...previous!, id: crypto.randomUUID() }, change: null, licenseUpdate: null, alerts: [], document: null },
        previous!.id,
      ),
    ).rejects.toMatchObject({ code: 'CONCURRENT_UPDATE' })
  })

  it('perfil Consulta não registra consultas', async () => {
    await ds.demo!.switchUser('consulta')
    const { license } = await licenseOf('Padaria Central LTDA', 'alvara')
    await expect(registerConsultation(ctx, input(license.id))).rejects.toBeInstanceOf(AppError)
  })
})

describe('integrações', () => {
  it('sem integração oficial, toda fonte responde "pendente"', async () => {
    const { company } = await licenseOf('Padaria Central LTDA', 'alvara')
    const attempts = await consultViaProviders(ctx, await ds.licenses.listByCompany(company.id))
    expect(attempts.map((a) => a.state)).toEqual(['pendente', 'pendente', 'pendente'])
  })

  it('rotina não consulta fontes pendentes e não duplica alertas já abertos', async () => {
    const report = await runMonitoringCycle(ctx, [createInAppChannel()])
    expect(report.consulted).toBe(0)
    expect(report.integrationPending).toBe(report.licenses)
    expect(report.alertsCreated).toBe(0)
  })

  it('escolhe o template de notificação pela antecedência', () => {
    const schedule = [90, 60, 30, 15, 7, 0]
    expect(pickTemplate(100, schedule)).toBeNull()
    expect(pickTemplate(45, schedule)).toBe('d60')
    expect(pickTemplate(7, schedule)).toBe('d7')
    expect(pickTemplate(-2, schedule)).toBe('vencida')
  })
})

describe('relatórios', () => {
  it('exporta CSV com separador ";" e BOM', () => {
    const csv = toCsv({ columns: [{ key: 'a', label: 'Empresa' }], rows: [{ a: 'Sabor; & Cia' }] })
    expect(csv).toBe('﻿Empresa\r\n"Sabor; & Cia"')
  })

  it('lista licenças vencidas', async () => {
    const { buildCompanyOverviews } = await import('@/domain/monitoring')
    const overviews = buildCompanyOverviews(
      { companies: await ds.companies.list(), licenses: await ds.licenses.listAll(), licenseTypes: ctx.catalog.licenseTypes, sectors: ctx.catalog.sectors },
      ctx.today,
      ctx.catalog.settings,
    )
    const table = buildReport('licencas-vencidas', {
      overviews,
      companies: [],
      sectors: ctx.catalog.sectors,
      licenseTypes: ctx.catalog.licenseTypes,
      consultations: [],
      changes: [],
      period: { from: ctx.today, to: ctx.today },
    })
    expect(table.rows).toHaveLength(4)
  })
})
