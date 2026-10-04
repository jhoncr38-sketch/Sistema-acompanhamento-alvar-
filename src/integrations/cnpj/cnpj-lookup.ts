import { AppError } from '@/data/errors'
import { normalizeCnpj } from '@/domain/cnpj'
import type { Address } from '@/domain/types'

export interface CnpjLookupResult {
  legalName: string
  tradeName: string
  mainCnae: string | null
  secondaryCnaes: string[]
  address: Address
  phone: string
  email: string
}

/** Preenchimento automático do cadastro a partir do CNPJ. A fonte oficial será definida depois. */
export interface CnpjLookupProvider {
  readonly name: string
  readonly available: boolean
  lookup(cnpj: string): Promise<CnpjLookupResult>
}

export const pendingCnpjLookup: CnpjLookupProvider = {
  name: 'Consulta de CNPJ',
  available: false,
  async lookup() {
    throw new AppError('INTEGRATION_PENDING', 'INTEGRAÇÃO PENDENTE — consulta de CNPJ. Preencha os dados manualmente.')
  },
}

/** Apenas para o modo demonstração: devolve dados claramente fictícios. */
export const demoCnpjLookup: CnpjLookupProvider = {
  name: 'Simulação (demonstração)',
  available: true,
  async lookup(cnpj) {
    const digits = normalizeCnpj(cnpj)
    if (digits.length !== 14) throw new AppError('VALIDATION', 'Informe os 14 caracteres do CNPJ.')
    await new Promise((r) => setTimeout(r, 400))
    return {
      legalName: `Empresa Demonstração ${digits.slice(0, 4)} LTDA`,
      tradeName: `Demonstração ${digits.slice(0, 4)}`,
      mainCnae: '5611201',
      secondaryCnaes: ['5611203'],
      address: {
        street: 'Rua Exemplo',
        number: '100',
        complement: '',
        district: 'Centro',
        city: 'Teresina',
        state: 'PI',
        zipCode: '64000-000',
      },
      phone: '(86) 3000-0000',
      email: 'contato@demonstracao.exemplo.com.br',
    }
  },
}
