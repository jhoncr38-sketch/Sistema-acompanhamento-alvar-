import type { CnaeRule, RuleCondition } from './types'

/** Campos que definem o conteúdo de uma regra (para comparar versões e importações). */
export type RuleContent = Pick<
  CnaeRule,
  'priority' | 'classificationId' | 'elseClassificationId' | 'article' | 'item' | 'description' | 'notes' | 'licenseTypeId' | 'annexId'
> & { conditions: Omit<RuleCondition, 'id'>[] }

const clean = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

export function conditionSignature(c: Omit<RuleCondition, 'id'>): string {
  return c.questionId ? `${c.questionId}|${c.operator}|${JSON.stringify(c.value)}` : `texto|${clean(c.description)}`
}

export function conditionsSignature(rules: readonly Pick<RuleContent, 'priority' | 'conditions'>[]): string {
  return [...rules]
    .sort((a, b) => a.priority - b.priority)
    .map((r) => r.conditions.map(conditionSignature).join('&'))
    .join('||')
}

/** Assinatura de um conjunto de regras (mesmo CNAE/área/anexo); iguais = mesmo conteúdo jurídico. */
export function rulesSignature(rules: readonly RuleContent[]): string {
  return [...rules]
    .sort((a, b) => a.priority - b.priority)
    .map((r) =>
      [r.priority, r.classificationId, r.elseClassificationId ?? '', clean(r.article), clean(r.item), clean(r.description), clean(r.notes), r.conditions.map(conditionSignature).join('&')].join('§'),
    )
    .join('||')
}

/** Chave de agrupamento: atividade (CNAE/CBO/padrão) + área (geral ou licença) + anexo. */
export function ruleKey(rule: Pick<CnaeRule, 'cnaeCode' | 'cboCode' | 'licenseTypeId' | 'annexId'>): string {
  const activity = rule.cboCode ? `cbo:${rule.cboCode}` : `cnae:${rule.cnaeCode ?? '*'}`
  return `${activity}|${rule.licenseTypeId ?? 'geral'}|${rule.annexId ?? '-'}`
}

export function groupByKey<T extends Pick<CnaeRule, 'cnaeCode' | 'cboCode' | 'licenseTypeId' | 'annexId'>>(rules: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const rule of rules) {
    const key = ruleKey(rule)
    const list = map.get(key)
    if (list) list.push(rule)
    else map.set(key, [rule])
  }
  return map
}
