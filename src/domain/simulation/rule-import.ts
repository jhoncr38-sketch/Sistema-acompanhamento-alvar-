import type { ImportedRule } from './csv-import'
import { conditionsSignature, groupByKey, ruleKey, rulesSignature, type RuleContent } from './rule-signature'
import type { CnaeRule, LegislationVersion, LicenseOutcome, RuleBase } from './types'

/**
 * Prévia e publicação de uma importação de legislação. Nada é gravado na prévia: o administrador revisa
 * as diferenças (novos, alterados, removidos, condições modificadas) e só então confirma. A publicação cria
 * uma NOVA VERSÃO da norma (ou complementa uma versão existente) — a versão anterior é preservada.
 */
export type ImportMode = 'completo' | 'parcial'
export type ImportItemStatus = 'novo' | 'alterado' | 'removido' | 'inalterado'

export interface ImportItem {
  key: string
  activity: string | null
  isCbo: boolean
  licenseTypeId: string | null
  annexId: string | null
  description: string | null
  status: ImportItemStatus
  before: CnaeRule[]
  after: ImportedRule[]
  conditionsChanged: boolean
}

export interface ImportCounts {
  encontrados: number
  novos: number
  alterados: number
  removidos: number
  inalterados: number
  condicoesModificadas: number
}

export interface ImportPreview {
  baseVersionId: string | null
  mode: ImportMode
  items: ImportItem[]
  counts: ImportCounts
  /** Anexos afetados pela importação. */
  annexIds: (string | null)[]
}

const toContent = (r: ImportedRule): RuleContent => ({
  priority: r.priority,
  classificationId: r.classificationId,
  elseClassificationId: r.elseClassificationId,
  article: r.article,
  item: r.item,
  description: r.description,
  notes: r.notes,
  licenseTypeId: r.licenseTypeId,
  annexId: r.annexId,
  conditions: r.conditions,
})

/** Versão a comparar quando a importação cria uma versão nova: a vigente na véspera do início. */
export function baseVersionFor(base: RuleBase, legislationId: string, validFrom: string): LegislationVersion | null {
  return (
    base.versions
      .filter((v) => v.legislationId === legislationId && v.active && v.validFrom < validFrom)
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ?? null
  )
}

export function previewImport(params: {
  base: RuleBase
  baseVersionId: string | null
  rows: readonly ImportedRule[]
  removals?: readonly ImportedRule[]
  mode: ImportMode
  defaultAnnexId?: string | null
}): ImportPreview {
  const { base, baseVersionId, rows, mode } = params
  const removals = params.removals ?? []
  const annexIds = [...new Set([...rows, ...removals].map((r) => r.annexId).concat(rows.length + removals.length === 0 ? [params.defaultAnnexId ?? null] : []))]
  const scope = new Set(annexIds)
  const beforeRules = baseVersionId ? base.cnaeRules.filter((r) => r.active && r.legislationVersionId === baseVersionId && scope.has(r.annexId)) : []
  const before = groupByKey(beforeRules)
  const after = groupByKey(rows)
  const describe = (key: string, sample: { cnaeCode: string | null; cboCode: string | null; licenseTypeId: string | null; annexId: string | null }, description: string | null) => ({
    key,
    activity: sample.cboCode ?? sample.cnaeCode,
    isCbo: !!sample.cboCode,
    licenseTypeId: sample.licenseTypeId,
    annexId: sample.annexId,
    description,
  })

  const items: ImportItem[] = []
  for (const [key, imported] of after) {
    const old = before.get(key) ?? []
    const changed = old.length > 0 && rulesSignature(old) !== rulesSignature(imported.map(toContent))
    items.push({
      ...describe(key, imported[0]!, imported.find((r) => r.cnaeDescription)?.cnaeDescription ?? null),
      status: old.length === 0 ? 'novo' : changed ? 'alterado' : 'inalterado',
      before: old,
      after: imported,
      conditionsChanged: old.length > 0 && conditionsSignature(old) !== conditionsSignature(imported),
    })
  }
  const removedKeys = mode === 'completo' ? [...before.keys()].filter((key) => !after.has(key)) : [...new Set(removals.map((r) => ruleKey(r)))].filter((key) => before.has(key))
  for (const key of removedKeys) {
    const old = before.get(key)!
    items.push({ ...describe(key, old[0]!, null), status: 'removido', before: old, after: [], conditionsChanged: false })
  }
  items.sort((a, b) => (a.activity ?? '').localeCompare(b.activity ?? '') || a.key.localeCompare(b.key))

  const count = (status: ImportItemStatus) => items.filter((i) => i.status === status).length
  return {
    baseVersionId,
    mode,
    items,
    annexIds,
    counts: {
      encontrados: after.size,
      novos: count('novo'),
      alterados: count('alterado'),
      removidos: count('removido'),
      inalterados: count('inalterado'),
      condicoesModificadas: items.filter((i) => i.conditionsChanged).length,
    },
  }
}

