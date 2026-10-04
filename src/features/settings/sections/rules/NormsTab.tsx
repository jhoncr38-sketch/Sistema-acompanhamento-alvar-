import { Files, ListChecks, Pencil, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useDataSource } from '@/app/data-context'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/States'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { UF_NAMES, UFS } from '@/config/ufs'
import type { CatalogSnapshot, LegislationAnnexInput, LegislationInput, LegislationVersionInput } from '@/data/types'
import { addDays, todayISO } from '@/domain/dates'
import { formatDate } from '@/domain/format'
import { ANNEX_KIND_LABEL, LEGISLATION_KIND_LABEL, legislationLabel, LEVEL_LABEL, LICENSE_OUTCOME_OPTION_LABEL, localityLabel, RELATION_LABEL } from '@/domain/simulation/labels'
import type {
  AnnexKind,
  JurisdictionLevel,
  Legislation,
  LegislationAnnex,
  LegislationKind,
  LegislationRelation,
  LegislationVersion,
  LicenseOutcome,
  RuleBase,
} from '@/domain/simulation/types'
import { SITUATION_BADGE, useRuleAction, validityLabel, versionSituation } from './shared'

const NEW_LEGISLATION: LegislationInput = {
  kind: 'decreto',
  number: '',
  year: new Date().getFullYear(),
  title: '',
  issuingBody: '',
  level: 'municipal',
  uf: 'PI',
  city: 'Teresina',
  definesGeneralClassification: true,
  officialUrl: null,
  notes: null,
  active: true,
  normDate: null,
  parentLegislationId: null,
  relation: null,
}

