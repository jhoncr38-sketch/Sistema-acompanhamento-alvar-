import { AppError } from '@/data/errors'
import type { CatalogSnapshot, ConsultationBundle, DataSource, LicenseStateUpdate } from '@/data/types'
import { changeAlertFor, consultationErrorAlertFor, expirationAlertFor, type AlertDraft } from '@/domain/alert-rules'
import { detectChanges, type ChangeDetectionResult, type ConsultationSnapshot } from '@/domain/change-detection'
import { formatDateTime } from '@/domain/format'
import { resolveLicenseStatus } from '@/domain/license-status'
import type {
  CompanyLicense,
  ConsultationOutcome,
  ConsultationType,
  ISODate,
  ISODateTime,
  LicenseConsultation,
  LicenseSituation,
  UserProfile,
} from '@/domain/types'
import { createLicenseProviderRegistry, IntegrationPendingError } from '@/integrations/licensing/providers'

export interface ConsultationInput {
  companyLicenseId: string
  consultedAt: ISODateTime
  outcome: ConsultationOutcome
  situation: LicenseSituation | null
  expiresAt: ISODate | null
  issuedAt: ISODate | null
  providerCode: string | null
  sourceLabel: string | null
  documentNumber: string | null
  protocolNumber: string | null
  notes: string | null
  errorMessage: string | null
  responsibleName: string
  file: File | null
}

export interface ConsultationContext {
  ds: DataSource
  catalog: CatalogSnapshot
  user: UserProfile
  today: ISODate
}

export interface ConsultationResult {
  consultation: LicenseConsultation
  previous: LicenseConsultation | null
  detection: ChangeDetectionResult
}

const FUTURE_TOLERANCE_MS = 5 * 60_000

function validate(input: ConsultationInput, previous: LicenseConsultation | null) {
  if (input.outcome === 'sucesso' && !input.situation) {
    throw new AppError('VALIDATION', 'Informe a situação encontrada na consulta.')
  }
  if (input.outcome === 'erro' && !input.errorMessage?.trim()) {
    throw new AppError('VALIDATION', 'Descreva o erro ocorrido na consulta.')
  }
  if (new Date(input.consultedAt).getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    throw new AppError('VALIDATION', 'A data da consulta não pode estar no futuro.')
  }
  if (previous && input.consultedAt < previous.consultedAt) {
    throw new AppError(
      'VALIDATION',
      `A data da consulta não pode ser anterior à última consulta registrada (${formatDateTime(previous.consultedAt)}).`,
    )
  }
}

/**
 * Registra uma consulta (manual ou automática) SEM sobrescrever o histórico:
 * grava um novo registro, compara com a última consulta bem-sucedida, registra a alteração,
 * atualiza o estado atual da licença e gera alertas — tudo numa única gravação atômica.
 */
