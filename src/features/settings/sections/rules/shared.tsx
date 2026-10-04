import { useCallback } from 'react'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/data/errors'
import { formatDate } from '@/domain/format'
import { conditionText, legislationLabel } from '@/domain/simulation/labels'
import type { Legislation, LegislationVersion, RuleBase, RuleCondition, RuleQuestion } from '@/domain/simulation/types'
import { useInvalidateSimulation } from '@/hooks/simulation-queries'

/** Executa uma gravação do painel de regras com aviso de sucesso/erro e recarga dos dados. */
export function useRuleAction() {
  const toast = useToast()
  const invalidate = useInvalidateSimulation()
  return useCallback(
    async (action: () => Promise<unknown>, success?: string): Promise<boolean> => {
      try {
        await action()
        await invalidate.rules()
        if (success) toast.success(success)
        return true
      } catch (error) {
        toast.error('Não foi possível salvar', errorMessage(error))
        return false
      }
    },
    [toast, invalidate],
  )
}

export function validityLabel(version: Pick<LegislationVersion, 'validFrom' | 'validTo'>): string {
  return `${formatDate(version.validFrom)} a ${version.validTo ? formatDate(version.validTo) : 'atualmente'}`
}

export type VersionSituation = 'vigente' | 'futura' | 'encerrada' | 'inativa'

export function versionSituation(version: LegislationVersion, legislation: Legislation | undefined, today: string): VersionSituation {
  if (!version.active || legislation?.active === false) return 'inativa'
  if (version.validFrom > today) return 'futura'
  if (version.validTo && version.validTo < today) return 'encerrada'
  return 'vigente'
}

export const SITUATION_BADGE: Record<VersionSituation, { label: string; tone: 'ok' | 'blue' | 'neutral' | 'warn' }> = {
  vigente: { label: 'Vigente hoje', tone: 'ok' },
  futura: { label: 'Futura', tone: 'blue' },
  encerrada: { label: 'Encerrada', tone: 'neutral' },
  inativa: { label: 'Inativa', tone: 'warn' },
}

export interface VersionOption {
  id: string
  label: string
}

/** Versões para os seletores, da mais recente para a mais antiga dentro de cada norma. */
export function versionOptions(base: RuleBase): VersionOption[] {
  const legislations = new Map(base.legislations.map((l) => [l.id, l]))
  return [...base.versions]
    .sort((a, b) => a.legislationId.localeCompare(b.legislationId) || b.validFrom.localeCompare(a.validFrom))
    .flatMap((v) => {
      const legislation = legislations.get(v.legislationId)
      return legislation ? [{ id: v.id, label: `${legislationLabel(legislation)} — ${v.label} (${validityLabel(v)})` }] : []
    })
}

/** Texto de cada condição da regra: a pergunta cadastrada ou o texto transcrito da norma. */
export function ruleConditionsText(rule: { conditions: readonly Omit<RuleCondition, 'id'>[] }, questions: readonly RuleQuestion[]): string[] {
  const byId = new Map(questions.map((q) => [q.id, q]))
  return rule.conditions.map((c) => {
    if (c.questionId === null) return c.description
    const question = byId.get(c.questionId)
    return question ? conditionText(c, question) : c.description || 'Pergunta não cadastrada'
  })
}
