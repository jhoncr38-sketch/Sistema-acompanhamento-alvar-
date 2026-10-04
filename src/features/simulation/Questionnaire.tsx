import { useId } from 'react'
import { Input, Select } from '@/components/ui/Form'
import { formatCnae } from '@/domain/format'
import type { AnswerValue, QuestionRequest } from '@/domain/simulation/types'
import { cn } from '@/lib/cn'

export type Answers = Record<string, AnswerValue | undefined>

/**
 * Questionário dinâmico: exibe SOMENTE as perguntas que constam nas condições das regras cadastradas.
 * Condições transcritas da norma aparecem com o texto legal e são respondidas com Sim/Não.
 * Deixar em branco é permitido — o resultado fica "condicionado".
 */
export function Questionnaire({ requests, answers, onChange }: { requests: QuestionRequest[]; answers: Answers; onChange: (answers: Answers) => void }) {
  const baseId = useId()
  const set = (id: string, value: AnswerValue | undefined) => onChange({ ...answers, [id]: value })

  return (
    <div className="flex flex-col gap-4">
      {requests.map(({ question, usedBy, legalText }) => {
        const id = `${baseId}-${question.id}`
        const value = answers[question.id]
        return (
          <div key={question.id} className={cn(legalText && 'rounded-lg border border-line-soft bg-[#fafcfe] p-2.5')}>
            {legalText && <p className="mb-0.5 text-[11px] font-bold tracking-wide text-primary uppercase">Condição prevista na norma</p>}
            <label htmlFor={question.type === 'sim_nao' ? undefined : id} id={`${id}-label`} className="text-[13.5px] font-semibold text-ink">
              {question.text}
            </label>
            <p className="mb-1.5 text-[11.5px] text-muted">
              {question.helpText ? `${question.helpText} ` : ''}Usada na regra do CNAE {usedBy.map(formatCnae).join(', ')}.
            </p>
            {question.type === 'numero' && (
              <div className="flex items-center gap-2">
                <Input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  className="w-40"
                  value={typeof value === 'number' ? value : ''}
                  onChange={(e) => set(question.id, e.target.value === '' ? undefined : Number(e.target.value))}
                />
                {question.unit && <span className="text-[13px] text-ink-soft">{question.unit}</span>}
              </div>
            )}
            {question.type === 'sim_nao' && (
              <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex gap-2">
                {(
                  [
                    [true, 'Sim'],
                    [false, 'Não'],
                  ] as const
                ).map(([option, label]) => (
                  <label
                    key={label}
                    className={cn(
                      'flex h-[34px] w-24 cursor-pointer items-center justify-center gap-2 rounded-lg border text-[13px]',
                      value === option ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-[#d9e1ec] text-ink-soft hover:bg-[#f5f8fc]',
                    )}
                  >
                    <input
                      type="radio"
                      name={id}
                      className="sr-only"
                      checked={value === option}
                      onChange={() => set(question.id, option)}
                      onClick={() => value === option && set(question.id, undefined)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
            {question.type === 'opcoes' && (
              <Select id={id} className="w-auto min-w-[220px]" value={typeof value === 'string' ? value : ''} onChange={(e) => set(question.id, e.target.value || undefined)}>
                <option value="">Não sei informar</option>
                {question.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </div>
        )
      })}
    </div>
  )
}