export async function registerConsultation(
  ctx: ConsultationContext,
  input: ConsultationInput,
  type: ConsultationType = 'manual',
): Promise<ConsultationResult> {
  const license = await ctx.ds.licenses.get(input.companyLicenseId)
  if (!license) throw new AppError('NOT_FOUND', 'Licença não encontrada.')
  const company = await ctx.ds.companies.get(license.companyId)
  if (!company) throw new AppError('NOT_FOUND', 'Empresa não encontrada.')
  const licenseType = ctx.catalog.licenseTypes.find((t) => t.id === license.licenseTypeId)
  if (!licenseType) throw new AppError('NOT_FOUND', 'Tipo de licença não encontrado.')

  const previous = await ctx.ds.consultations.latestSuccessful(license.id)
  validate(input, previous)

  const clean = (v: string | null) => (v?.trim() ? v.trim() : null)
  const snapshot: ConsultationSnapshot = {
    outcome: input.outcome,
    situation: input.outcome === 'sucesso' ? input.situation : null,
    expiresAt: input.outcome === 'sucesso' ? input.expiresAt : null,
    issuedAt: input.outcome === 'sucesso' ? input.issuedAt : null,
    documentNumber: clean(input.documentNumber),
    protocolNumber: clean(input.protocolNumber),
  }
  const detection = detectChanges(previous, snapshot)
  const consultationId = crypto.randomUUID()
  const changeId = detection.changed ? crypto.randomUUID() : null

  const consultation: ConsultationBundle['consultation'] = {
    id: consultationId,
    companyLicenseId: license.id,
    companyId: company.id,
    licenseTypeId: licenseType.id,
    consultedAt: input.consultedAt,
    type,
    ...snapshot,
    errorMessage: input.outcome === 'erro' ? clean(input.errorMessage) : null,
    providerCode: input.providerCode,
    sourceLabel: clean(input.sourceLabel),
    notes: clean(input.notes),
    responsibleId: ctx.user.id,
    responsibleName: input.responsibleName.trim() || ctx.user.fullName,
    previousConsultationId: previous?.id ?? null,
    changeDetected: detection.changed,
  }

  let licenseUpdate: LicenseStateUpdate | null = null
  const alerts: AlertDraft[] = []

  if (input.outcome === 'sucesso') {
    // Campo não informado mantém o valor atual (a fonte apenas não trouxe aquele dado).
    licenseUpdate = {
      lastConsultationId: consultationId,
      lastCheckedAt: input.consultedAt,
      situation: snapshot.situation,
      expiresAt: snapshot.expiresAt ?? (licenseType.hasExpiration ? license.expiresAt : null),
      issuedAt: snapshot.issuedAt ?? license.issuedAt,
      documentNumber: snapshot.documentNumber ?? license.documentNumber,
      protocolNumber: snapshot.protocolNumber ?? license.protocolNumber,
      providerCode: input.providerCode ?? license.providerCode,
    }
    if (detection.changed && changeId && previous) {
      alerts.push(
        changeAlertFor({
          companyId: company.id,
          companyName: company.legalName,
          companyLicenseId: license.id,
          licenseName: licenseType.name,
          changes: detection.changes,
          consultationId,
          changeId,
        }),
      )
    }
    const updated: CompanyLicense = { ...license, ...licenseUpdate }
    const evaluation = resolveLicenseStatus(updated, ctx.today, ctx.catalog.settings.expirationThresholds)
    const expirationAlert = expirationAlertFor(company.id, company.legalName, {
      license: updated,
      type: licenseType,
      evaluation,
    })
    if (expirationAlert) alerts.push(expirationAlert)
  } else {
    alerts.push(
      consultationErrorAlertFor({
        companyId: company.id,
        companyName: company.legalName,
        companyLicenseId: license.id,
        licenseName: licenseType.name,
        error: consultation.errorMessage ?? 'Erro não informado',
        consultationId,
      }),
    )
  }

  const bundle: ConsultationBundle = {
    consultation,
    change: changeId ? { id: changeId, changes: detection.changes } : null,
    licenseUpdate,
    alerts,
    document: input.file
      ? {
          file: input.file,
          input: {
            companyLicenseId: license.id,
            companyId: company.id,
            consultationId,
            documentType: licenseType.name,
            name: `${licenseType.name} — consulta de ${formatDateTime(input.consultedAt)}`,
            number: snapshot.documentNumber,
            issuingAgency: licenseType.agency,
            issuedAt: snapshot.issuedAt,
            expiresAt: snapshot.expiresAt,
          },
        }
      : null,
  }

  const saved = await ctx.ds.consultations.record(bundle, previous?.id ?? null)
  return { consultation: saved, previous, detection }
}

export type ProviderAttempt =
  | { license: CompanyLicense; state: 'pendente'; providerName: string }
  | { license: CompanyLicense; state: 'consultada'; result: ConsultationResult }
  | { license: CompanyLicense; state: 'erro'; message: string }

/**
 * Tenta consultar as licenças aplicáveis pelas fontes integradas.
 * Sem integração disponível, devolve "pendente" para que a consulta seja registrada manualmente.
 */
export async function consultViaProviders(
  ctx: ConsultationContext,
  licenses: readonly CompanyLicense[],
): Promise<ProviderAttempt[]> {
  const registry = createLicenseProviderRegistry(ctx.catalog.providers)
  const attempts: ProviderAttempt[] = []
  for (const license of licenses) {
    if (license.applicability !== 'aplicavel') continue
    const provider = registry.get(license.providerCode)
    if (!provider.isAvailable()) {
      attempts.push({ license, state: 'pendente', providerName: provider.name })
      continue
    }
    try {
      const company = await ctx.ds.companies.get(license.companyId)
      const type = ctx.catalog.licenseTypes.find((t) => t.id === license.licenseTypeId)
      if (!company || !type) throw new AppError('NOT_FOUND', 'Empresa ou licença não encontrada.')
      const lookup = await provider.consultLicense({
        companyId: company.id,
        cnpj: company.cnpj,
        city: company.address.city,
        state: company.address.state,
        licenseTypeCode: type.code,
        documentNumber: license.documentNumber,
        protocolNumber: license.protocolNumber,
      })
      const result = await registerConsultation(
        ctx,
        {
          companyLicenseId: license.id,
          consultedAt: new Date().toISOString(),
          outcome: 'sucesso',
          situation: lookup.situation,
          expiresAt: lookup.expiresAt,
          issuedAt: lookup.issuedAt,
          providerCode: provider.code,
          sourceLabel: provider.name,
          documentNumber: lookup.documentNumber,
          protocolNumber: lookup.protocolNumber,
          notes: null,
          errorMessage: null,
          responsibleName: 'Rotina automática',
          file: null,
        },
        'automatica',
      )
      attempts.push({ license, state: 'consultada', result })
    } catch (error) {
      if (error instanceof IntegrationPendingError) {
        attempts.push({ license, state: 'pendente', providerName: error.providerName })
      } else {
        attempts.push({ license, state: 'erro', message: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  return attempts
}
