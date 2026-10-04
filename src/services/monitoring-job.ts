import { expirationAlertFor, type AlertDraft } from '@/domain/alert-rules'
import { buildCompanyOverviews, isMonitored } from '@/domain/monitoring'
import type { Alert } from '@/domain/types'
import { dispatchNotification, type NotificationChannel } from '@/integrations/notifications/channels'
import { pickTemplate, renderTemplate } from '@/integrations/notifications/templates'
import { consultViaProviders, type ConsultationContext } from './consultation-service'

export interface MonitoringCycleReport {
  startedAt: string
  finishedAt: string
  companies: number
  licenses: number
  consulted: number
  integrationPending: number
  errors: number
  changes: number
  alertsCreated: number
  notificationsSent: number
}

/**
 * Rotina de monitoramento (executada por agendamento no servidor; também pode ser disparada
 * manualmente em Configurações). Fluxo:
 * empresas ativas → licenças monitoradas → consultar fonte → salvar resultado → comparar com o anterior
 * → detectar alteração → atualizar status → gerar alerta → notificar quando necessário.
 * Fontes sem integração ficam como "integração pendente"; nenhuma chamada externa é simulada.
 */
export async function runMonitoringCycle(
  ctx: ConsultationContext,
  channels: readonly NotificationChannel[],
): Promise<MonitoringCycleReport> {
  const startedAt = new Date().toISOString()
  const companies = (await ctx.ds.companies.list()).filter(isMonitored)
  const companyIds = new Set(companies.map((c) => c.id))
  const monitoredLicenses = (await ctx.ds.licenses.listAll()).filter(
    (l) => companyIds.has(l.companyId) && l.applicability === 'aplicavel',
  )

  const attempts = await consultViaProviders(ctx, monitoredLicenses)

  // Estado atualizado após as consultas, para avaliar vencimentos.
  const licenses = (await ctx.ds.licenses.listAll()).filter((l) => companyIds.has(l.companyId))
  const overviews = buildCompanyOverviews(
    { companies, licenses, licenseTypes: ctx.catalog.licenseTypes, sectors: ctx.catalog.sectors },
    ctx.today,
    ctx.catalog.settings,
  )
  const drafts: AlertDraft[] = []
  const evaluations = new Map<string, { days: number | null; company: string; cnpj: string; license: string; agency: string; expiresAt: string | null }>()
  for (const o of overviews) {
    for (const e of o.licenses) {
      const draft = expirationAlertFor(o.company.id, o.company.legalName, e)
      if (!draft) continue
      drafts.push(draft)
      evaluations.set(e.license.id, {
        days: e.evaluation.daysRemaining,
        company: o.company.legalName,
        cnpj: o.company.cnpj,
        license: e.type.name,
        agency: e.type.agency,
        expiresAt: e.license.expiresAt,
      })
    }
  }
  const created: Alert[] = await ctx.ds.alerts.createMany(drafts)

  let notificationsSent = 0
  for (const alert of created) {
    const info = alert.companyLicenseId ? evaluations.get(alert.companyLicenseId) : undefined
    if (!info) continue
    const template = pickTemplate(info.days, ctx.catalog.settings.notificationScheduleDays)
    if (!template) continue
    const message = renderTemplate(template, {
      empresa: info.company,
      cnpj: info.cnpj,
      licenca: info.license,
      orgao: info.agency,
      validade: info.expiresAt,
      dias: info.days,
    })
    notificationsSent += await dispatchNotification(channels, ctx.ds.notifications, { alert, template, message, recipient: null })
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    companies: companies.length,
    licenses: monitoredLicenses.length,
    consulted: attempts.filter((a) => a.state === 'consultada').length,
    integrationPending: attempts.filter((a) => a.state === 'pendente').length,
    errors: attempts.filter((a) => a.state === 'erro').length,
    changes: attempts.filter((a) => a.state === 'consultada' && a.result.detection.changed).length,
    alertsCreated: created.length,
    notificationsSent,
  }
}
