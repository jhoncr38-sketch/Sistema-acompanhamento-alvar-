import { ExternalLink, FileClock, FileSearch, FileText, Plus, RefreshCw, Table2 } from 'lucide-react'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useDataSource } from '@/app/data-context'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, IconTile } from '@/components/ui/Card'
import { Field, Input, SearchInput, Select, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/States'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import type { LegislationDocumentInput } from '@/data/types'
import { formatDate } from '@/domain/format'
import { legalLocalities } from '@/domain/simulation/legal-base'
import { DOCUMENT_KIND_LABEL, DOCUMENT_STATUS_LABEL, legislationLabel } from '@/domain/simulation/labels'
import { packageFor, packageNormId, type AmendmentRow, type LegislationPackage } from '@/domain/simulation/legislation-package'
import type { DocumentKind, DocumentStatus, Legislation, LegislationDocument, RuleBase } from '@/domain/simulation/types'
import { useLegislationPackage } from '@/hooks/simulation-queries'
import { LEGISLATION_WATCH_PROVIDERS, type LegislationWatchResult } from '@/integrations/legislation/legislation-watch'
import { useRuleAction } from './shared'

type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'blue'
const STATUS_TONE: Record<DocumentStatus, Tone> = {
  oficial_confirmado: 'ok',
  fonte_secundaria: 'warn',
  copia_html: 'blue',
  pendente_conferencia: 'warn',
  nao_localizado: 'danger',
}
const PAGE = 100

/** Arquivo da biblioteca na pasta do ano (o nome do arquivo traz o ano da norma), aberto na página indicada. */
const pageUrl = (base: string, document: string, page: number) => `${base}/${document.match(/_(20\d\d)_/)?.[1] ?? ''}/${document}#page=${page}`

function SourceLink({ base, document, page }: { base: string; document: string; page: number }) {
  return (
    <a href={pageUrl(base, document, page)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap text-link hover:underline">
      pág. {page} <ExternalLink className="size-3" aria-hidden />
    </a>
  )
}

function Filtered<T>({ rows, query, keys, children }: { rows: T[]; query: string; keys: (row: T) => string; children: (rows: T[], total: number) => ReactNode }) {
  const q = query.trim().toLowerCase()
  const digits = q.replace(/\D/g, '')
  const filtered = q ? rows.filter((r) => keys(r).toLowerCase().includes(q) || (digits.length >= 3 && keys(r).replace(/\D/g, '').includes(digits))) : rows
  return <>{children(filtered.slice(0, PAGE), filtered.length)}</>
}

function ShowingNote({ shown, total }: { shown: number; total: number }) {
  return <p className="mt-1.5 text-[11.5px] text-muted">{total === 0 ? 'Nenhum registro.' : shown < total ? `Mostrando ${shown} de ${total}. Refine a busca para ver os demais.` : `${total} registro(s).`}</p>
}

/** [VER DADOS EXTRAÍDOS]: tabelas extraídas do PDF oficial, com documento e página de cada linha. */
function ExtractedDataModal({ pkg, base, norm, onClose }: { pkg: LegislationPackage; base: string; norm: Legislation; onClose: () => void }) {
  const id = packageNormId(norm)
  const isBase = id === 'decreto-24861-2023'
  const amendments = pkg.alteracoes.filter((a) => a.norma_modificadora === `Decreto nº ${norm.number}/${norm.year}`)
  type TabId = 'anexo_i' | 'anexo_ii' | 'anexo_iii' | 'alteracoes' | 'validacao'
  const tabs: { id: TabId; label: string }[] = isBase
    ? [
        { id: 'anexo_i', label: `Anexo I (${pkg.anexo_i.length})` },
        { id: 'anexo_ii', label: `Anexo II — Baixo Risco A (${pkg.anexo_ii.length})` },
        { id: 'anexo_iii', label: `Anexo III — CBO (${pkg.anexo_iii.length})` },
        { id: 'validacao', label: 'Validação' },
      ]
    : [
        { id: 'alteracoes', label: `Alterações (${amendments.length})` },
        { id: 'validacao', label: 'Validação' },
      ]
  const [tab, setTab] = useState<TabId>(tabs[0]!.id)
  const [query, setQuery] = useState('')
  return (
    <Modal open onClose={onClose} size="xl" title={`Dados extraídos — ${legislationLabel(norm)}`} description={`Extraídos do PDF oficial em ${formatDate(pkg.gerado_em)} por ${pkg.gerador}. Ainda passam pela importação revisada antes de valer no simulador.`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs items={tabs} value={tab} onChange={setTab} label="Dados extraídos" />
        {tab !== 'validacao' && <SearchInput value={query} onChange={setQuery} label="Buscar" placeholder="CNAE, CBO ou descrição…" className="ml-auto w-[240px]" />}
      </div>
      {tab === 'anexo_i' && (
        <Filtered rows={pkg.anexo_i} query={query} keys={(r) => `${r.cnae} ${r.descricao}`}>
          {(rows, total) => (
            <>
              <TableFrame className="max-h-[55vh] overflow-y-auto">
                <Table className="min-w-[900px] text-[12px]">
                  <THead>
                    <tr className="h-[30px]">
                      <TH>CNAE</TH>
                      <TH>Descrição</TH>
                      <TH>Risco ambiental</TH>
                      <TH>Risco sanitário</TH>
                      <TH>Competência</TH>
                      <TH>Fonte</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {rows.map((r) => (
                      <TR key={r.cnae} className="align-top">
                        <TD className="tabular py-1.5 whitespace-nowrap">{r.cnae}</TD>
                        <TD className="py-1.5">{r.descricao}</TD>
                        <TD className="py-1.5">{r.risco_ambiental}</TD>
                        <TD className="py-1.5">{r.risco_sanitario}</TD>
                        <TD className="py-1.5">{r.competencia || '—'}</TD>
                        <TD className="py-1.5">
                          <SourceLink base={base} document={r.documento} page={r.pagina} />
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableFrame>
              <ShowingNote shown={rows.length} total={total} />
            </>
          )}
        </Filtered>
      )}
      {tab === 'anexo_ii' && (
        <Filtered rows={pkg.anexo_ii} query={query} keys={(r) => `${r.cnae} ${r.descricao}`}>
          {(rows, total) => (
            <>
              <TableFrame className="max-h-[55vh] overflow-y-auto">
                <Table className="min-w-[860px] text-[12px]">
                  <THead>
                    <tr className="h-[30px]">
                      <TH>CNAE</TH>
                      <TH>Descrição</TH>
                      <TH>Baixo Risco A</TH>
                      <TH>Condição para enquadramento</TH>
                      <TH>Fonte</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {rows.map((r) => (
                      <TR key={r.cnae} className="align-top">
                        <TD className="tabular py-1.5 whitespace-nowrap">{r.cnae}</TD>
                        <TD className="py-1.5">{r.descricao}</TD>
                        <TD className="py-1.5 whitespace-nowrap">{r.baixo_risco_a}</TD>
                        <TD className="py-1.5">{r.condicao_enquadramento || '—'}</TD>
                        <TD className="py-1.5">
                          <SourceLink base={base} document={r.documento} page={r.pagina} />
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableFrame>
              <ShowingNote shown={rows.length} total={total} />
            </>
          )}
        </Filtered>
      )}
      {tab === 'anexo_iii' && (
        <Filtered rows={pkg.anexo_iii} query={query} keys={(r) => `${r.cbo} ${r.descricao}`}>
          {(rows, total) => (
            <>
              <TableFrame className="max-h-[55vh] overflow-y-auto">
                <Table className="min-w-[720px] text-[12px]">
                  <THead>
                    <tr className="h-[30px]">
                      <TH>CBO</TH>
                      <TH>Descrição</TH>
                      <TH>Risco ambiental</TH>
                      <TH>Risco sanitário</TH>
                      <TH>Fonte</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {rows.map((r) => (
                      <TR key={r.cbo} className="align-top">
                        <TD className="tabular py-1.5">{r.cbo}</TD>
                        <TD className="py-1.5">{r.descricao}</TD>
                        <TD className="py-1.5">{r.risco_ambiental}</TD>
                        <TD className="py-1.5">{r.risco_sanitario}</TD>
                        <TD className="py-1.5">
                          <SourceLink base={base} document={r.documento} page={r.pagina} />
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableFrame>
              <ShowingNote shown={rows.length} total={total} />
            </>
          )}
        </Filtered>
      )}
      {tab === 'alteracoes' && <AmendmentTable rows={amendments} base={base} query={query} />}
      {tab === 'validacao' && <ValidationSummary pkg={pkg} base={base} />}
    </Modal>
  )
}

function AmendmentTable({ rows: all, base, query }: { rows: AmendmentRow[]; base: string; query: string }) {
  return (
    <Filtered rows={all} query={query} keys={(r) => `${r.cnae} ${r.descricao}`}>
      {(rows, total) => (
        <>
          <TableFrame className="max-h-[55vh] overflow-y-auto">
            <Table className="min-w-[980px] text-[12px]">
              <THead>
                <tr className="h-[30px]">
                  <TH>CNAE</TH>
                  <TH>Descrição</TH>
                  <TH>Área</TH>
                  <TH>Regra anterior</TH>
                  <TH>Nova regra</TH>
                  <TH>Norma modificadora</TH>
                  <TH>Início da vigência</TH>
                  <TH>Fonte</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <TR key={`${r.norma_modificadora}-${r.cnae}-${r.area}`} className="align-top">
                    <TD className="tabular py-1.5 whitespace-nowrap">{r.cnae}</TD>
                    <TD className="py-1.5">{r.descricao}</TD>
                    <TD className="py-1.5 whitespace-nowrap">{r.area}</TD>
                    <TD className="py-1.5 text-ink-soft">{r.regra_anterior}</TD>
                    <TD className="py-1.5 font-semibold">{r.nova_regra}</TD>
                    <TD className="py-1.5 whitespace-nowrap">{r.norma_modificadora}</TD>
                    <TD className="py-1.5 whitespace-nowrap">{formatDate(r.inicio_vigencia)}</TD>
                    <TD className="py-1.5">
                      <SourceLink base={base} document={r.documento} page={r.pagina} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableFrame>
          <ShowingNote shown={rows.length} total={total} />
        </>
      )}
    </Filtered>
  )
}

function ValidationSummary({ pkg, base }: { pkg: LegislationPackage; base: string }) {
  const t = pkg.totais
  const item = (label: string, value: ReactNode) => (
    <div className="rounded-lg bg-[#f6f8fb] px-3 py-2">
      <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="text-[18px] font-black text-ink tabular-nums">{value}</dd>
    </div>
  )
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {item('CNAEs encontrados', t.cnaes_encontrados)}
        {item('Anexo I', t.cnaes_anexo_i)}
        {item('Baixo Risco A', t.cnaes_baixo_risco_a)}
        {item('CBOs', t.cbos_anexo_iii)}
        {item('Condições especiais', t.condicoes_especiais)}
        {item('Alterações posteriores', t.alteracoes_posteriores)}
        {item('Erros', t.erros)}
        {item('Revisão manual', t.registros_revisao_manual)}
      </dl>
      <p className="text-[12px] text-ink-soft">
        {t.descricoes_iguais_ibge} de {t.cnaes_encontrados} descrições idênticas às da tabela oficial do IBGE (CNAE 2.3); {t.cnaes_fora_dos_anexos} subclasse(s) do IBGE fora dos anexos.{' '}
        <a href={`${base}/dados/relatorio_validacao.md`} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
          Abrir o relatório de validação
        </a>
        .
      </p>
      {pkg.revisao_manual.length > 0 && (
        <div>
          <p className="mb-1 text-[12px] font-bold text-warn-ink uppercase">Precisam de revisão manual</p>
          <ul className="space-y-1 text-[12px] text-ink">
            {pkg.revisao_manual.map((r, i) => (
              <li key={`${r.codigo}-${i}`} className="rounded-lg border border-[#efd27a] bg-warn-soft px-2.5 py-1.5">
                {r.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** [VER ALTERAÇÕES]: normas que alteram a norma e o que cada uma mudou (antes × depois, com a página). */
function AmendmentsModal({ pkg, base, norm, rule, onClose }: { pkg: LegislationPackage; base: string; norm: Legislation; rule: RuleBase; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const children = rule.legislations.filter((l) => l.parentLegislationId === norm.id)
  const labels = new Set([norm, ...children].map((l) => `${l.kind === 'decreto' ? 'Decreto' : 'Lei Complementar'} nº ${l.number}/${l.year}`))
  const rows = pkg.alteracoes.filter((a) => labels.has(a.norma_modificadora))
  return (
    <Modal open onClose={onClose} size="xl" title={`Alterações — ${legislationLabel(norm)}`} description="A regra antiga é preservada: cada alteração cria uma nova vigência.">
      {children.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {children.map((c) => (
            <li key={c.id}>
              <Badge tone="blue">
                {c.relation === 'revoga' ? 'Revoga' : 'Altera'}: {legislationLabel(c)}
                {c.normDate ? ` (${formatDate(c.normDate)})` : ''}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-muted">Nenhuma alteração por CNAE extraída para esta norma (as alterações de texto estão no próprio documento).</p>
      ) : (
        <>
          <SearchInput value={query} onChange={setQuery} label="Buscar" placeholder="CNAE ou descrição…" className="mb-2 w-[240px]" />
          <AmendmentTable rows={rows} base={base} query={query} />
        </>
      )}
    </Modal>
  )
}

function VerifyModal({ city, pkg, onClose }: { city: string; pkg: LegislationPackage | undefined; onClose: () => void }) {
  const provider = LEGISLATION_WATCH_PROVIDERS.find((p) => p.city.toLowerCase() === city.toLowerCase())
  const [result, setResult] = useState<LegislationWatchResult | null>(null)
  const [checking, setChecking] = useState(false)
  return (
    <Modal open onClose={onClose} title="Verificar nova legislação" description={provider?.label ?? 'Fonte oficial do município'} footer={<Button onClick={onClose}>Fechar</Button>}>
      <div className="space-y-3 text-[12.5px] text-ink-soft">
        <p>
          A verificação automática está preparada na arquitetura, mas <strong className="text-ink">não está ativa</strong>: o sistema não faz raspagem do Diário Oficial. Um documento novo
          entra na biblioteca como <strong>Pendente de conferência</strong> e só vira regra depois da extração, da revisão e da aprovação do administrador.
        </p>
        {provider && (
          <Button
            variant="secondary"
            icon={<RefreshCw className="size-4" />}
            loading={checking}
            onClick={async () => {
              setChecking(true)
              setResult(await provider.check(pkg?.gerado_em ?? null))
              setChecking(false)
            }}
          >
            Verificar agora
          </Button>
        )}
        {result?.status === 'integracao_pendente' && <p className="rounded-lg border border-[#efd27a] bg-warn-soft px-3 py-2 font-semibold text-warn-ink">{result.message}</p>}
        {provider && (
          <a href={provider.officialSourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
            Abrir o Diário Oficial para conferência manual <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
        {pkg && (
          <div>
            <p className="mb-1 font-semibold text-ink">Última extração: {formatDate(pkg.gerado_em)} — fontes consultadas</p>
            <ul className="list-disc space-y-1 pl-5">
              {pkg.pesquisa.map((s) => (
                <li key={`${s.norma}-${s.fonte}`}>
                  <strong className="text-ink">{s.fonte}</strong> ({s.norma}): {s.resultado}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}

const EMPTY_DOCUMENT = (legislationId: string): LegislationDocumentInput => ({
  legislationId,
  title: '',
  kind: 'edicao_dom',
  edition: null,
  publicationDate: null,
  pages: null,
  officialUrl: null,
  fileUrl: null,
  fileName: null,
  sha256: null,
  sizeBytes: null,
  downloadedAt: null,
  status: 'pendente_conferencia',
  notes: null,
  active: true,
})

function DocumentModal({ norms, draft, onClose }: { norms: Legislation[]; draft: LegislationDocumentInput; onClose: () => void }) {
  const ds = useDataSource()
  const act = useRuleAction()
  const [form, setForm] = useState(draft)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof LegislationDocumentInput>(key: K, value: LegislationDocumentInput[K]) => setForm((f) => ({ ...f, [key]: value }))
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return setError('Informe o título do documento.')
    if (form.sha256 && !/^[0-9a-f]{64}$/.test(form.sha256)) return setError('O hash deve ser SHA-256 (64 caracteres hexadecimais).')
    setSaving(true)
    const ok = await act(() => ds.simulation.saveDocument(form), draft.id ? 'Documento atualizado' : 'Documento registrado')
    setSaving(false)
    if (ok) onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={draft.id ? 'Editar documento' : 'Registrar documento'}
      description="Metadados do documento preservado na biblioteca. Nunca registre como oficial um arquivo que não veio da fonte oficial."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="document-form" loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="document-form" onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
        <Field label="Norma" required className="sm:col-span-2">
          {(p) => (
            <Select {...p} value={form.legislationId} onChange={(e) => set('legislationId', e.target.value)}>
              {norms.map((l) => (
                <option key={l.id} value={l.id}>
                  {legislationLabel(l)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Título" required className="sm:col-span-2">
          {(p) => <Input {...p} value={form.title} onChange={(e) => set('title', e.target.value)} />}
        </Field>
        <Field label="Tipo de arquivo">
          {(p) => (
            <Select {...p} value={form.kind} onChange={(e) => set('kind', e.target.value as DocumentKind)}>
              {Object.entries(DOCUMENT_KIND_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Situação">
          {(p) => (
            <Select {...p} value={form.status} onChange={(e) => set('status', e.target.value as DocumentStatus)}>
              {Object.entries(DOCUMENT_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Edição (ex.: DOM nº 3.609)">{(p) => <Input {...p} value={form.edition ?? ''} onChange={(e) => set('edition', e.target.value || null)} />}</Field>
        <Field label="Data de publicação">{(p) => <Input {...p} type="date" value={form.publicationDate ?? ''} onChange={(e) => set('publicationDate', e.target.value || null)} />}</Field>
        <Field label="Páginas da norma">{(p) => <Input {...p} value={form.pages ?? ''} onChange={(e) => set('pages', e.target.value || null)} />}</Field>
        <Field label="Data do download">{(p) => <Input {...p} type="date" value={form.downloadedAt ?? ''} onChange={(e) => set('downloadedAt', e.target.value || null)} />}</Field>
        <Field label="URL oficial" className="sm:col-span-2">
          {(p) => <Input {...p} type="url" value={form.officialUrl ?? ''} onChange={(e) => set('officialUrl', e.target.value.trim() || null)} placeholder="https://" />}
        </Field>
        <Field label="Arquivo preservado (endereço na biblioteca)" className="sm:col-span-2" hint="Ex.: /legislacao/teresina/2026/arquivo.pdf">
          {(p) => <Input {...p} value={form.fileUrl ?? ''} onChange={(e) => set('fileUrl', e.target.value.trim() || null)} />}
        </Field>
        <Field label="Nome do arquivo">{(p) => <Input {...p} value={form.fileName ?? ''} onChange={(e) => set('fileName', e.target.value.trim() || null)} />}</Field>
        <Field label="SHA-256">{(p) => <Input {...p} value={form.sha256 ?? ''} onChange={(e) => set('sha256', e.target.value.trim().toLowerCase() || null)} />}</Field>
        <Field label="Observações" className="sm:col-span-2">
          {(p) => <Textarea {...p} className="min-h-[56px]" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} />}
        </Field>
        {error && (
          <p role="alert" className="text-[12.5px] text-danger-ink sm:col-span-2">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

function DocumentCard({
  norm,
  documents,
  rule,
  pkg,
  onData,
  onAmendments,
}: {
  norm: Legislation
  documents: LegislationDocument[]
  rule: RuleBase
  pkg: LegislationPackage | undefined
  onData: () => void
  onAmendments: () => void
}) {
  const main = documents.find((d) => d.kind === 'edicao_dom' && d.active) ?? documents[0]
  const id = packageNormId(norm)
  const annexes = rule.annexes.filter((a) => a.legislationId === norm.id && a.active).length
  const amendments = rule.legislations.filter((l) => l.parentLegislationId === norm.id)
  const packageRows = pkg ? pkg.alteracoes.filter((a) => a.norma_modificadora === `Decreto nº ${norm.number}/${norm.year}`).length : 0
  const extracted = id === 'decreto-24861-2023' && pkg ? `${pkg.totais.cnaes_encontrados} CNAEs · ${pkg.totais.cbos_anexo_iii} CBOs` : packageRows > 0 ? `${packageRows} alterações por CNAE` : null
  const governed = rule.versions.filter((v) => v.legislationId === norm.id || v.amendedByLegislationId === norm.id)
  const inForce = governed.length > 0
  return (
    <Card className="flex flex-col p-3.5">
      <div className="flex items-start gap-3">
        <IconTile className="size-10 bg-primary-soft text-primary">
          <FileText className="size-5" />
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-ink">{legislationLabel(norm)}</p>
          <p className="line-clamp-2 text-[11.5px] text-muted" title={norm.title}>
            {norm.title}
          </p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        <div className="col-span-2">
          <dt className="sr-only">Situação</dt>
          <dd>
            {main ? (
              <Badge tone={STATUS_TONE[main.status]} className="uppercase">
                {DOCUMENT_STATUS_LABEL[main.status]}
              </Badge>
            ) : (
              <Badge tone="danger" className="uppercase">
                Documento oficial não localizado
              </Badge>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold text-muted uppercase">Publicado</dt>
          <dd className="text-ink">{main?.publicationDate ? `${formatDate(main.publicationDate)}${main.edition ? ` · ${main.edition}` : ''}` : '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold text-muted uppercase">Anexos</dt>
          <dd className="text-ink">{annexes}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold text-muted uppercase">Dados extraídos</dt>
          <dd className="text-ink">{extracted ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold text-muted uppercase">No simulador</dt>
          <dd className={inForce ? 'text-ok-ink' : 'text-warn-ink'}>{inForce ? `${governed.length} versão(ões) publicada(s)` : 'Aguardando importação e aprovação'}</dd>
        </div>
      </dl>
      {documents.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line-soft pt-2">
          {documents.map((d) => (
            <li key={d.id} className="text-[11.5px] text-ink-soft">
              <span className="font-semibold text-ink">{d.edition ?? DOCUMENT_KIND_LABEL[d.kind]}</span>
              {d.pages ? ` · págs. ${d.pages}` : ''} · {DOCUMENT_KIND_LABEL[d.kind]}
              {d.sha256 && <span className="block truncate font-mono text-[10.5px] text-muted" title={`SHA-256 ${d.sha256}`}>SHA-256 {d.sha256.slice(0, 24)}…</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
        {main?.fileUrl ? (
          <a href={main.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-[30px] items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-bold text-white uppercase hover:bg-primary-hover">
            <FileSearch className="size-4" aria-hidden /> Ver documento
          </a>
        ) : (
          <Button size="sm" disabled>
            Ver documento
          </Button>
        )}
        <Button size="sm" variant="secondary" icon={<Table2 className="size-4" />} onClick={onData} disabled={!extracted} className="font-bold uppercase">
          Ver dados extraídos
        </Button>
        <Button size="sm" variant="secondary" icon={<FileClock className="size-4" />} onClick={onAmendments} disabled={amendments.length === 0 && packageRows === 0} className="font-bold uppercase">
          Ver alterações
        </Button>
      </div>
      {main?.officialUrl && (
        <a href={main.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-link hover:underline">
          Fonte oficial (Diário Oficial) <ExternalLink className="size-3" aria-hidden />
        </a>
      )}
    </Card>
  )
}

/**
 * Biblioteca de legislação: o PDF oficial é a FONTE DOCUMENTAL; os dados extraídos (CSV/JSON) e o banco são a FONTE
 * OPERACIONAL do simulador. Cada card liga uma coisa à outra.
 */
export function DocumentsTab({ base, readOnly }: { base: RuleBase; readOnly: boolean }) {
  const localities = legalLocalities(base).filter((l) => l.city)
  const [key, setKey] = useState(() => localities.find((l) => l.city === 'Teresina')?.label ?? localities[0]?.label ?? '')
  const current = localities.find((l) => l.label === key) ?? localities[0] ?? null
  const pkgRef = current ? packageFor({ uf: current.uf, city: current.city }) : null
  const pkg = useLegislationPackage(pkgRef?.url ?? null)
  const [dataOf, setDataOf] = useState<Legislation | null>(null)
  const [amendmentsOf, setAmendmentsOf] = useState<Legislation | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [registering, setRegistering] = useState(false)
  const norms = useMemo(
    () => [...(current?.legislations ?? [])].sort((a, b) => (a.normDate ?? `${a.year}`).localeCompare(b.normDate ?? `${b.year}`)),
    [current],
  )

  if (localities.length === 0) return <EmptyState title="Nenhuma norma municipal cadastrada" description="Cadastre a norma em “Normas e versões” e registre o documento oficial aqui." />

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
        <div className="ml-auto flex flex-wrap gap-2">
          {!readOnly && (
            <>
              <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => setVerifying(true)} className="font-bold uppercase">
                Verificar nova legislação
              </Button>
              <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setRegistering(true)}>
                Registrar documento
              </Button>
            </>
          )}
        </div>
      </div>
      <p className="rounded-xl border border-primary-line bg-primary-soft px-3.5 py-2.5 text-[12.5px] text-ink-soft">
        <strong className="text-primary">Biblioteca de legislação.</strong> O documento original (PDF do Diário Oficial) fica preservado sem alteração, com URL, data do download e hash. Os dados
        extraídos dele só entram no simulador pela importação revisada e aprovada; cada regra guarda o documento e a página de origem.
        {pkg.data && ` Última extração: ${formatDate(pkg.data.gerado_em)}.`}
      </p>
      {pkgRef && pkg.isError && <p className="text-[12px] text-warn-ink">Pacote de dados extraídos indisponível neste ambiente ({String(pkg.error instanceof Error ? pkg.error.message : pkg.error)}).</p>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {norms.map((norm) => (
          <DocumentCard
            key={norm.id}
            norm={norm}
            documents={base.documents.filter((d) => d.legislationId === norm.id).sort((a, b) => (a.kind === 'edicao_dom' ? -1 : 1) - (b.kind === 'edicao_dom' ? -1 : 1))}
            rule={base}
            pkg={pkg.data}
            onData={() => setDataOf(norm)}
            onAmendments={() => setAmendmentsOf(norm)}
          />
        ))}
      </div>
      {dataOf && pkg.data && pkgRef && <ExtractedDataModal pkg={pkg.data} base={pkgRef.base} norm={dataOf} onClose={() => setDataOf(null)} />}
      {amendmentsOf && pkg.data && pkgRef && <AmendmentsModal pkg={pkg.data} base={pkgRef.base} norm={amendmentsOf} rule={base} onClose={() => setAmendmentsOf(null)} />}
      {verifying && current?.city && <VerifyModal city={current.city} pkg={pkg.data} onClose={() => setVerifying(false)} />}
      {registering && norms[0] && <DocumentModal norms={norms} draft={EMPTY_DOCUMENT(norms[0].id)} onClose={() => setRegistering(false)} />}
    </div>
  )
}
