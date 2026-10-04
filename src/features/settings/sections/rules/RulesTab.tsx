import { Pencil, Plus, Power, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useDataSource } from '@/app/data-context'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input, SearchInput, Select, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/States'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { TONE } from '@/config/simulation'
import type { CatalogSnapshot, CnaeRuleInput } from '@/data/types'
import { formatCnae, normalizeCnae } from '@/domain/format'
import { conditionText, OPERATOR_LABEL } from '@/domain/simulation/labels'
import type { CnaeRule, ConditionOperator, ConditionValue, RuleBase, RuleQuestion } from '@/domain/simulation/types'
import { cn } from '@/lib/cn'
import { CnaeInput, cnaeEntry, EMPTY_CNAE, type CnaeEntry } from '@/features/simulation/CnaeInput'
import { useRuleAction, versionOptions } from './shared'

const PAGE_SIZE = 20
const NUMBER_OPERATORS: ConditionOperator[] = ['lte', 'lt', 'gte', 'gt', 'eq', 'neq']
/** Condição transcrita da norma (sem pergunta cadastrada): respondida com Sim/Não na simulação. */
const LEGAL_TEXT = '__texto__'

interface ConditionDraft {
  /** id da pergunta, '' (não escolhida) ou LEGAL_TEXT */
  questionId: string
  operator: ConditionOperator
  /** número (texto), "sim"/"nao" ou valores de opções separados por "|" */
  value: string
  description: string
}

function toDraft(value: ConditionValue): string {
  if (typeof value === 'boolean') return value ? 'sim' : 'nao'
  return Array.isArray(value) ? value.join('|') : String(value)
}

function toValue(draft: ConditionDraft, question: RuleQuestion): { operator: ConditionOperator; value: ConditionValue } | string {
  if (question.type === 'numero') {
    const n = Number(draft.value.replace(',', '.'))
    if (draft.value.trim() === '' || Number.isNaN(n)) return `Informe o valor numérico de "${question.text}".`
    return { operator: draft.operator === 'in' ? 'eq' : draft.operator, value: n }
  }
  if (question.type === 'sim_nao') return { operator: 'eq', value: draft.value === 'sim' }
  const values = draft.value.split('|').filter(Boolean)
  if (values.length === 0) return `Selecione ao menos uma opção de "${question.text}".`
  if (draft.operator === 'neq') return { operator: 'neq', value: values.length === 1 ? values[0]! : values }
  return values.length === 1 ? { operator: 'eq', value: values[0]! } : { operator: 'in', value: values }
}

