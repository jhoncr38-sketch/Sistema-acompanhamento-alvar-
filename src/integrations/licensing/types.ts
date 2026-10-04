import type { ISODate, LicenseSituation } from '@/domain/types'

/**
 * Contrato de um adapter de órgão/fonte (SLIC, GOV.PI Empresas, CBMEPI, DIVISA, SEMARH, CNES, OAB, CRMV…).
 *
 * Regras:
 *  - Adapters reais rodam NO SERVIDOR (Supabase Edge Functions), onde ficam credenciais e certificados.
 *    No navegador existe apenas um proxy que chama a Edge Function.
 *  - Só implemente um adapter quando houver API/serviço oficial autorizado. Nada de endpoints presumidos
 *    nem raspagem de páginas sem autorização.
 */
export interface LicenseLookupRequest {
  companyId: string
  cnpj: string
  city: string
  state: string
  licenseTypeCode: string
  documentNumber: string | null
  protocolNumber: string | null
}

export interface ProviderDocument {
  fileName: string
  mimeType: string
  /** URL temporária ou conteúdo em base64, conforme o adapter. */
  url: string | null
  base64: string | null
}

export interface LicenseLookupResult {
  situation: LicenseSituation
  expiresAt: ISODate | null
  issuedAt: ISODate | null
  documentNumber: string | null
  protocolNumber: string | null
  document: ProviderDocument | null
  /** Resposta resumida da fonte, sem dados sensíveis, para auditoria (`integration_logs`). */
  rawSummary: Record<string, unknown>
}

export interface LicenseProvider {
  readonly code: string
  readonly name: string
  isAvailable(): boolean
  consultLicense(request: LicenseLookupRequest): Promise<LicenseLookupResult>
  getStatus(request: LicenseLookupRequest): Promise<LicenseSituation>
  getExpirationDate(request: LicenseLookupRequest): Promise<ISODate | null>
  getDocument(request: LicenseLookupRequest): Promise<ProviderDocument | null>
  getProtocol(request: LicenseLookupRequest): Promise<string | null>
}
