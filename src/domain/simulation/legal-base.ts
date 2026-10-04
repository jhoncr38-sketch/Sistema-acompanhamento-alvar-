import { normalizeCnae } from '../format'
import type { ISODate } from '../types'
import { isVersionInForce, legislationAppliesTo } from './engine'
import { legislationLabel } from './labels'
import { groupByKey, rulesSignature } from './rule-signature'
import type { CnaeRule, Legislation, LegislationAnnex, LegislationVersion, RuleBase } from './types'

/**
 * Consultas da Base Legal (somente leitura): situação das versões, histórico de cada regra entre
 * redações, conteúdo de um anexo numa data, alterações promovidas por um decreto e pesquisa de CNAE.
 * Tudo é calculado a partir do que está cadastrado — nada é presumido.
 */

export type VersionLegalStatus = 'vigente' | 'substituida' | 'futura' | 'encerrada' | 'inativa'

export function versionLegalStatus(version: LegislationVersion, versions: readonly LegislationVersion[], today: ISODate): VersionLegalStatus {
  if (!version.active) return 'inativa'
  if (isVersionInForce(version, today)) return 'vigente'
  if (version.validFrom > today) return 'futura'
  const replaced = versions.some((v) => v.active && v.id !== version.id && v.legislationId === version.legislationId && v.validFrom > version.validFrom)
  return replaced ? 'substituida' : 'encerrada'
}

export const VERSION_STATUS_LABEL: Record<VersionLegalStatus, string> = {
  vigente: 'Vigente',
  substituida: 'Substituída',
  futura: 'Futura',
  encerrada: 'Encerrada',
  inativa: 'Inativa',
}

/** Versões ativas da norma, da mais antiga para a mais recente (norma original → alterações → vigente). */
export function versionChain(base: RuleBase, legislationId: string): LegislationVersion[] {
  return base.versions.filter((v) => v.legislationId === legislationId && v.active).sort((a, b) => a.validFrom.localeCompare(b.validFrom))
}

export function versionInForce(base: RuleBase, legislationId: string, date: ISODate): LegislationVersion | null {
  return base.versions.find((v) => v.legislationId === legislationId && isVersionInForce(v, date)) ?? null
}

/** Normas modificadoras e as versões que elas originaram na norma principal. */
export function amendmentsOf(base: RuleBase, legislationId: string): { legislation: Legislation; versions: LegislationVersion[] }[] {
  return base.legislations
    .filter((l) => l.parentLegislationId === legislationId && (l.relation === 'altera' || l.relation === 'revoga' || l.relation === 'consolida'))
    .sort((a, b) => (a.normDate ?? `${a.year}`).localeCompare(b.normDate ?? `${b.year}`) || a.number.localeCompare(b.number))
    .map((legislation) => ({ legislation, versions: base.versions.filter((v) => v.legislationId === legislationId && v.amendedByLegislationId === legislation.id) }))
}

export type RuleLegalStatus = 'vigente' | 'alterada' | 'revogada' | 'futura' | 'encerrada'

export const RULE_STATUS_LABEL: Record<RuleLegalStatus, string> = {
  vigente: 'Vigente',
  alterada: 'Alterada',
  revogada: 'Revogada',
  futura: 'Futura',
  encerrada: 'Encerrada',
}

export interface RuleHistoryEntry {
  status: RuleLegalStatus
  validFrom: ISODate
  validTo: ISODate | null
  /** Versões em que a regra teve este mesmo conteúdo. */
  versions: LegislationVersion[]
  /** Norma que deu a redação no início deste período (se houver). */
  amendedBy: string | null
  /** Norma que alterou/revogou a regra ao final deste período (se houver). */
  changedBy: string | null
  rules: CnaeRule[]
}

/**
 * Histórico da regra de um CNAE em uma norma: cada período com o mesmo conteúdo vira uma entrada, com a
 * situação ao final (alterada, revogada) e a vigência. Permite reproduzir enquadramentos antigos.
 */