export function RulesTab({ base, catalog, readOnly }: { base: RuleBase; catalog: CatalogSnapshot; readOnly: boolean }) {
  const ds = useDataSource()
  const act = useRuleAction()
  const options = useMemo(() => versionOptions(base), [base])
  const [versionId, setVersionId] = useState(options[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<CnaeRule | 'new' | null>(null)
  const selectedVersion = options.some((o) => o.id === versionId) ? versionId : (options[0]?.id ?? '')

  const classification = useMemo(() => new Map(base.classifications.map((c) => [c.id, c])), [base])
  const questions = useMemo(() => new Map(base.questions.map((q) => [q.id, q])), [base])
  const annexLabel = useMemo(() => new Map(base.annexes.map((a) => [a.id, `Anexo ${a.code}`])), [base])
  const licenseName = useMemo(() => new Map(catalog.licenseTypes.map((t) => [t.id, t.name])), [catalog])
  const documentName = useMemo(() => new Map(base.documents.map((d) => [d.id, d.edition ?? d.title])), [base])
  const describe = useMemo(() => new Map(catalog.cnaes.map((c) => [normalizeCnae(c.code), c.description])), [catalog])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    return base.cnaeRules
      .filter((r) => r.legislationVersionId === selectedVersion && (showInactive || r.active))
      .filter((r) => {
        if (!q) return true
        if (r.cboCode) return digits.length > 0 && r.cboCode.includes(digits)
        if (r.cnaeCode === null) return 'padrão'.includes(q) || 'padrao'.includes(q)
        return (digits.length > 0 && r.cnaeCode.includes(digits)) || (describe.get(r.cnaeCode) ?? '').toLowerCase().includes(q)
      })
      .sort((a, b) => (a.cboCode ?? a.cnaeCode ?? '').localeCompare(b.cboCode ?? b.cnaeCode ?? '') || (a.licenseTypeId ?? '').localeCompare(b.licenseTypeId ?? '') || a.priority - b.priority)
  }, [base, selectedVersion, showInactive, query, describe])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, totalPages)

  if (options.length === 0) {
    return <EmptyState title="Cadastre primeiro a norma e a versão" description="As regras por CNAE pertencem a uma versão da norma (aba Normas e versões)." />
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={selectedVersion} onChange={(e) => { setVersionId(e.target.value); setPage(1) }} aria-label="Versão da norma" className="w-auto max-w-full min-w-[280px] flex-1">
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
        <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1) }} label="Pesquisar CNAE" placeholder="Pesquisar CNAE..." className="w-[220px]" />
        <label className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="size-4 accent-[#0c6cf0]" />
          Mostrar desativadas
        </label>
        {!readOnly && (
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Nova regra
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nenhuma regra nesta versão" description="Cadastre regras uma a uma ou importe a planilha do anexo (aba Importar legislação)." />
      ) : (
        <TableFrame>
          <Table className="text-[12.5px]">
            <THead>
              <tr className="h-[34px]">
                <TH>CNAE / CBO</TH>
                <TH>Anexo / área</TH>
                <TH className="text-center">Ordem</TH>
                <TH>Classificação</TH>
                <TH>Condições</TH>
                <TH>Se não atender</TH>
                <TH>Base normativa</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE).map((rule) => {
                const cls = classification.get(rule.classificationId)
                const alt = rule.elseClassificationId ? classification.get(rule.elseClassificationId) : undefined
                return (
                  <TR key={rule.id} className={cn('align-top', !rule.active && 'opacity-55')}>
                    <TD className="py-2">
                      {rule.cboCode ? (
                        <span className="tabular font-semibold text-ink">CBO {rule.cboCode}</span>
                      ) : rule.cnaeCode === null ? (
                        <span className="font-semibold text-ink">Regra padrão da norma</span>
                      ) : (
                        <>
                          <span className="tabular font-semibold text-ink">{formatCnae(rule.cnaeCode)}</span>
                          <span className="block max-w-[260px] truncate text-[11.5px] text-muted" title={describe.get(rule.cnaeCode)}>
                            {describe.get(rule.cnaeCode)}
                          </span>
                        </>
                      )}
                      {!rule.active && <Badge tone="warn" className="mt-1">Desativada</Badge>}
                    </TD>
                    <TD className="py-2 text-ink-soft">
                      {rule.annexId ? (annexLabel.get(rule.annexId) ?? '—') : (rule.annex ?? '—')}
                      <span className="block text-[11.5px] text-muted">{rule.licenseTypeId ? (licenseName.get(rule.licenseTypeId) ?? 'Licença') : 'Enquadramento geral'}</span>
                    </TD>
                    <TD className="tabular py-2 text-center">{rule.priority}</TD>
                    <TD className="py-2">
                      {cls && <span className={cn('inline-flex h-[22px] items-center rounded-md px-2 text-[12px] font-bold whitespace-nowrap', TONE[cls.tone].soft, TONE[cls.tone].text)}>{cls.name}</span>}
                    </TD>
                    <TD className="py-2">
                      {rule.conditions.length === 0 ? (
                        <span className="text-muted">Sem condições</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {rule.conditions.map((c) => {
                            if (c.questionId === null) {
                              return (
                                <li key={c.id}>
                                  <span className="font-semibold text-ink-soft">Norma:</span> {c.description}
                                </li>
                              )
                            }
                            const q = questions.get(c.questionId)
                            return <li key={c.id}>{q ? conditionText(c, q) : 'Pergunta não encontrada'}</li>
                          })}
                        </ul>
                      )}
                    </TD>
                    <TD className="py-2">{rule.conditions.length === 0 ? '—' : (alt?.name ?? 'Próxima regra / necessita análise')}</TD>
                    <TD className="py-2 text-ink-soft">
                      {[rule.article, rule.item].filter(Boolean).join(' · ') || '—'}
                      {rule.notes && <span className="block text-[11.5px] text-muted">Obs.: {rule.notes}</span>}
                      <span className="block text-[11.5px] text-muted">
                        {rule.sourceDocumentId ? `Fonte: ${documentName.get(rule.sourceDocumentId) ?? 'documento'}${rule.sourcePage ? `, pág. ${rule.sourcePage}` : ''}` : 'Sem documento-fonte'}
                      </span>
                    </TD>
                    <TD className="py-1.5 text-right whitespace-nowrap">
                      {!readOnly && (
                        <>
                          <Button size="xs" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(rule)}>
                            Editar
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            icon={<Power className="size-3.5" />}
                            onClick={() => act(() => ds.simulation.setCnaeRuleActive(rule.id, !rule.active), rule.active ? 'Regra desativada' : 'Regra reativada')}
                          >
                            {rule.active ? 'Desativar' : 'Reativar'}
                          </Button>
                        </>
                      )}
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </Table>
        </TableFrame>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-muted">{rows.length} regra(s). Regras nunca são excluídas: desative as que não valem mais.</p>
        <Pagination page={current} totalPages={totalPages} onChange={setPage} />
      </div>

      {editing && (
        <RuleModal
          key={editing === 'new' ? 'new' : editing.id}
          base={base}
          catalog={catalog}
          versionId={selectedVersion}
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function RuleModal({ base, catalog, versionId, rule, onClose }: { base: RuleBase; catalog: CatalogSnapshot; versionId: string; rule: CnaeRule | null; onClose: () => void }) {
  const ds = useDataSource()
  const act = useRuleAction()
  const classifications = base.classifications.filter((c) => c.active || c.id === rule?.classificationId || c.id === rule?.elseClassificationId).sort((a, b) => a.severity - b.severity)
  const questions = base.questions.filter((q) => q.active || rule?.conditions.some((c) => c.questionId === q.id))
  const description = (code: string) => catalog.cnaes.find((c) => normalizeCnae(c.code) === code)?.description ?? null
  const legislationId = base.versions.find((v) => v.id === (rule?.legislationVersionId ?? versionId))?.legislationId
  const annexes = base.annexes.filter((a) => a.legislationId === legislationId && (a.active || a.id === rule?.annexId)).sort((a, b) => a.sortOrder - b.sortOrder)
  const licenseTypes = catalog.licenseTypes.filter((t) => t.active || t.id === rule?.licenseTypeId).sort((a, b) => a.sortOrder - b.sortOrder)

  const [kind, setKind] = useState<'cnae' | 'cbo' | 'padrao'>(rule?.cboCode ? 'cbo' : rule && rule.cnaeCode === null ? 'padrao' : 'cnae')
  const isDefault = kind === 'padrao'
  const [cbo, setCbo] = useState(rule?.cboCode ?? '')
  const [annexId, setAnnexId] = useState(rule?.annexId ?? '')
  const [licenseTypeId, setLicenseTypeId] = useState(rule?.licenseTypeId ?? '')
  const [notes, setNotes] = useState(rule?.notes ?? '')
  const [sourceDocumentId, setSourceDocumentId] = useState(rule?.sourceDocumentId ?? '')
  const [sourcePage, setSourcePage] = useState(rule?.sourcePage ? String(rule.sourcePage) : '')
  const documents = base.documents.filter((d) => d.active || d.id === rule?.sourceDocumentId)
  const [cnae, setCnae] = useState<CnaeEntry>(rule?.cnaeCode ? cnaeEntry(rule.cnaeCode, description(rule.cnaeCode)) : EMPTY_CNAE)
  const [cnaeDescription, setCnaeDescription] = useState('')
  const [classificationId, setClassificationId] = useState(rule?.classificationId ?? '')
  const [elseId, setElseId] = useState(rule?.elseClassificationId ?? '')
  const [priority, setPriority] = useState(String(rule?.priority ?? 1))
  const [conditions, setConditions] = useState<ConditionDraft[]>(
    rule?.conditions.map((c) => ({ questionId: c.questionId ?? LEGAL_TEXT, operator: c.operator, value: toDraft(c.value), description: c.description })) ?? [],
  )
  const [article, setArticle] = useState(rule?.article ?? '')
  const [annex, setAnnex] = useState(rule?.annex ?? '')
  const [item, setItem] = useState(rule?.item ?? '')
  const [summary, setSummary] = useState(rule?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const unknownCnae = kind === 'cnae' && cnae.code !== null && description(cnae.code) === null

  const patch = (index: number, changes: Partial<ConditionDraft>) => setConditions((list) => list.map((c, i) => (i === index ? { ...c, ...changes } : c)))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (kind === 'cnae' && !cnae.code) return setError('Informe o CNAE com 7 dígitos ou escolha "regra padrão".')
    const cboDigits = cbo.replace(/\D/g, '')
    if (kind === 'cbo' && cboDigits.length !== 6) return setError('Informe o CBO com 6 dígitos.')
    if (!classificationId) return setError('Selecione a classificação.')
    const page = sourcePage.trim() ? Number(sourcePage) : null
    if (page !== null && (!Number.isInteger(page) || page < 1)) return setError('A página do documento deve ser um número a partir de 1.')
    const order = Number(priority)
    if (!Number.isInteger(order) || order < 1) return setError('A ordem deve ser um número inteiro a partir de 1.')

    const built: CnaeRuleInput['conditions'] = []
    for (const draft of conditions) {
      if (draft.questionId === LEGAL_TEXT) {
        if (!draft.description.trim()) return setError('Transcreva o texto da condição como está na norma.')
        built.push({ questionId: null, operator: 'eq', value: true, description: draft.description.trim() })
        continue
      }
      const question = base.questions.find((q) => q.id === draft.questionId)
      if (!question) return setError('Selecione a pergunta de cada condição.')
      const parsed = toValue(draft, question)
      if (typeof parsed === 'string') return setError(parsed)
      built.push({ questionId: question.id, ...parsed, description: draft.description.trim() })
    }

    setSaving(true)
    const ok = await act(
      () =>
        ds.simulation.saveCnaeRule({
          id: rule?.id,
          legislationVersionId: rule?.legislationVersionId ?? versionId,
          cnaeCode: kind === 'cnae' ? cnae.code : null,
          cboCode: kind === 'cbo' ? cboDigits : null,
          annexId: annexId || null,
          licenseTypeId: licenseTypeId || null,
          notes: notes.trim() || null,
          sourceDocumentId: sourceDocumentId || null,
          sourcePage: sourceDocumentId ? page : null,
          cnaeDescription: cnaeDescription.trim() || null,
          priority: order,
          classificationId,
          elseClassificationId: built.length > 0 && elseId ? elseId : null,
          conditions: built,
          article: article.trim() || null,
          annex: annexId ? null : annex.trim() || null,
          item: item.trim() || null,
          description: summary,
          active: rule?.active ?? true,
        }),
      rule ? 'Regra atualizada' : 'Regra cadastrada',
    )
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={rule ? 'Editar regra' : 'Nova regra'}
      description="Transcreva a regra como está na norma. O simulador aplica exatamente o que for cadastrado aqui."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="rule-form" loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="rule-form" onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-6" noValidate>
        <Field label="A regra vale para" className="sm:col-span-2" hint={isDefault ? 'Qualquer CNAE sem regra específica nesta versão.' : undefined}>
          {(p) => (
            <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="cnae">Um CNAE</option>
              <option value="cbo">Uma ocupação (CBO)</option>
              <option value="padrao">Regra padrão da norma</option>
            </Select>
          )}
        </Field>
        <Field label="Anexo da norma" className="sm:col-span-2">
          {(p) => (
            <Select {...p} value={annexId} onChange={(e) => setAnnexId(e.target.value)}>
              <option value="">{annexes.length === 0 ? 'Norma sem anexos cadastrados' : 'Nenhum'}</option>
              {annexes.map((a) => (
                <option key={a.id} value={a.id}>
                  Anexo {a.code} — {a.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Área" className="sm:col-span-2" hint={licenseTypeId ? 'Classificação específica desta licença (ex.: risco sanitário).' : 'Enquadramento geral da atividade.'}>
          {(p) => (
            <Select {...p} value={licenseTypeId} onChange={(e) => setLicenseTypeId(e.target.value)}>
              <option value="">Enquadramento geral</option>
              {licenseTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {kind === 'cbo' && (
          <Field label="CBO" required className="sm:col-span-6" hint="Classificação Brasileira de Ocupações (6 dígitos), para regras do anexo de CBO.">
            {(p) => <Input {...p} value={cbo} onChange={(e) => setCbo(e.target.value)} inputMode="numeric" placeholder="0000-00" />}
          </Field>
        )}
        {kind === 'cnae' && (
          <Field label="CNAE" required className="sm:col-span-6">
            {(p) => <CnaeInput {...p} value={cnae} onChange={setCnae} cnaes={catalog.cnaes} />}
          </Field>
        )}
        {unknownCnae && (
          <Field label="Descrição do CNAE" className="sm:col-span-6" hint="Este CNAE ainda não está no catálogo. A descrição será incluída junto com a regra.">
            {(p) => <Input {...p} value={cnaeDescription} onChange={(e) => setCnaeDescription(e.target.value)} />}
          </Field>
        )}
        <Field label="Classificação" required className="sm:col-span-4" hint="Aplicada quando todas as condições são atendidas (ou quando não há condições).">
          {(p) => (
            <Select {...p} value={classificationId} onChange={(e) => setClassificationId(e.target.value)}>
              <option value="">Selecione…</option>
              {classifications.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Ordem" className="sm:col-span-2" hint="Entre regras do mesmo CNAE, vale a primeira atendida.">
          {(p) => <Input {...p} type="number" min={1} value={priority} onChange={(e) => setPriority(e.target.value)} />}
        </Field>

        <fieldset className="rounded-xl border border-line p-3 sm:col-span-6">
          <legend className="px-1 text-[12px] font-semibold text-ink-soft">Condições (todas precisam ser atendidas)</legend>
          {conditions.length === 0 && <p className="text-[12.5px] text-muted">Sem condições: a classificação vale sempre para este CNAE.</p>}
          <ul className="flex flex-col gap-2.5">
            {conditions.map((c, i) => {
              const question = base.questions.find((q) => q.id === c.questionId)
              return (
                <li key={i} className="grid grid-cols-1 gap-2 rounded-lg bg-[#f6f9fc] p-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <Select
                    aria-label={`Pergunta da condição ${i + 1}`}
                    value={c.questionId}
                    onChange={(e) => {
                      const next = base.questions.find((q) => q.id === e.target.value)
                      patch(i, { questionId: e.target.value, operator: next?.type === 'numero' ? 'lte' : 'eq', value: next?.type === 'sim_nao' ? 'sim' : '' })
                    }}
                  >
                    <option value="">Pergunta…</option>
                    <option value={LEGAL_TEXT}>Texto da norma (respondido com Sim/Não)</option>
                    {questions.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.text}
                      </option>
                    ))}
                  </Select>
                  {question?.type === 'numero' && (
                    <>
                      <Select aria-label="Operador" value={c.operator} onChange={(e) => patch(i, { operator: e.target.value as ConditionOperator })}>
                        {NUMBER_OPERATORS.map((op) => (
                          <option key={op} value={op}>
                            {OPERATOR_LABEL[op]}
                          </option>
                        ))}
                      </Select>
                      <div className="flex items-center gap-1.5">
                        <Input aria-label="Valor" inputMode="decimal" value={c.value} onChange={(e) => patch(i, { value: e.target.value })} />
                        {question.unit && <span className="text-[12px] text-muted">{question.unit}</span>}
                      </div>
                    </>
                  )}
                  {question?.type === 'sim_nao' && (
                    <Select aria-label="Resposta exigida" className="sm:col-span-2" value={c.value} onChange={(e) => patch(i, { value: e.target.value })}>
                      <option value="sim">Resposta deve ser: Sim</option>
                      <option value="nao">Resposta deve ser: Não</option>
                    </Select>
                  )}
                  {question?.type === 'opcoes' && (
                    <>
                      <Select aria-label="Operador" value={c.operator === 'neq' ? 'neq' : 'eq'} onChange={(e) => patch(i, { operator: e.target.value as ConditionOperator })}>
                        <option value="eq">é uma das opções</option>
                        <option value="neq">não é nenhuma das opções</option>
                      </Select>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {question.options.map((o) => {
                          const selected = c.value.split('|').includes(o.value)
                          return (
                            <label key={o.value} className="flex items-center gap-1.5 text-[12.5px]">
                              <input
                                type="checkbox"
                                checked={selected}
                                className="size-4 accent-[#0c6cf0]"
                                onChange={() => {
                                  const values = c.value.split('|').filter(Boolean)
                                  patch(i, { value: (selected ? values.filter((v) => v !== o.value) : [...values, o.value]).join('|') })
                                }}
                              />
                              {o.label}
                            </label>
                          )
                        })}
                      </div>
                    </>
                  )}
                  {c.questionId === LEGAL_TEXT && (
                    <span className="self-center text-[12px] text-muted sm:col-span-2">Na simulação, o usuário confirma se a condição é atendida.</span>
                  )}
                  {!question && c.questionId !== LEGAL_TEXT && <span className="self-center text-[12px] text-muted sm:col-span-2">Escolha a pergunta para definir a condição.</span>}
                  <Button variant="ghost" size="sm" aria-label={`Remover condição ${i + 1}`} icon={<X className="size-4" />} onClick={() => setConditions((list) => list.filter((_, index) => index !== i))} />
                  <Input
                    className="sm:col-span-4"
                    aria-label="Texto da condição na norma"
                    placeholder={c.questionId === LEGAL_TEXT ? 'Texto da condição exatamente como está na norma (obrigatório)' : 'Texto da condição como aparece na norma (opcional)'}
                    value={c.description}
                    onChange={(e) => patch(i, { description: e.target.value })}
                  />
                </li>
              )
            })}
          </ul>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="soft"
              icon={<Plus className="size-4" />}
              onClick={() => setConditions((list) => [...list, { questionId: '', operator: 'eq', value: '', description: '' }])}
            >
              Adicionar condição
            </Button>
            {questions.length === 0 && <span className="text-[12px] text-muted">Sem perguntas cadastradas: use “Texto da norma” ou cadastre perguntas na aba Perguntas.</span>}
          </div>
        </fieldset>

        {conditions.length > 0 && (
          <Field label="Se alguma condição NÃO for atendida" className="sm:col-span-6">
            {(p) => (
              <Select {...p} value={elseId} onChange={(e) => setElseId(e.target.value)}>
                <option value="">Avaliar a próxima regra do CNAE; se não houver, “Necessita análise”</option>
                {classifications.map((c) => (
                  <option key={c.id} value={c.id}>
                    Classificar como {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field label="Artigo" className="sm:col-span-2">{(p) => <Input {...p} value={article} onChange={(e) => setArticle(e.target.value)} placeholder="Art. …" />}</Field>
        {annexId ? null : (
          <Field label="Anexo (referência)" className="sm:col-span-2">
            {(p) => <Input {...p} value={annex} onChange={(e) => setAnnex(e.target.value)} placeholder="Anexo …" />}
          </Field>
        )}
        <Field label="Item" className="sm:col-span-2">{(p) => <Input {...p} value={item} onChange={(e) => setItem(e.target.value)} />}</Field>
        <Field label="Documento-fonte (biblioteca)" className="sm:col-span-4" hint={sourceDocumentId ? undefined : 'Sem documento vinculado, o resultado mostrará NECESSITA REVISÃO.'}>
          {(p) => (
            <Select {...p} value={sourceDocumentId} onChange={(e) => setSourceDocumentId(e.target.value)}>
              <option value="">Nenhum documento vinculado</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                  {d.edition ? ` — ${d.edition}` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Página" className="sm:col-span-2">
          {(p) => <Input {...p} type="number" min={1} value={sourcePage} onChange={(e) => setSourcePage(e.target.value)} disabled={!sourceDocumentId} />}
        </Field>
        <Field label="Observações da norma" className="sm:col-span-6">
          {(p) => <Textarea {...p} className="min-h-[52px]" value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
        <Field label="Resumo da regra" className="sm:col-span-6" hint="Aparece na fundamentação do resultado.">
          {(p) => <Textarea {...p} className="min-h-[60px]" value={summary} onChange={(e) => setSummary(e.target.value)} />}
        </Field>
        {error && (
          <p role="alert" className="text-[12.5px] text-danger-ink sm:col-span-6">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
