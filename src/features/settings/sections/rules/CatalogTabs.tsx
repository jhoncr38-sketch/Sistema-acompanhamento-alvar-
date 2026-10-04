import { Pencil, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useDataSource } from '@/app/data-context'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/States'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { TONE } from '@/config/simulation'
import type { RiskClassificationInput, RuleQuestionInput } from '@/data/types'
import { QUESTION_TYPE_LABEL } from '@/domain/simulation/labels'
import type { ClassificationTone, QuestionType, RuleBase } from '@/domain/simulation/types'
import { cn } from '@/lib/cn'
import { useRuleAction } from './shared'

function slug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40)
}

// ---------------------------------------------------------------------------
// Perguntas
// ---------------------------------------------------------------------------

const NEW_QUESTION: RuleQuestionInput = { code: '', text: '', type: 'numero', unit: null, options: [], helpText: null, active: true }

/** Perguntas do questionário. Só aparecem na simulação quando usadas em condições de regras. */
export function QuestionsTab({ base, readOnly }: { base: RuleBase; readOnly: boolean }) {
  const [draft, setDraft] = useState<RuleQuestionInput | null>(null)
  const usage = (id: string) => base.cnaeRules.filter((r) => r.active && r.conditions.some((c) => c.questionId === id)).length
  const questions = [...base.questions].sort((a, b) => a.text.localeCompare(b.text, 'pt-BR'))

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-[12.5px] text-muted">
          Cadastre aqui as informações que a legislação exige para enquadrar a atividade (área, características, armazenamento…). O simulador só pergunta o que estiver vinculado a uma
          condição de regra.
        </p>
        {!readOnly && (
          <Button icon={<Plus className="size-4" />} onClick={() => setDraft(NEW_QUESTION)}>
            Adicionar pergunta
          </Button>
        )}
      </div>
      {questions.length === 0 ? (
        <EmptyState title="Nenhuma pergunta cadastrada" />
      ) : (
        <TableFrame>
          <Table className="text-[12.5px]">
            <THead>
              <tr className="h-[34px]">
                <TH>Pergunta</TH>
                <TH>Código</TH>
                <TH>Tipo</TH>
                <TH className="text-right">Regras que usam</TH>
                <TH>Situação</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {questions.map((q) => (
                <TR key={q.id} className="h-[40px]">
                  <TD>
                    <p className="font-semibold text-ink">{q.text}</p>
                    {q.type === 'opcoes' && <p className="text-[11.5px] text-muted">{q.options.map((o) => o.label).join(' · ')}</p>}
                  </TD>
                  <TD>
                    <code className="text-[12px]">{q.code}</code>
                  </TD>
                  <TD>
                    {QUESTION_TYPE_LABEL[q.type]}
                    {q.unit && ` (${q.unit})`}
                  </TD>
                  <TD className="tabular text-right">{usage(q.id)}</TD>
                  <TD>
                    <Badge tone={q.active ? 'ok' : 'neutral'}>{q.active ? 'Ativa' : 'Inativa'}</Badge>
                  </TD>
                  <TD className="text-right">
                    {!readOnly && (
                      <Button size="xs" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setDraft(q)}>
                        Editar
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
      {draft && <QuestionModal key={draft.id ?? 'nova'} draft={draft} onClose={() => setDraft(null)} />}
    </div>
  )
}

function QuestionModal({ draft, onClose }: { draft: RuleQuestionInput; onClose: () => void }) {
  const ds = useDataSource()
  const act = useRuleAction()
  const isNew = !draft.id
  const [form, setForm] = useState(draft)
  const [optionsText, setOptionsText] = useState(draft.options.map((o) => o.label).join('\n'))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof RuleQuestionInput>(key: K, value: RuleQuestionInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const code = isNew ? slug(form.code || form.text) : form.code
    if (!form.text.trim() || !code) return setError('Informe o texto da pergunta.')
    const labels = optionsText.split('\n').map((l) => l.trim()).filter(Boolean)
    // Mantém o valor das opções já existentes (as regras gravadas dependem dele).
    const options = labels.map((label) => draft.options.find((o) => o.label === label) ?? { value: slug(label), label })
    if (form.type === 'opcoes' && options.length < 2) return setError('Informe ao menos duas opções, uma por linha.')
    setSaving(true)
    const ok = await act(() => ds.simulation.saveQuestion({ ...form, code, options: form.type === 'opcoes' ? options : [] }), isNew ? 'Pergunta cadastrada' : 'Pergunta atualizada')
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Adicionar pergunta' : 'Editar pergunta'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="question-form" loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="question-form" onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
        <Field label="Pergunta" required className="sm:col-span-2">
          {(p) => <Input {...p} value={form.text} onChange={(e) => set('text', e.target.value)} placeholder="Ex.: Área utilizada pelo estabelecimento" />}
        </Field>
        <Field label="Código" hint={isNew ? 'Usado na importação CSV. Em branco, é gerado a partir da pergunta.' : 'Não pode ser alterado (usado na importação CSV).'}>
          {(p) => <Input {...p} value={form.code} disabled={!isNew} onChange={(e) => set('code', slug(e.target.value))} placeholder="area_m2" />}
        </Field>
        <Field label="Tipo de resposta" required>
          {(p) => (
            <Select {...p} value={form.type} disabled={!isNew} onChange={(e) => set('type', e.target.value as QuestionType)}>
              {Object.entries(QUESTION_TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {form.type === 'numero' && (
          <Field label="Unidade">{(p) => <Input {...p} value={form.unit ?? ''} onChange={(e) => set('unit', e.target.value.trim() || null)} placeholder="m²" />}</Field>
        )}
        {form.type === 'opcoes' && (
          <Field label="Opções" required className="sm:col-span-2" hint="Uma por linha.">
            {(p) => <Textarea {...p} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} />}
          </Field>
        )}
        <Field label="Texto de ajuda" className="sm:col-span-2">
          {(p) => <Input {...p} value={form.helpText ?? ''} onChange={(e) => set('helpText', e.target.value || null)} />}
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-ink sm:col-span-2">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="size-4 accent-[#0c6cf0]" />
          Ativa (disponível para novas condições)
        </label>
        {error && (
          <p role="alert" className="text-[12.5px] text-danger-ink sm:col-span-2">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Classificações
// ---------------------------------------------------------------------------

const TONE_LABEL: Record<ClassificationTone, string> = { green: 'Verde', blue: 'Azul', orange: 'Laranja', red: 'Vermelho', yellow: 'Amarelo', gray: 'Cinza' }
const NEW_CLASSIFICATION: RiskClassificationInput = { code: '', name: '', severity: 10, tone: 'gray', active: true }

export function ClassificationsTab({ base, readOnly }: { base: RuleBase; readOnly: boolean }) {
  const [draft, setDraft] = useState<RiskClassificationInput | null>(null)
  const classifications = [...base.classifications].sort((a, b) => a.severity - b.severity)
  const usage = (id: string) => base.cnaeRules.filter((r) => r.active && (r.classificationId === id || r.elseClassificationId === id)).length

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-[12.5px] text-muted">
          Classificações de risco usadas nas regras. O <strong>grau</strong> ordena do menor para o maior risco e é usado quando a norma determina que a atividade de maior risco define o
          enquadramento.
        </p>
        {!readOnly && (
          <Button icon={<Plus className="size-4" />} onClick={() => setDraft({ ...NEW_CLASSIFICATION, severity: Math.max(0, ...classifications.map((c) => c.severity)) + 10 })}>
            Adicionar classificação
          </Button>
        )}
      </div>
      <TableFrame>
        <Table className="text-[12.5px]">
          <THead>
            <tr className="h-[34px]">
              <TH>Classificação</TH>
              <TH>Código</TH>
              <TH className="text-right">Grau de risco</TH>
              <TH className="text-right">Regras que usam</TH>
              <TH>Situação</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {classifications.map((c) => (
              <TR key={c.id} className="h-[40px]">
                <TD>
                  <span className={cn('inline-flex h-[22px] items-center rounded-md px-2 text-[12px] font-bold', TONE[c.tone].soft, TONE[c.tone].text)}>{c.name}</span>
                </TD>
                <TD>
                  <code className="text-[12px]">{c.code}</code>
                </TD>
                <TD className="tabular text-right">{c.severity}</TD>
                <TD className="tabular text-right">{usage(c.id)}</TD>
                <TD>
                  <Badge tone={c.active ? 'ok' : 'neutral'}>{c.active ? 'Ativa' : 'Inativa'}</Badge>
                </TD>
                <TD className="text-right">
                  {!readOnly && (
                    <Button size="xs" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setDraft(c)}>
                      Editar
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </TableFrame>
      <p className="mt-3 text-[11.5px] text-muted">“Necessita análise” e “Regra não cadastrada” não são classificações: são os resultados do simulador quando as regras cadastradas não permitem concluir.</p>
      {draft && <ClassificationModal key={draft.id ?? 'nova'} draft={draft} onClose={() => setDraft(null)} />}
    </div>
  )
}

function ClassificationModal({ draft, onClose }: { draft: RiskClassificationInput; onClose: () => void }) {
  const ds = useDataSource()
  const act = useRuleAction()
  const isNew = !draft.id
  const [form, setForm] = useState(draft)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const code = isNew ? slug(form.name) : form.code
    if (!form.name.trim() || !code) return setError('Informe o nome da classificação.')
    if (!Number.isInteger(form.severity)) return setError('O grau de risco deve ser um número inteiro.')
    setSaving(true)
    const ok = await act(() => ds.simulation.saveClassification({ ...form, code }), isNew ? 'Classificação cadastrada' : 'Classificação atualizada')
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={isNew ? 'Adicionar classificação' : 'Editar classificação'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="classification-form" loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="classification-form" onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <Field label="Nome" required>
          {(p) => <Input {...p} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />}
        </Field>
        <Field label="Grau de risco" required hint="Quanto maior o número, maior o risco.">
          {(p) => <Input {...p} type="number" value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: Number(e.target.value) }))} />}
        </Field>
        <Field label="Cor">
          {(p) => (
            <Select {...p} value={form.tone} onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value as ClassificationTone }))}>
              {Object.entries(TONE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="size-4 accent-[#0c6cf0]" />
          Ativa (disponível para novas regras)
        </label>
        {error && (
          <p role="alert" className="text-[12.5px] text-danger-ink">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