export function cnaeRuleHistory(base: RuleBase, legislationId: string, cnaeCode: string, today: ISODate): RuleHistoryEntry[] {
  const code = normalizeCnae(cnaeCode)
  const names = new Map(base.legislations.map((l) => [l.id, legislationLabel(l)]))
  const chain = versionChain(base, legislationId)
  const entries: RuleHistoryEntry[] = []
  let current: (RuleHistoryEntry & { signature: string }) | null = null

  const close = (next: LegislationVersion | null, nextSignature: string | null) => {
    if (!current) return
    const last = current.versions.at(-1)!
    let status: RuleLegalStatus
    if (next && nextSignature === null) status = 'revogada'
    else if (next) status = 'alterada'
    else if (isVersionInForce(last, today)) status = 'vigente'
    else status = last.validFrom > today ? 'futura' : 'encerrada'
    const changedBy = next?.amendedByLegislationId ? (names.get(next.amendedByLegislationId) ?? null) : null
    const { signature: _signature, ...entry } = current
    entries.push({ ...entry, status, validTo: next ? (last.validTo ?? next.validFrom) : last.validTo, changedBy })
    current = null
  }

  for (const version of chain) {
    const rules = base.cnaeRules.filter((r) => r.active && r.legislationVersionId === version.id && r.cnaeCode === code)
    const signature = rules.length > 0 ? [...groupByKey(rules).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, list]) => `${k}=${rulesSignature(list)}`).join('##') : null
    if (current && signature === current.signature) {
      current.versions.push(version)
      continue
    }
    close(version, signature)
    if (signature) {
      current = {
        status: 'vigente',
        validFrom: version.validFrom,
        validTo: version.validTo,
        versions: [version],
        amendedBy: version.amendedByLegislationId ? (names.get(version.amendedByLegislationId) ?? null) : null,
        changedBy: null,
        rules,
        signature,
      }
    }
  }
  close(null, null)
  return entries
}

/** Regras de um anexo na versão da norma vigente na data. */
export function annexContent(base: RuleBase, annex: LegislationAnnex, date: ISODate): { version: LegislationVersion | null; rules: CnaeRule[] } {
  const version = versionInForce(base, annex.legislationId, date)
  if (!version) return { version: null, rules: [] }
  const rules = base.cnaeRules
    .filter((r) => r.active && r.legislationVersionId === version.id && r.annexId === annex.id)
    .sort((a, b) => (a.cboCode ?? a.cnaeCode ?? '').localeCompare(b.cboCode ?? b.cnaeCode ?? '') || a.priority - b.priority)
  return { version, rules }
}

export interface VersionChange {
  key: string
  activity: string | null
  isCbo: boolean
  licenseTypeId: string | null
  annexId: string | null
  status: 'incluida' | 'alterada' | 'revogada'
  before: CnaeRule[]
  after: CnaeRule[]
}

/** O que uma versão mudou em relação à versão anterior da mesma norma (ex.: alterações de um decreto). */
export function versionChanges(base: RuleBase, versionId: string): { previous: LegislationVersion | null; changes: VersionChange[] } {
  const version = base.versions.find((v) => v.id === versionId)
  if (!version) return { previous: null, changes: [] }
  const chain = versionChain(base, version.legislationId)
  const previous = chain.filter((v) => v.validFrom < version.validFrom).at(-1) ?? null
  const rulesOf = (id: string | undefined) => (id ? base.cnaeRules.filter((r) => r.active && r.legislationVersionId === id) : [])
  const before = groupByKey(rulesOf(previous?.id))
  const after = groupByKey(rulesOf(version.id))
  const changes: VersionChange[] = []
  const describe = (key: string, sample: CnaeRule, status: VersionChange['status'], b: CnaeRule[], a: CnaeRule[]) =>
    changes.push({ key, activity: sample.cboCode ?? sample.cnaeCode, isCbo: !!sample.cboCode, licenseTypeId: sample.licenseTypeId, annexId: sample.annexId, status, before: b, after: a })
  for (const [key, rules] of after) {
    const old = before.get(key)
    if (!old) describe(key, rules[0]!, 'incluida', [], rules)
    else if (rulesSignature(old) !== rulesSignature(rules)) describe(key, rules[0]!, 'alterada', old, rules)
  }
  for (const [key, rules] of before) if (!after.has(key)) describe(key, rules[0]!, 'revogada', rules, [])
  return { previous, changes: changes.sort((a, b) => (a.activity ?? '').localeCompare(b.activity ?? '')) }
}

