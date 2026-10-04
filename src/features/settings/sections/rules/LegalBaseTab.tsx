import { Eye, FileClock, Landmark, Search } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/States'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import type { CatalogSnapshot } from '@/data/types'
import { todayISO } from '@/domain/dates'
import { formatCnae, formatDate, normalizeCnae } from '@/domain/format'
import {
  amendmentsOf,
  annexContent,
  legalLocalities,
  lookupCnae,
  RULE_STATUS_LABEL,
  VERSION_STATUS_LABEL,
  versionChain,
  versionChanges,
  versionLegalStatus,
  type BaixoRiscoAStatus,
  type CnaeLegalEntry,
  type RuleLegalStatus,
  type VersionLegalStatus,
} from '@/domain/simulation/legal-base'
import { legislationLabel, RELATION_LABEL } from '@/domain/simulation/labels'
import type { CnaeRule, Legislation, LegislationAnnex, LegislationVersion, RuleBase } from '@/domain/simulation/types'
import { ruleConditionsText, validityLabel } from './shared'

type BadgeTone = 'ok' | 'warn' | 'danger' | 'neutral' | 'blue'

const VERSION_TONE: Record<VersionLegalStatus, BadgeTone> = { vigente: 'ok', substituida: 'neutral', futura: 'blue', encerrada: 'neutral', inativa: 'warn' }
const RULE_TONE: Record<RuleLegalStatus, BadgeTone> = { vigente: 'ok', alterada: 'blue', revogada: 'danger', futura: 'blue', encerrada: 'neutral' }
const BRA_LABEL: Record<BaixoRiscoAStatus, string> = { sim: 'Sim', condicionado: 'Sim, condicionado', nao_consta: 'Não consta' }

/** Situação exibida para o administrador: inclui a norma cadastrada que ainda não tem conteúdo. */
function NormStatus({ base, legislation, date }: { base: RuleBase; legislation: Legislation; date: string }) {
  const chain = versionChain(base, legislation.id)
  if (!legislation.active) return <Badge tone="warn">Inativa</Badge>
  if (chain.length === 0) {
    const hasDocument = base.documents.some((d) => d.legislationId === legislation.id && d.active)
    return <Badge tone="warn">{hasDocument ? 'Documento na biblioteca — aguardando importação' : 'Aguardando o documento oficial'}</Badge>
  }
  const inForce = chain.find((v) => versionLegalStatus(v, base.versions, date) === 'vigente')
  return inForce ? <Badge tone="ok">Vigente</Badge> : <Badge tone="neutral">Sem versão vigente na data</Badge>
}

