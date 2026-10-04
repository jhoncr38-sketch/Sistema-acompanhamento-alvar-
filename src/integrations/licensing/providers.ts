import { AppError } from '@/data/errors'
import type { IntegrationProvider } from '@/domain/types'
import type { LicenseLookupRequest, LicenseLookupResult, LicenseProvider } from './types'

export class IntegrationPendingError extends AppError {
  readonly providerName: string

  constructor(providerName: string) {
    super('INTEGRATION_PENDING', `INTEGRAÇÃO PENDENTE — ${providerName}. Registre a consulta manualmente.`)
    this.providerName = providerName
  }
}

/** Fonte sem integração oficial disponível: toda chamada informa "integração pendente". */
export class PendingLicenseProvider implements LicenseProvider {
  readonly code: string
  readonly name: string

  constructor(code: string, name: string) {
    this.code = code
    this.name = name
  }

  isAvailable() {
    return false
  }

  private pending(): never {
    throw new IntegrationPendingError(this.name)
  }

  async consultLicense(_request: LicenseLookupRequest): Promise<LicenseLookupResult> {
    return this.pending()
  }
  async getStatus(_request: LicenseLookupRequest): Promise<never> {
    return this.pending()
  }
  async getExpirationDate(_request: LicenseLookupRequest): Promise<never> {
    return this.pending()
  }
  async getDocument(_request: LicenseLookupRequest): Promise<never> {
    return this.pending()
  }
  async getProtocol(_request: LicenseLookupRequest): Promise<never> {
    return this.pending()
  }
}

type ProviderFactory = (provider: IntegrationProvider) => LicenseProvider

/**
 * Adapters implementados, por código da fonte. Vazio de propósito: nenhuma integração oficial
 * foi contratada/autorizada ainda. Ao implementar uma, registre aqui um proxy que chame a
 * Edge Function correspondente (ex.: `supabase.functions.invoke('consult-license', …)`).
 */
export const IMPLEMENTED_ADAPTERS: Readonly<Record<string, ProviderFactory>> = {}

export function hasAdapter(code: string): boolean {
  return code in IMPLEMENTED_ADAPTERS
}

export interface LicenseProviderRegistry {
  get(code: string | null): LicenseProvider
}

export function createLicenseProviderRegistry(providers: readonly IntegrationProvider[]): LicenseProviderRegistry {
  const byCode = new Map(providers.map((p) => [p.code, p]))
  return {
    get(code) {
      const provider = code ? byCode.get(code) : undefined
      if (!provider) return new PendingLicenseProvider(code ?? 'manual', 'Fonte não configurada')
      const factory = IMPLEMENTED_ADAPTERS[provider.code]
      if (!factory || provider.status !== 'ativa') return new PendingLicenseProvider(provider.code, provider.name)
      return factory(provider)
    },
  }
}