export type BaixoRiscoAStatus = 'sim' | 'condicionado' | 'nao_consta'

export interface CnaeLegalEntry {
  legislation: Legislation
  version: LegislationVersion | null
  amendedBy: string | null
  generalRules: CnaeRule[]
  areaRules: CnaeRule[]
  baixoRiscoA: BaixoRiscoAStatus
  annexIds: string[]
  /** Início do período em que a regra atual está em vigor (última atualização). */
  lastUpdate: ISODate | null
  history: RuleHistoryEntry[]
}

/** "Pesquisar CNAE": o que cada norma da localidade diz sobre o CNAE na data de referência. */
export function lookupCnae(base: RuleBase, cnaeCode: string, locality: { uf: string; city: string }, date: ISODate): CnaeLegalEntry[] {
  const code = normalizeCnae(cnaeCode)
  const names = new Map(base.legislations.map((l) => [l.id, legislationLabel(l)]))
  const annexKind = new Map(base.annexes.map((a) => [a.id, a.kind]))
  return base.legislations
    .filter((l) => legislationAppliesTo(l, locality) && l.relation !== 'altera' && l.relation !== 'revoga')
    .flatMap((legislation) => {
      const history = cnaeRuleHistory(base, legislation.id, code, date)
      const version = versionInForce(base, legislation.id, date)
      const rules = version ? base.cnaeRules.filter((r) => r.active && r.legislationVersionId === version.id && r.cnaeCode === code) : []
      if (rules.length === 0 && history.length === 0) return []
      const brA = rules.filter((r) => r.licenseTypeId === null && r.annexId && annexKind.get(r.annexId) === 'baixo_risco_a')
      const current = history.find((h) => version && h.versions.some((v) => v.id === version.id))
      return [
        {
          legislation,
          version,
          amendedBy: version?.amendedByLegislationId ? (names.get(version.amendedByLegislationId) ?? null) : null,
          generalRules: rules.filter((r) => r.licenseTypeId === null).sort((a, b) => a.priority - b.priority),
          areaRules: rules.filter((r) => r.licenseTypeId !== null).sort((a, b) => a.priority - b.priority),
          baixoRiscoA: brA.length === 0 ? 'nao_consta' : brA.some((r) => r.conditions.length > 0) ? 'condicionado' : 'sim',
          annexIds: [...new Set(rules.flatMap((r) => (r.annexId ? [r.annexId] : [])))],
          lastUpdate: current?.validFrom ?? null,
          history,
        } satisfies CnaeLegalEntry,
      ]
    })
}

/** Localidades com normas cadastradas (para agrupar a Base Legal: UF → município). */
export function legalLocalities(base: RuleBase): { uf: string | null; city: string | null; label: string; legislations: Legislation[] }[] {
  const groups = new Map<string, { uf: string | null; city: string | null; label: string; legislations: Legislation[] }>()
  for (const legislation of base.legislations) {
    const key = `${legislation.level}|${legislation.uf ?? ''}|${legislation.city ?? ''}`
    const label = legislation.level === 'federal' ? 'BRASIL — normas federais' : legislation.level === 'estadual' ? `${legislation.uf} — normas estaduais` : `${legislation.city} — ${legislation.uf}`.toUpperCase()
    const group = groups.get(key) ?? { uf: legislation.uf, city: legislation.city, label, legislations: [] }
    group.legislations.push(legislation)
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}