export interface NewVersionTarget {
  kind: 'nova_versao'
  version: Omit<LegislationVersion, 'id' | 'legislationId'>
  /** Encerra a versão-base na véspera do início da nova. */
  closeBaseVersion: boolean
}

export interface ExistingVersionTarget {
  kind: 'versao_existente'
  versionId: string
}

export interface ImportRuleInput extends Omit<ImportedRule, 'line' | 'annexText' | 'action'> {
  annex: string | null
}

/** Efeito de uma classificação numa licença, publicado junto com a versão (com o fundamento legal). */
export interface ImportLicenseEffect {
  classificationId: string
  licenseTypeId: string
  outcome: LicenseOutcome
  notes: string | null
}

export interface ImportPublication {
  legislationId: string
  target: NewVersionTarget | ExistingVersionTarget
  /** Versão de onde as regras inalteradas são copiadas (nova versão). */
  copyFromVersionId: string | null
  /** Regras da versão-base que NÃO entram na nova versão (alteradas ou removidas). */
  excludeRuleIds: string[]
  /** Regras desativadas na versão existente (alteradas ou removidas). Nada é excluído. */
  deactivateRuleIds: string[]
  insertRules: ImportRuleInput[]
  /** Efeitos nas licenças gravados na versão de destino (substituem os existentes da mesma classificação × licença). */
  licenseEffects: ImportLicenseEffect[]
  batch: {
    fileName: string
    sourceKind: 'csv' | 'xlsx'
    mode: ImportMode
    rowsTotal: number
    counts: ImportCounts
  }
}

export function buildPublication(
  preview: ImportPreview,
  params: {
    legislationId: string
    target: NewVersionTarget | ExistingVersionTarget
    fileName: string
    sourceKind: 'csv' | 'xlsx'
    rowsTotal: number
    licenseEffects?: ImportLicenseEffect[]
  },
): ImportPublication {
  const replaced = preview.items.filter((i) => i.status === 'alterado' || i.status === 'removido').flatMap((i) => i.before.map((r) => r.id))
  const inserted = preview.items
    .filter((i) => i.status === 'novo' || i.status === 'alterado')
    .flatMap((i) => i.after.map(({ line: _line, annexText, action: _action, ...rule }) => ({ ...rule, annex: annexText })))
  const isNew = params.target.kind === 'nova_versao'
  return {
    legislationId: params.legislationId,
    target: params.target,
    copyFromVersionId: isNew ? preview.baseVersionId : null,
    excludeRuleIds: isNew ? replaced : [],
    deactivateRuleIds: isNew ? [] : replaced,
    insertRules: inserted,
    licenseEffects: params.licenseEffects ?? [],
    batch: { fileName: params.fileName, sourceKind: params.sourceKind, mode: preview.mode, rowsTotal: params.rowsTotal, counts: preview.counts },
  }
}