export function NormsTab({ base, catalog, readOnly }: { base: RuleBase; catalog: CatalogSnapshot; readOnly: boolean }) {
  const [legislationDraft, setLegislationDraft] = useState<LegislationInput | null>(null)
  const [versionDraft, setVersionDraft] = useState<{ legislation: Legislation; version: LegislationVersionInput } | null>(null)
  const [effectsOf, setEffectsOf] = useState<{ legislation: Legislation; version: LegislationVersion } | null>(null)
  const [annexesOf, setAnnexesOf] = useState<Legislation | null>(null)
  const names = new Map(base.legislations.map((l) => [l.id, legislationLabel(l)]))
  const today = todayISO()
  const legislations = [...base.legislations].sort((a, b) => b.year - a.year || a.number.localeCompare(b.number))

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-[12.5px] text-muted">
          Cada norma tem uma ou mais versões, com início e fim de vigência. Quando a legislação muda, crie uma <strong>nova versão</strong>: a anterior é preservada e continua valendo para
          simulações com data de referência antiga.
        </p>
        {!readOnly && (
          <Button icon={<Plus className="size-4" />} onClick={() => setLegislationDraft(NEW_LEGISLATION)}>
            Adicionar legislação
          </Button>
        )}
      </div>

      {legislations.length === 0 ? (
        <EmptyState title="Nenhuma legislação cadastrada" description="Cadastre a norma (lei, decreto, resolução…), depois a versão com a vigência e, por fim, as regras por CNAE." />
      ) : (
        <ul className="flex flex-col gap-3">
          {legislations.map((legislation) => {
            const versions = base.versions.filter((v) => v.legislationId === legislation.id).sort((a, b) => b.validFrom.localeCompare(a.validFrom))
            return (
              <li key={legislation.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-ink">
                      {legislationLabel(legislation)}
                      {legislation.normDate && <span className="font-normal text-muted"> · {formatDate(legislation.normDate)}</span>}
                    </p>
                    <p className="text-[12.5px] text-ink-soft">{legislation.title}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge tone="neutral">{localityLabel(legislation)}</Badge>
                      {legislation.relation && legislation.parentLegislationId && (
                        <Badge tone="blue">
                          {RELATION_LABEL[legislation.relation]} o {names.get(legislation.parentLegislationId) ?? 'norma'}
                        </Badge>
                      )}
                      {base.annexes.some((a) => a.legislationId === legislation.id) && (
                        <Badge tone="neutral">
                          Anexos:{' '}
                          {base.annexes
                            .filter((a) => a.legislationId === legislation.id)
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map((a) => a.code)
                            .join(', ')}
                        </Badge>
                      )}
                      <Badge tone={legislation.definesGeneralClassification ? 'blue' : 'neutral'}>
                        {legislation.definesGeneralClassification ? 'Define o enquadramento geral' : 'Norma específica de órgão'}
                      </Badge>
                      {!legislation.active && <Badge tone="warn">Inativa</Badge>}
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setLegislationDraft(legislation)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Files className="size-3.5" />} onClick={() => setAnnexesOf(legislation)}>
                        Anexos
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Plus className="size-3.5" />}
                        onClick={() =>
                          setVersionDraft({
                            legislation,
                            version: {
                              legislationId: legislation.id,
                              label: versions.length === 0 ? 'Redação original' : '',
                              validFrom: today,
                              validTo: null,
                              highestRiskPrevails: versions[0]?.highestRiskPrevails ?? false,
                              sourceUrl: null,
                              notes: null,
                              active: true,
                              amendedByLegislationId: null,
                            },
                          })
                        }
                      >
                        Adicionar versão
                      </Button>
                    </div>
                  )}
                </div>

                {versions.length === 0 ? (
                  <p className="mt-2 text-[12.5px] text-warn-ink">
                    {legislation.relation === 'altera' || legislation.relation === 'revoga'
                      ? 'Norma modificadora: o conteúdo entra como nova versão da norma alterada (informando esta como norma modificadora).'
                      : 'Sem versão cadastrada: a norma ainda não é usada nas simulações (resultado “Regra não cadastrada”).'}
                  </p>
                ) : (
                  <TableFrame className="mt-2.5">
                    <Table className="text-[12.5px]">
                      <THead>
                        <tr className="h-[32px]">
                          <TH>Versão</TH>
                          <TH>Vigência</TH>
                          <TH>Situação</TH>
                          <TH>Vários CNAEs</TH>
                          <TH className="text-right">Regras</TH>
                          <TH />
                        </tr>
                      </THead>
                      <tbody>
                        {versions.map((version) => {
                          const situation = SITUATION_BADGE[versionSituation(version, legislation, today)]
                          return (
                            <TR key={version.id} className="h-[38px]">
                              <TD className="font-semibold text-ink">
                                {version.label}
                                {version.amendedByLegislationId && (
                                  <span className="block text-[11.5px] font-normal text-muted">Redação dada pelo {names.get(version.amendedByLegislationId)}</span>
                                )}
                              </TD>
                              <TD className="tabular whitespace-nowrap">{validityLabel(version)}</TD>
                              <TD>
                                <Badge tone={situation.tone}>{situation.label}</Badge>
                              </TD>
                              <TD>{version.highestRiskPrevails ? 'Maior risco prevalece' : 'Não definido'}</TD>
                              <TD className="tabular text-right">{base.cnaeRules.filter((r) => r.active && r.legislationVersionId === version.id).length}</TD>
                              <TD className="text-right whitespace-nowrap">
                                <Button size="xs" variant="ghost" icon={<ListChecks className="size-3.5" />} onClick={() => setEffectsOf({ legislation, version })}>
                                  Efeitos nas licenças
                                </Button>
                                {!readOnly && (
                                  <Button size="xs" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setVersionDraft({ legislation, version })}>
                                    Editar
                                  </Button>
                                )}
                              </TD>
                            </TR>
                          )
                        })}
                      </tbody>
                    </Table>
                  </TableFrame>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {legislationDraft && <LegislationModal key={legislationDraft.id ?? 'nova'} base={base} draft={legislationDraft} onClose={() => setLegislationDraft(null)} />}
      {annexesOf && <AnnexesModal key={annexesOf.id} base={base} legislation={annexesOf} readOnly={readOnly} onClose={() => setAnnexesOf(null)} />}
      {versionDraft && (
        <VersionModal
          key={versionDraft.version.id ?? `nova-${versionDraft.legislation.id}`}
          base={base}
          legislation={versionDraft.legislation}
          draft={versionDraft.version}
          onClose={() => setVersionDraft(null)}
        />
      )}
      {effectsOf && (
        <LicenseEffectsModal key={effectsOf.version.id} base={base} catalog={catalog} legislation={effectsOf.legislation} version={effectsOf.version} readOnly={readOnly} onClose={() => setEffectsOf(null)} />
      )}
    </div>
  )
}

function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-[13px] text-ink sm:col-span-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[#0c6cf0]" />
      <span>
        {label}
        {hint && <span className="block text-[11.5px] text-muted">{hint}</span>}
      </span>
    </label>
  )
}

function LegislationModal({ base, draft, onClose }: { base: RuleBase; draft: LegislationInput; onClose: () => void }) {
  const ds = useDataSource()
  const act = useRuleAction()
  const [form, setForm] = useState(draft)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof LegislationInput>(key: K, value: LegislationInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form.number.trim() || !form.title.trim() || !form.year) return setError('Informe número, ano e título da norma.')
    if (form.level === 'municipal' && !form.city?.trim()) return setError('Informe o município.')
    if (!!form.parentLegislationId !== !!form.relation) return setError('Informe a norma relacionada e o tipo de relação juntos.')
    setSaving(true)
    const ok = await act(() => ds.simulation.saveLegislation(form), draft.id ? 'Norma atualizada' : 'Norma cadastrada')
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={draft.id ? 'Editar legislação' : 'Adicionar legislação'}
      description="Cadastre a norma exatamente como publicada. As regras por CNAE entram depois, numa versão."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="legislation-form" loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="legislation-form" onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
        <Field label="Tipo" required>
          {(p) => (
            <Select {...p} value={form.kind} onChange={(e) => set('kind', e.target.value as LegislationKind)}>
              {Object.entries(LEGISLATION_KIND_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Número" required>
            {(p) => <Input {...p} value={form.number} onChange={(e) => set('number', e.target.value)} />}
          </Field>
          <Field label="Ano" required>
            {(p) => <Input {...p} type="number" min={1900} max={2200} value={form.year || ''} onChange={(e) => set('year', Number(e.target.value))} />}
          </Field>
        </div>
        <Field label="Data da norma" hint="Data de publicação/assinatura, conforme o documento oficial.">
          {(p) => <Input {...p} type="date" value={form.normDate ?? ''} onChange={(e) => set('normDate', e.target.value || null)} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Relação">
            {(p) => (
              <Select {...p} value={form.relation ?? ''} onChange={(e) => set('relation', (e.target.value || null) as LegislationRelation | null)}>
                <option value="">Nenhuma</option>
                {Object.entries(RELATION_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Norma relacionada">
            {(p) => (
              <Select {...p} value={form.parentLegislationId ?? ''} onChange={(e) => set('parentLegislationId', e.target.value || null)}>
                <option value="">—</option>
                {base.legislations
                  .filter((l) => l.id !== draft.id)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {legislationLabel(l)}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Título / ementa" required className="sm:col-span-2">
          {(p) => <Input {...p} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Dispõe sobre a classificação de risco das atividades econômicas" />}
        </Field>
        <Field label="Órgão emissor">{(p) => <Input {...p} value={form.issuingBody} onChange={(e) => set('issuingBody', e.target.value)} placeholder="Ex.: Prefeitura Municipal" />}</Field>
        <Field label="Esfera" required>
          {(p) => (
            <Select {...p} value={form.level} onChange={(e) => set('level', e.target.value as JurisdictionLevel)}>
              {Object.entries(LEVEL_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {form.level !== 'federal' && (
          <Field label="UF" required>
            {(p) => (
              <Select {...p} value={form.uf ?? 'PI'} onChange={(e) => set('uf', e.target.value)}>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {UF_NAMES[uf]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {form.level === 'municipal' && (
          <Field label="Município" required>
            {(p) => <Input {...p} value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} />}
          </Field>
        )}
        <Field label="Fonte oficial (link)" className="sm:col-span-2">
          {(p) => <Input {...p} type="url" value={form.officialUrl ?? ''} onChange={(e) => set('officialUrl', e.target.value.trim() || null)} placeholder="https://…" />}
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          {(p) => <Textarea {...p} className="min-h-[60px]" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} />}
        </Field>
        <Check
          label="Define o enquadramento geral da atividade"
          hint="Marcada: a classificação desta norma aparece como resultado principal da simulação. Desmarcada: norma de um órgão específico, que só afeta as licenças que ela regula."
          checked={form.definesGeneralClassification}
          onChange={(v) => set('definesGeneralClassification', v)}
        />
        <Check label="Norma ativa" hint="Normas inativas são ignoradas nas simulações. Nada é excluído." checked={form.active} onChange={(v) => set('active', v)} />
        {error && (
          <p role="alert" className="text-[12.5px] text-danger-ink sm:col-span-2">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

function VersionModal({ base, legislation, draft, onClose }: { base: RuleBase; legislation: Legislation; draft: LegislationVersionInput; onClose: () => void }) {
  const ds = useDataSource()
  const act = useRuleAction()
  const isNew = !draft.id
  const previous = isNew
    ? base.versions.filter((v) => v.legislationId === legislation.id && v.active).sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0]
    : undefined
  const [form, setForm] = useState(draft)
  const [closePrevious, setClosePrevious] = useState(!!previous && previous.validTo === null)
  const [copyRules, setCopyRules] = useState(!!previous)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof LegislationVersionInput>(key: K, value: LegislationVersionInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form.label.trim() || !form.validFrom) return setError('Informe a identificação da versão e o início da vigência.')
    if (form.validTo && form.validTo < form.validFrom) return setError('O fim da vigência não pode ser anterior ao início.')
    setSaving(true)
    const ok = await act(
      () =>
        ds.simulation.saveVersion(form, {
          closePreviousVersionId: previous && closePrevious ? previous.id : null,
          copyRulesFromVersionId: previous && copyRules ? previous.id : null,
        }),
      isNew ? 'Versão cadastrada' : 'Versão atualizada',
    )
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Adicionar versão' : 'Editar versão'}
      description={legislationLabel(legislation)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="version-form" loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="version-form" onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
        <Field label="Identificação da versão" required className="sm:col-span-2" hint='Ex.: "Redação original", "Alterada pelo Decreto nº …"'>
          {(p) => <Input {...p} value={form.label} onChange={(e) => set('label', e.target.value)} />}
        </Field>
        <Field label="Início da vigência" required>
          {(p) => <Input {...p} type="date" value={form.validFrom} onChange={(e) => set('validFrom', e.target.value)} />}
        </Field>
        <Field label="Fim da vigência" hint="Em branco = vigente até hoje.">
          {(p) => <Input {...p} type="date" value={form.validTo ?? ''} min={form.validFrom} onChange={(e) => set('validTo', e.target.value || null)} />}
        </Field>
        <Field label="Norma modificadora (redação dada por)" className="sm:col-span-2" hint="Decreto ou lei que deu esta redação. Em branco = redação original.">
          {(p) => (
            <Select {...p} value={form.amendedByLegislationId ?? ''} onChange={(e) => set('amendedByLegislationId', e.target.value || null)}>
              <option value="">Nenhuma (redação original)</option>
              {base.legislations
                .filter((l) => l.id !== legislation.id)
                .sort((a, b) => Number(b.parentLegislationId === legislation.id) - Number(a.parentLegislationId === legislation.id) || b.year - a.year)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {legislationLabel(l)}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Fonte oficial desta versão (link)" className="sm:col-span-2">
          {(p) => <Input {...p} type="url" value={form.sourceUrl ?? ''} onChange={(e) => set('sourceUrl', e.target.value.trim() || null)} placeholder="https://…" />}
        </Field>
        <Check
          label="A atividade de maior risco define o enquadramento geral"
          hint="Marque somente se a norma determinar isso. Desmarcada, CNAEs com classificações diferentes resultam em “Necessita análise”."
          checked={form.highestRiskPrevails}
          onChange={(v) => set('highestRiskPrevails', v)}
        />
        {previous && form.validFrom && (
          <>
            <Check
              label={`Encerrar a versão anterior (“${previous.label}”) em ${formatDate(addDays(form.validFrom, -1))}`}
              hint="A versão anterior é preservada e continua valendo para datas de referência dentro da vigência dela."
              checked={closePrevious}
              onChange={setClosePrevious}
            />
            <Check label="Copiar as regras e os efeitos nas licenças da versão anterior" hint="Depois, altere só o que mudou na nova redação." checked={copyRules} onChange={setCopyRules} />
          </>
        )}
        <Check label="Versão ativa" hint="Versões inativas são ignoradas nas simulações. Nada é excluído." checked={form.active} onChange={(v) => set('active', v)} />
        {error && (
          <p role="alert" className="text-[12.5px] text-danger-ink sm:col-span-2">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

const NEW_ANNEX = (legislationId: string, sortOrder: number): LegislationAnnexInput => ({
  legislationId,
  code: '',
  title: '',
  kind: 'outro',
  description: null,
  sortOrder,
  active: true,
})

/** Anexos da norma (ex.: Anexo I — classificações, Anexo II — Baixo Risco A, Anexo III — CBO). */
function AnnexesModal({ base, legislation, readOnly, onClose }: { base: RuleBase; legislation: Legislation; readOnly: boolean; onClose: () => void }) {
  const ds = useDataSource()
  const act = useRuleAction()
  const annexes = base.annexes.filter((a) => a.legislationId === legislation.id).sort((a, b) => a.sortOrder - b.sortOrder)
  const [form, setForm] = useState<LegislationAnnexInput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof LegislationAnnexInput>(key: K, value: LegislationAnnexInput[K]) => setForm((f) => (f ? { ...f, [key]: value } : f))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    if (!form.code.trim() || !form.title.trim()) return setError('Informe o código e o título do anexo.')
    setSaving(true)
    const ok = await act(() => ds.simulation.saveAnnex(form), form.id ? 'Anexo atualizado' : 'Anexo cadastrado')
    setSaving(false)
    if (ok) {
      setForm(null)
      setError(null)
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title="Anexos da norma" description={legislationLabel(legislation)} footer={<Button onClick={onClose}>Concluir</Button>}>
      {annexes.length === 0 ? (
        <p className="text-[12.5px] text-muted">Nenhum anexo cadastrado.</p>
      ) : (
        <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
          {annexes.map((annex: LegislationAnnex) => (
            <li key={annex.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink">
                  Anexo {annex.code} — {annex.title}
                  {!annex.active && <Badge tone="warn" className="ml-2">Inativo</Badge>}
                </p>
                <p className="text-[11.5px] text-muted">{ANNEX_KIND_LABEL[annex.kind]}</p>
              </div>
              {!readOnly && (
                <Button size="xs" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setForm(annex)}>
                  Editar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && !form && (
        <Button className="mt-3" size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => setForm(NEW_ANNEX(legislation.id, annexes.length + 1))}>
          Adicionar anexo
        </Button>
      )}
      {form && (
        <form onSubmit={submit} className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-line p-3 sm:grid-cols-4" noValidate>
          <Field label="Código" required hint="Ex.: I, II, III">
            {(p) => <Input {...p} value={form.code} onChange={(e) => set('code', e.target.value)} />}
          </Field>
          <Field label="Título" required className="sm:col-span-3">
            {(p) => <Input {...p} value={form.title} onChange={(e) => set('title', e.target.value)} />}
          </Field>
          <Field label="Conteúdo" className="sm:col-span-2">
            {(p) => (
              <Select {...p} value={form.kind} onChange={(e) => set('kind', e.target.value as AnnexKind)}>
                {Object.entries(ANNEX_KIND_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Ordem">
            {(p) => <Input {...p} type="number" min={0} value={form.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value) || 0)} />}
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink">
            <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="size-4 accent-[#0c6cf0]" /> Ativo
          </label>
          <Field label="Descrição" className="sm:col-span-4">
            {(p) => <Textarea {...p} className="min-h-[52px]" value={form.description ?? ''} onChange={(e) => set('description', e.target.value || null)} />}
          </Field>
          {error && (
            <p role="alert" className="text-[12.5px] text-danger-ink sm:col-span-4">
              {error}
            </p>
          )}
          <div className="flex gap-2 sm:col-span-4">
            <Button type="submit" size="sm" loading={saving}>
              Salvar anexo
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setForm(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

/** Efeito de cada classificação sobre cada licença, conforme a norma. Sem efeito definido, a licença fica "Regra não cadastrada". */
function LicenseEffectsModal({
  base,
  catalog,
  legislation,
  version,
  readOnly,
  onClose,
}: {
  base: RuleBase
  catalog: CatalogSnapshot
  legislation: Legislation
  version: LegislationVersion
  readOnly: boolean
  onClose: () => void
}) {
  const ds = useDataSource()
  const act = useRuleAction()
  const classifications = base.classifications.filter((c) => c.active).sort((a, b) => a.severity - b.severity)
  const licenseTypes = catalog.licenseTypes.filter((t) => t.active).sort((a, b) => a.sortOrder - b.sortOrder)
  const current = new Map(base.licenseRules.filter((r) => r.active && r.legislationVersionId === version.id).map((r) => [`${r.licenseTypeId}:${r.classificationId}`, r.outcome]))

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Efeitos nas licenças"
      description={`${legislationLabel(legislation)} — ${version.label}`}
      footer={<Button onClick={onClose}>Concluir</Button>}
    >
      <p className="mb-3 text-[12.5px] text-ink-soft">
        Informe o que <strong>esta norma</strong> determina para cada licença em cada classificação. Deixe “—” nas licenças de que a norma não trata: a simulação mostrará “Regra não cadastrada”
        para elas, sem presumir dispensa. As alterações são salvas na hora.
      </p>
      <TableFrame>
        <Table className="text-[12.5px]">
          <THead>
            <tr className="h-[34px]">
              <TH>Licença / órgão</TH>
              {classifications.map((c) => (
                <TH key={c.id}>{c.name}</TH>
              ))}
            </tr>
          </THead>
          <tbody>
            {licenseTypes.map((type) => (
              <TR key={type.id} className="h-[40px]">
                <TD>
                  <p className="font-semibold text-ink">{type.name}</p>
                  <p className="text-[11.5px] text-muted">{type.agency}</p>
                </TD>
                {classifications.map((c) => (
                  <TD key={c.id}>
                    <Select
                      aria-label={`${type.name} — ${c.name}`}
                      className="h-[30px] w-[168px] text-[12.5px]"
                      disabled={readOnly}
                      value={current.get(`${type.id}:${c.id}`) ?? ''}
                      onChange={(e) =>
                        act(() =>
                          ds.simulation.saveLicenseRule({
                            legislationVersionId: version.id,
                            classificationId: c.id,
                            licenseTypeId: type.id,
                            outcome: (e.target.value || null) as LicenseOutcome | null,
                          }),
                        )
                      }
                    >
                      <option value="">—</option>
                      {Object.entries(LICENSE_OUTCOME_OPTION_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </TD>
                ))}
              </TR>
            ))}
          </tbody>
        </Table>
      </TableFrame>
      <p className="mt-3 text-[11.5px] text-muted">Novas licenças e órgãos são cadastrados em Configurações › Tipos de licença.</p>
    </Modal>
  )
}
