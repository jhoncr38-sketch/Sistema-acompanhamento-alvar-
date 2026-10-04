import type { CatalogSnapshot, DataSource } from '@/data/types'
import { normalizeCnpj } from '@/domain/cnpj'
import { isValidISODate } from '@/domain/dates'
import { normalizeCnae } from '@/domain/format'
import { normalizeSimulationCnaes } from '@/domain/simulation/engine'
import type { AnswerValue, SimulationCnae, SimulationInput, SimulationResult, SimulationRun } from '@/domain/simulation/types'
import type { Company } from '@/domain/types'
import { demoCnpjLookup, pendingCnpjLookup } from '@/integrations/cnpj/cnpj-lookup'

/** Licenças sempre exibidas no resultado, mesmo quando não há regra cadastrada para elas. */
export const CORE_LICENSE_CODES = ['alvara', 'vigilancia', 'ambiental', 'bombeiros']

export interface SimulationCompanyLink {
  id: string
  name: string
  cnpj: string
}

export interface SimulationForm {
  company: SimulationCompanyLink | null
  /** CNPJ informado sem empresa cadastrada. */
  cnpj: string | null
  cnaes: SimulationCnae[]
  uf: string
  city: string
  referenceDate: string
}

export function validateSimulationForm(form: SimulationForm): string | null {
  if (form.cnaes.length === 0) return 'Informe ao menos um CNAE.'
  if (form.cnaes.some((c) => normalizeCnae(c.code).length !== 7)) return 'Há CNAE incompleto. Use 7 dígitos (ex.: 6911-7/01).'
  if (normalizeSimulationCnaes(form.cnaes).length !== form.cnaes.length) return 'Há CNAE repetido na lista.'
  if (!form.uf) return 'Selecione a UF.'
  if (!form.city.trim()) return 'Informe o município.'
  if (!isValidISODate(form.referenceDate)) return 'Informe a data de referência.'
  return null
}

export function buildSimulationInput(catalog: CatalogSnapshot, form: SimulationForm, answers: Record<string, AnswerValue | null | undefined>): SimulationInput {
  return {
    cnaes: form.cnaes,
    uf: form.uf,
    city: form.city.trim(),
    referenceDate: form.referenceDate,
    answers,
    licenseTypes: catalog.licenseTypes
      .filter((t) => t.active)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => ({ id: t.id, code: t.code, name: t.name, shortName: t.shortName, agency: t.agency })),
    coreLicenseCodes: CORE_LICENSE_CODES,
  }
}

export function saveSimulationRun(ds: DataSource, form: SimulationForm, result: SimulationResult): Promise<SimulationRun> {
  return ds.simulation.saveRun({
    companyId: form.company?.id ?? null,
    companyName: form.company?.name ?? null,
    cnpj: form.company?.cnpj ?? form.cnpj,
    uf: form.uf,
    city: form.city.trim(),
    referenceDate: form.referenceDate,
    cnaes: normalizeSimulationCnaes(form.cnaes),
    result,
  })
}

export function companyCnaes(company: Company, catalog: CatalogSnapshot): SimulationCnae[] {
  const describe = (code: string) => catalog.cnaes.find((c) => normalizeCnae(c.code) === normalizeCnae(code))?.description ?? null
  const codes = [company.mainCnae, ...company.secondaryCnaes].filter((c): c is string => !!c)
  return normalizeSimulationCnaes(codes.map((code, i) => ({ code, description: describe(code), primary: i === 0 && !!company.mainCnae })))
}

export type CnpjSearchResult =
  | { kind: 'empresa'; company: Company; cnaes: SimulationCnae[] }
  | { kind: 'consulta'; cnpj: string; legalName: string; cnaes: SimulationCnae[]; uf: string; city: string }

/**
 * CNPJ → empresa cadastrada (se houver) ou consulta de CNPJ.
 * A consulta externa reaproveita a integração do cadastro de empresas: fora do modo demonstração
 * ela continua "integração pendente" (nenhuma API foi presumida).
 */
export async function searchCnpjForSimulation(ds: DataSource, catalog: CatalogSnapshot, companies: readonly Company[], rawCnpj: string): Promise<CnpjSearchResult> {
  const cnpj = normalizeCnpj(rawCnpj)
  const company = companies.find((c) => c.cnpj === cnpj)
  if (company) return { kind: 'empresa', company, cnaes: companyCnaes(company, catalog) }

  const provider = ds.mode === 'demo' ? demoCnpjLookup : pendingCnpjLookup
  const data = await provider.lookup(cnpj)
  const describe = (code: string) => catalog.cnaes.find((c) => normalizeCnae(c.code) === normalizeCnae(code))?.description ?? null
  const codes = [data.mainCnae, ...data.secondaryCnaes].filter((c): c is string => !!c)
  return {
    kind: 'consulta',
    cnpj,
    legalName: data.legalName,
    cnaes: normalizeSimulationCnaes(codes.map((code, i) => ({ code, description: describe(code), primary: i === 0 }))),
    uf: data.address.state,
    city: data.address.city,
  }
}