function RulesTable({ base, catalog, rules, empty }: { base: RuleBase; catalog: CatalogSnapshot; rules: CnaeRule[]; empty: string }) {
  const classification = new Map(base.classifications.map((c) => [c.id, c.name]))
  const licenseName = new Map(catalog.licenseTypes.map((t) => [t.id, t.name]))
  const cnaeName = new Map(catalog.cnaes.map((c) => [normalizeCnae(c.code), c.description]))
  if (rules.length === 0) return <p className="rounded-lg bg-[#f6f8fb] px-3 py-2.5 text-[12.5px] text-muted">{empty}</p>
  return (
    <TableFrame>
      <Table className="min-w-[860px] text-[12px]">
        <THead>
          <tr className="h-[30px]">
            <TH>CNAE / CBO</TH>
            <TH>Descrição</TH>
            <TH>Área</TH>
            <TH>Classificação</TH>
            <TH>Condição</TH>
            <TH>Se não atender</TH>
            <TH>Artigo / item</TH>
            <TH>Observações</TH>
          </tr>
        </THead>
        <tbody>
          {rules.map((rule) => (
            <TR key={rule.id} className="align-top">
              <TD className="tabular py-1.5 whitespace-nowrap">{rule.cboCode ? `CBO ${rule.cboCode}` : rule.cnaeCode ? formatCnae(rule.cnaeCode) : 'Padrão da norma'}</TD>
              <TD className="py-1.5">{rule.cnaeCode ? (cnaeName.get(rule.cnaeCode) ?? '—') : rule.description || '—'}</TD>
              <TD className="py-1.5">{rule.licenseTypeId ? (licenseName.get(rule.licenseTypeId) ?? 'Licença') : 'Enquadramento geral'}</TD>
              <TD className="py-1.5 font-semibold">{classification.get(rule.classificationId) ?? '—'}</TD>
              <TD className="py-1.5">
                {rule.conditions.length > 0 ? (
                  <ul className="space-y-0.5">
                    {ruleConditionsText(rule, base.questions).map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted">Sem condições</span>
                )}
              </TD>
              <TD className="py-1.5">{rule.elseClassificationId ? classification.get(rule.elseClassificationId) : rule.conditions.length > 0 ? 'Próxima regra' : '—'}</TD>
              <TD className="py-1.5">{[rule.article, rule.item].filter(Boolean).join(' · ') || '—'}</TD>
              <TD className="py-1.5">{rule.notes ?? '—'}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </TableFrame>
  )
}

function AnnexModal({ base, catalog, annex, legislation, date, onClose }: { base: RuleBase; catalog: CatalogSnapshot; annex: LegislationAnnex; legislation: Legislation; date: string; onClose: () => void }) {
  const { version, rules } = annexContent(base, annex, date)
  return (
    <Modal open onClose={onClose} size="xl" title={`Anexo ${annex.code} — ${annex.title}`} description={`${legislationLabel(legislation)} · conteúdo vigente em ${formatDate(date)}`}>
      {version ? (
        <p className="mb-2 text-[12.5px] text-ink-soft">
          Versão: <strong className="text-ink">{version.label}</strong> ({validityLabel(version)}). {rules.length} {rules.length === 1 ? 'regra' : 'regras'} neste anexo.
        </p>
      ) : null}
      <RulesTable
        base={base}
        catalog={catalog}
        rules={rules}
        empty={
          version
            ? 'Nenhuma regra deste anexo cadastrada na versão vigente. Para CNAEs fora da base, o simulador mostra REGRA NÃO CADASTRADA.'
            : 'Conteúdo do anexo ainda não cadastrado — aguardando a importação a partir do documento oficial. Enquanto isso, o simulador mostra REGRA NÃO CADASTRADA.'
        }
      />
    </Modal>
  )
}

function AmendmentModal({ base, catalog, amendment, parent, onClose }: { base: RuleBase; catalog: CatalogSnapshot; amendment: Legislation; parent: Legislation; onClose: () => void }) {
  const versions = base.versions.filter((v) => v.legislationId === parent.id && v.amendedByLegislationId === amendment.id).sort((a, b) => a.validFrom.localeCompare(b.validFrom))
  const classification = new Map(base.classifications.map((c) => [c.id, c.name]))
  const licenseName = new Map(catalog.licenseTypes.map((t) => [t.id, t.name]))
  const annexLabel = new Map(base.annexes.map((a) => [a.id, `Anexo ${a.code}`]))
  const summary = (rules: CnaeRule[]) => (rules.length === 0 ? '—' : rules.map((r) => `${classification.get(r.classificationId) ?? '—'}${r.conditions.length > 0 ? ' (com condição)' : ''}`).join('; '))
  const STATUS = { incluida: { label: 'Incluída', tone: 'ok' }, alterada: { label: 'Alterada', tone: 'blue' }, revogada: { label: 'Revogada', tone: 'danger' } } as const
  return (
    <Modal open onClose={onClose} size="xl" title={`Alterações — ${legislationLabel(amendment)}`} description={`${RELATION_LABEL[amendment.relation ?? 'altera']} o ${legislationLabel(parent)}`}>
      {versions.length === 0 ? (
        <p className="rounded-lg bg-[#f6f8fb] px-3 py-2.5 text-[12.5px] text-muted">
          Conteúdo da alteração ainda não cadastrado. Ao importar o documento oficial, crie a nova versão do {legislationLabel(parent)} informando este decreto como norma modificadora: a
          versão anterior é preservada.
        </p>
      ) : (
        <div className="space-y-4">
          {versions.map((version) => {
            const { previous, changes } = versionChanges(base, version.id)
            return (
              <section key={version.id}>
                <p className="mb-1.5 text-[12.5px] text-ink-soft">
                  <strong className="text-ink">{version.label}</strong> ({validityLabel(version)}) — comparada com {previous ? `${previous.label} (${validityLabel(previous)})` : 'nenhuma versão anterior'}.
                </p>
                {changes.length === 0 ? (
                  <p className="text-[12.5px] text-muted">Nenhuma regra mudou em relação à versão anterior.</p>
                ) : (
                  <TableFrame>
                    <Table className="min-w-[720px] text-[12px]">
                      <THead>
                        <tr className="h-[30px]">
                          <TH>Situação</TH>
                          <TH>CNAE / CBO</TH>
                          <TH>Anexo</TH>
                          <TH>Área</TH>
                          <TH>Antes</TH>
                          <TH>Depois</TH>
                        </tr>
                      </THead>
                      <tbody>
                        {changes.map((c) => (
                          <TR key={c.key} className="align-top">
                            <TD className="py-1.5">
                              <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                            </TD>
                            <TD className="tabular py-1.5 whitespace-nowrap">{c.isCbo ? `CBO ${c.activity}` : c.activity ? formatCnae(c.activity) : 'Padrão da norma'}</TD>
                            <TD className="py-1.5">{c.annexId ? (annexLabel.get(c.annexId) ?? '—') : '—'}</TD>
                            <TD className="py-1.5">{c.licenseTypeId ? (licenseName.get(c.licenseTypeId) ?? 'Licença') : 'Enquadramento geral'}</TD>
                            <TD className="py-1.5">{summary(c.before)}</TD>
                            <TD className="py-1.5">{summary(c.after)}</TD>
                          </TR>
                        ))}
                      </tbody>
                    </Table>
                  </TableFrame>
                )}
              </section>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

function NormBlock({
  base,
  legislation,
  date,
  onAnnex,
  onAmendment,
}: {
  base: RuleBase
  legislation: Legislation
  date: string
  onAnnex: (annex: LegislationAnnex) => void
  onAmendment: (amendment: Legislation) => void
}) {
  const chain = versionChain(base, legislation.id)
  const annexes = base.annexes.filter((a) => a.legislationId === legislation.id && a.active).sort((a, b) => a.sortOrder - b.sortOrder)
  const amendments = amendmentsOf(base, legislation.id)
  const names = new Map(base.legislations.map((l) => [l.id, legislationLabel(l)]))
  const ruleCount = (annex: LegislationAnnex) => annexContent(base, annex, date).rules.length
  return (
    <li className="rounded-xl border border-line p-3.5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-ink">
            {legislationLabel(legislation)}
            {legislation.normDate && <span className="font-normal text-muted"> · {formatDate(legislation.normDate)}</span>}
          </p>
          <p className="text-[12.5px] text-ink-soft">{legislation.title}</p>
        </div>
        <NormStatus base={base} legislation={legislation} date={date} />
      </div>
      {legislation.notes && <p className="mt-1 text-[11.5px] text-muted">{legislation.notes}</p>}

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Anexos</p>
          {annexes.length === 0 ? (
            <p className="text-[12px] text-muted">Nenhum anexo cadastrado.</p>
          ) : (
            <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
              {annexes.map((annex) => {
                const n = ruleCount(annex)
                return (
                  <li key={annex.id} className="flex items-center gap-2 px-2.5 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold text-ink">
                        Anexo {annex.code} — {annex.title}
                      </p>
                      <p className="text-[11.5px] text-muted">{n > 0 ? `${n} ${n === 1 ? 'regra vigente' : 'regras vigentes'} na data` : 'Conteúdo não cadastrado'}</p>
                    </div>
                    <Button variant="secondary" size="xs" icon={<Eye className="size-3.5" />} onClick={() => onAnnex(annex)}>
                      Visualizar
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Versões (histórico)</p>
          {chain.length === 0 ? (
            <p className="text-[12px] text-muted">Nenhuma versão publicada: a vigência e o conteúdo entram pela importação revisada do documento oficial (aba Importar legislação).</p>
          ) : (
            <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
              {chain.map((version: LegislationVersion) => {
                const status = versionLegalStatus(version, base.versions, date)
                return (
                  <li key={version.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2.5 py-1.5 text-[12px]">
                    <Badge tone={VERSION_TONE[status]} className="h-[18px] text-[10.5px] uppercase">
                      {VERSION_STATUS_LABEL[status]}
                    </Badge>
                    <span className="font-semibold text-ink">{version.label}</span>
                    <span className="text-muted">{validityLabel(version)}</span>
                    {version.amendedByLegislationId && <span className="w-full text-[11.5px] text-muted">Redação dada pelo {names.get(version.amendedByLegislationId)}</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {amendments.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Normas que alteram</p>
          <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
            {amendments.map(({ legislation: amendment, versions }) => (
              <li key={amendment.id} className="flex flex-wrap items-center gap-2 px-2.5 py-1.5">
                <Badge tone="blue" className="h-[18px] text-[10.5px] uppercase">
                  {RELATION_LABEL[amendment.relation ?? 'altera']}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-ink">
                    {legislationLabel(amendment)}
                    {amendment.normDate && <span className="font-normal text-muted"> · {formatDate(amendment.normDate)}</span>}
                  </p>
                  <p className="text-[11.5px] text-muted">{versions.length > 0 ? `Redação usada em ${versions.length} ${versions.length === 1 ? 'versão' : 'versões'}` : 'Conteúdo da alteração não cadastrado'}</p>
                </div>
                <Button variant="secondary" size="xs" icon={<FileClock className="size-3.5" />} onClick={() => onAmendment(amendment)}>
                  Visualizar alterações
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

function areaSummary(entry: CnaeLegalEntry, licenseTypeId: string | undefined, base: RuleBase): string {
  if (!licenseTypeId) return 'Não cadastrado'
  const rules = entry.areaRules.filter((r) => r.licenseTypeId === licenseTypeId)
  if (rules.length === 0) return 'Não cadastrado'
  const name = new Map(base.classifications.map((c) => [c.id, c.name]))
  return rules.map((r) => `${name.get(r.classificationId) ?? '—'}${r.conditions.length > 0 ? ' (com condição)' : ''}`).join('; ')
}

function CnaeLookup({ base, catalog, locality, date }: { base: RuleBase; catalog: CatalogSnapshot; locality: { uf: string; city: string; label: string } | null; date: string }) {
  const [text, setText] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const entries = useMemo(() => (code && locality ? lookupCnae(base, code, locality, date) : []), [base, code, locality, date])
  const classification = new Map(base.classifications.map((c) => [c.id, c.name]))
  const annexLabel = new Map(base.annexes.map((a) => [a.id, `Anexo ${a.code}`]))
  const licenseId = (code: string) => catalog.licenseTypes.find((t) => t.code === code)?.id
  const description = code ? catalog.cnaes.find((c) => normalizeCnae(c.code) === code)?.description : undefined
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const digits = normalizeCnae(text)
    setCode(digits.length === 7 ? digits : null)
  }
  const invalid = text.trim() !== '' && normalizeCnae(text).length !== 7

  return (
    <section className="rounded-xl border border-line p-3.5" aria-label="Pesquisar CNAE">
      <h4 className="flex items-center gap-2 text-[14px] font-bold text-ink">
        <Search className="size-4 text-primary" aria-hidden /> Pesquisar CNAE
      </h4>
      <p className="mb-2 text-[12px] text-muted">O que a base legal de {locality?.label ?? 'cada localidade'} diz sobre o CNAE em {formatDate(date)}.</p>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2" noValidate>
        <Field label="CNAE (7 dígitos)" error={invalid ? 'Informe os 7 dígitos do CNAE.' : undefined} className="w-56">
          {(p) => <Input {...p} value={text} onChange={(e) => setText(e.target.value)} placeholder="0000-0/00" inputMode="numeric" />}
        </Field>
        <Button type="submit" icon={<Search className="size-4" />} disabled={!locality}>
          Pesquisar
        </Button>
      </form>

      {code && (
        <div className="mt-3">
          {entries.length === 0 ? (
            <p className="rounded-lg border border-line-soft bg-[#f6f8fb] px-3 py-2.5 text-[12.5px] text-ink-soft">
              <strong className="text-ink">{formatCnae(code)}</strong>
              {description ? ` — ${description}` : ''}: <strong>REGRA NÃO CADASTRADA</strong> na base legal de {locality?.label}. A ausência de regra não significa dispensa.
            </p>
          ) : (
            <div className="space-y-3">
              <TableFrame>
                <Table className="min-w-[1100px] text-[12px]">
                  <THead>
                    <tr className="h-[30px]">
                      <TH>CNAE</TH>
                      <TH>Descrição</TH>
                      <TH>Anexo</TH>
                      <TH>Classificação</TH>
                      <TH>Risco sanitário</TH>
                      <TH>Risco ambiental</TH>
                      <TH>Baixo Risco A</TH>
                      <TH>Condições</TH>
                      <TH>Norma vigente</TH>
                      <TH>Última atualização</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {entries.map((entry) => (
                      <TR key={entry.legislation.id} className="align-top">
                        <TD className="tabular py-1.5 whitespace-nowrap">{formatCnae(code)}</TD>
                        <TD className="py-1.5">{description ?? '—'}</TD>
                        <TD className="py-1.5">{entry.annexIds.map((id) => annexLabel.get(id)).filter(Boolean).join(', ') || '—'}</TD>
                        <TD className="py-1.5 font-semibold">
                          {entry.generalRules.length > 0 ? entry.generalRules.map((r) => classification.get(r.classificationId)).join(' → ') : <span className="font-normal text-muted">Não consta</span>}
                        </TD>
                        <TD className="py-1.5">{areaSummary(entry, licenseId('vigilancia'), base)}</TD>
                        <TD className="py-1.5">{areaSummary(entry, licenseId('ambiental'), base)}</TD>
                        <TD className="py-1.5">{BRA_LABEL[entry.baixoRiscoA]}</TD>
                        <TD className="py-1.5">
                          {[...entry.generalRules, ...entry.areaRules].some((r) => r.conditions.length > 0) ? (
                            <ul className="space-y-0.5">
                              {[...new Set([...entry.generalRules, ...entry.areaRules].flatMap((r) => ruleConditionsText(r, base.questions)))].map((t) => (
                                <li key={t}>{t}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-muted">Sem condições</span>
                          )}
                        </TD>
                        <TD className="py-1.5">
                          {legislationLabel(entry.legislation)}
                          {entry.version && <p className="text-[11px] text-muted">{entry.version.label}</p>}
                          {entry.amendedBy && <p className="text-[11px] text-muted">Redação dada pelo {entry.amendedBy}</p>}
                          {!entry.version && <p className="text-[11px] text-warn-ink">Sem versão vigente na data</p>}
                        </TD>
                        <TD className="py-1.5 whitespace-nowrap">{entry.lastUpdate ? formatDate(entry.lastUpdate) : '—'}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableFrame>
              {entries.map((entry) =>
                entry.history.length > 0 ? (
                  <div key={`h-${entry.legislation.id}`}>
                    <p className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Histórico legal — {legislationLabel(entry.legislation)}</p>
                    <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
                      {entry.history.map((h) => (
                        <li key={`${h.validFrom}-${h.status}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2.5 py-1.5 text-[12px]">
                          <Badge tone={RULE_TONE[h.status]} className="h-[18px] text-[10.5px] uppercase">
                            {RULE_STATUS_LABEL[h.status]}
                          </Badge>
                          <span className="text-ink">{validityLabel(h)}</span>
                          <span className="text-ink-soft">
                            {h.rules
                              .filter((r) => r.licenseTypeId === null)
                              .map((r) => classification.get(r.classificationId))
                              .join(' → ') || 'Somente classificação de área'}
                          </span>
                          {h.amendedBy && <span className="text-[11.5px] text-muted">· redação dada pelo {h.amendedBy}</span>}
                          {h.changedBy && <span className="text-[11.5px] text-muted">· {h.status === 'revogada' ? 'revogada' : 'alterada'} pelo {h.changedBy}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * Base Legal: a legislação cadastrada por município, com anexos, versões (histórico) e as normas que a
 * alteram. Somente leitura — o conteúdo entra pela aba Importar (com revisão) ou pelo cadastro manual.
 */
export function LegalBaseTab({ base, catalog }: { base: RuleBase; catalog: CatalogSnapshot }) {
  const localities = legalLocalities(base)
  const [key, setKey] = useState(() => {
    const teresina = localities.find((l) => l.city === 'Teresina')
    return teresina ? teresina.label : (localities[0]?.label ?? '')
  })
  const [date, setDate] = useState(todayISO())
  const [annex, setAnnex] = useState<LegislationAnnex | null>(null)
  const [amendment, setAmendment] = useState<Legislation | null>(null)
  const current = localities.find((l) => l.label === key) ?? localities[0] ?? null
  const ids = new Set(current?.legislations.map((l) => l.id))
  // Normas modificadoras aparecem dentro da norma que alteram (quando ela está na mesma localidade).
  const roots = (current?.legislations ?? [])
    .filter((l) => !(l.parentLegislationId && ids.has(l.parentLegislationId) && (l.relation === 'altera' || l.relation === 'revoga' || l.relation === 'consolida')))
    .sort((a, b) => (a.normDate ?? `${a.year}`).localeCompare(b.normDate ?? `${b.year}`))
  const byId = new Map(base.legislations.map((l) => [l.id, l]))
  const lookupLocality = current?.uf && current.city ? { uf: current.uf, city: current.city, label: current.label } : null

  if (localities.length === 0) {
    return <EmptyState title="Nenhuma legislação cadastrada" description="Cadastre as normas em “Normas e versões” e importe o conteúdo dos anexos em “Importar legislação”." />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Localidade" className="min-w-[240px]">
          {(p) => (
            <Select {...p} value={current?.label ?? ''} onChange={(e) => setKey(e.target.value)}>
              {localities.map((l) => (
                <option key={l.label} value={l.label}>
                  {l.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Data de referência" className="w-44">
          {(p) => <Input {...p} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />}
        </Field>
        <p className="max-w-xl pb-1 text-[12px] text-muted">
          A base legal é consultada pela data: versões antigas continuam disponíveis para reproduzir enquadramentos passados. Nada é sobrescrito.
        </p>
      </div>

      {current && (
        <section aria-label={current.label}>
          <h3 className="mb-2 flex items-center gap-2 text-[15px] font-black tracking-wide text-ink uppercase">
            <Landmark className="size-[18px] text-primary" aria-hidden /> {current.label}
          </h3>
          <ul className="flex flex-col gap-3">
            {roots.map((legislation) => (
              <NormBlock key={legislation.id} base={base} legislation={legislation} date={date} onAnnex={setAnnex} onAmendment={setAmendment} />
            ))}
          </ul>
        </section>
      )}

      <CnaeLookup base={base} catalog={catalog} locality={lookupLocality} date={date} />

      {annex && byId.get(annex.legislationId) && (
        <AnnexModal base={base} catalog={catalog} annex={annex} legislation={byId.get(annex.legislationId)!} date={date} onClose={() => setAnnex(null)} />
      )}
      {amendment && amendment.parentLegislationId && byId.get(amendment.parentLegislationId) && (
        <AmendmentModal base={base} catalog={catalog} amendment={amendment} parent={byId.get(amendment.parentLegislationId)!} onClose={() => setAmendment(null)} />
      )}
    </div>
  )
}

