import { ChevronRight, ClipboardCheck, Download, FileSpreadsheet, PackageOpen, ShieldCheck, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDataSource } from '@/app/data-context'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input, SearchInput, Select } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/States'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import type { CatalogSnapshot } from '@/data/types'
import { addDays } from '@/domain/dates'
import { formatCnae, formatDate, formatDateTime } from '@/domain/format'
import { csvToTable, parseRuleTable, RULES_CSV_HEADER, type ImportedRule } from '@/domain/simulation/csv-import'
import { versionChain } from '@/domain/simulation/legal-base'
import { legislationLabel, LICENSE_OUTCOME_OPTION_LABEL } from '@/domain/simulation/labels'
import { packageFor, packageNormId, type PackageImport } from '@/domain/simulation/legislation-package'
import { baseVersionFor, buildPublication, previewImport, type ImportItem, type ImportItemStatus, type ImportLicenseEffect, type ImportMode } from '@/domain/simulation/rule-import'
import type { CnaeRule, RuleBase } from '@/domain/simulation/types'
import { useImportBatches, useLegislationPackage } from '@/hooks/simulation-queries'
import { cn } from '@/lib/cn'
import { downloadText, readTextFile } from '@/lib/download'
import { ruleConditionsText, useRuleAction, validityLabel } from './shared'

const STEPS = ['Documento', 'Extração', 'Comparação', 'Revisão', 'Aprovação do administrador', 'Publicação da nova versão'] as const

interface LoadedFile {
  name: string
  kind: 'csv' | 'xlsx'
  sheets: { name: string; data: unknown[][] }[]
}

interface VersionDraft {
  label: string
  validFrom: string
  validTo: string
  amendedBy: string
  sourceUrl: string
  /** `null` = mantém o critério da versão anterior. */
  highestRisk: boolean | null
}

const EMPTY_DRAFT: VersionDraft = { label: '', validFrom: '', validTo: '', amendedBy: '', sourceUrl: '', highestRisk: null }

const STATUS_BADGE: Record<ImportItemStatus, { label: string; tone: 'ok' | 'blue' | 'danger' | 'neutral' }> = {
  novo: { label: 'Novo', tone: 'ok' },
  alterado: { label: 'Alterado', tone: 'blue' },
  removido: { label: 'Removido', tone: 'danger' },
  inalterado: { label: 'Inalterado', tone: 'neutral' },
}

type ReviewFilter = 'todos' | 'novo' | 'alterado' | 'removido' | 'condicoes' | 'efeitos'
const REVIEW_PAGE = 200

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Etapas da importação">
      {STEPS.map((step, i) => (
        <li key={step} className="flex items-center gap-1.5">
          <span
            aria-current={i === current ? 'step' : undefined}
            className={cn(
              'inline-flex h-7 items-center rounded-md px-2.5 text-[11.5px] font-bold tracking-wide uppercase',
              i < current ? 'bg-ok-soft text-ok-ink' : i === current ? 'bg-primary text-white' : 'bg-neutral-soft text-muted',
            )}
          >
            {i + 1}. {step}
          </span>
          {i < STEPS.length - 1 && <ChevronRight className="size-3.5 text-muted" aria-hidden />}
        </li>
      ))}
    </ol>
  )
}

/**
 * Importar legislação (CSV ou XLSX). Nada vai para a base de produção sem o fluxo completo:
 * DOCUMENTO → EXTRAÇÃO → COMPARAÇÃO → REVISÃO → APROVAÇÃO DO ADMINISTRADOR → PUBLICAÇÃO DA NOVA VERSÃO.
 * A publicação cria uma nova versão da norma (ou complementa uma versão existente); a anterior é preservada.
 */
export function ImportTab({ base, catalog, readOnly }: { base: RuleBase; catalog: CatalogSnapshot; readOnly: boolean }) {
  const ds = useDataSource()
  const act = useRuleAction()
  const batches = useImportBatches()
  const candidates = base.legislations.filter((l) => l.active && l.relation !== 'altera' && l.relation !== 'revoga')
  const [legislationId, setLegislationId] = useState(() => (candidates.find((l) => base.annexes.some((a) => a.legislationId === l.id && a.active)) ?? candidates[0])?.id ?? '')
  const [mode, setMode] = useState<ImportMode>('parcial')
  const [targetKind, setTargetKind] = useState<'nova_versao' | 'versao_existente'>('nova_versao')
  const [draft, setDraft] = useState<VersionDraft>(EMPTY_DRAFT)
  const [existingId, setExistingId] = useState('')
  const [defaultAnnex, setDefaultAnnex] = useState('')
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [sheetIndex, setSheetIndex] = useState(0)
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const [inputKey, setInputKey] = useState(0)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('todos')
  const [reviewedKey, setReviewedKey] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState<{ label: string; inserted: number } | null>(null)
  const [reviewQuery, setReviewQuery] = useState('')
  /** Efeitos nas licenças carregados de um pacote extraído (com o fundamento legal). */
  const [effects, setEffects] = useState<{ items: ImportLicenseEffect[]; problems: string[] }>({ items: [], problems: [] })
  const [loadingPackage, setLoadingPackage] = useState<string | null>(null)

  const legislation = base.legislations.find((l) => l.id === legislationId)
  const annexes = useMemo(() => base.annexes.filter((a) => a.legislationId === legislationId && a.active).sort((a, b) => a.sortOrder - b.sortOrder), [base, legislationId])
  const annexId = annexes.some((a) => a.id === defaultAnnex) ? defaultAnnex : ''
  const versions = versionChain(base, legislationId)
  const existing = versions.find((v) => v.id === existingId) ?? versions.at(-1) ?? null
  const amendmentOptions = [...base.legislations].filter((l) => l.id !== legislationId).sort((a, b) => Number(b.parentLegislationId === legislationId) - Number(a.parentLegislationId === legislationId) || b.year - a.year)
  const classification = new Map(base.classifications.map((c) => [c.id, c.name]))
  const licenseName = new Map(catalog.licenseTypes.map((t) => [t.id, t.name]))
  const annexLabel = new Map(base.annexes.map((a) => [a.id, `Anexo ${a.code}`]))
  const packageRef = legislation?.city ? packageFor({ uf: legislation.uf, city: legislation.city }) : null
  const pkg = useLegislationPackage(packageRef?.url ?? null)
  const publishedFiles = new Set((batches.data ?? []).map((b) => b.fileName))

  const parsed = useMemo(
    () =>
      file
        ? parseRuleTable(file.sheets[sheetIndex]?.data ?? [], {
            classifications: base.classifications,
            questions: base.questions,
            annexes,
            defaultAnnexId: annexId || null,
            licenseTypes: catalog.licenseTypes,
            documents: base.documents,
          })
        : null,
    [file, sheetIndex, base, annexes, annexId, catalog.licenseTypes],
  )
  const baseVersion = targetKind === 'nova_versao' ? (draft.validFrom ? baseVersionFor(base, legislationId, draft.validFrom) : null) : existing
  const comparable = targetKind === 'versao_existente' ? !!existing : !!draft.validFrom
  const preview = useMemo(
    () => (parsed && comparable ? previewImport({ base, baseVersionId: baseVersion?.id ?? null, rows: parsed.rows, removals: parsed.removals, mode, defaultAnnexId: annexId || null }) : null),
    [parsed, comparable, base, baseVersion?.id, mode, annexId],
  )
  const changes = preview ? preview.counts.novos + preview.counts.alterados + preview.counts.removidos + effects.items.length : 0
  const reviewKey = JSON.stringify([file?.name, sheetIndex, legislationId, mode, targetKind, baseVersion?.id, annexId, preview?.counts, parsed?.rows.length, effects.items.length])
  const reviewed = reviewedKey === reviewKey
  const closesBase = targetKind === 'nova_versao' && !!baseVersion && !!draft.validFrom && (baseVersion.validTo === null || baseVersion.validTo >= draft.validFrom)
  const highestRisk = draft.highestRisk ?? baseVersion?.highestRiskPrevails ?? false

  const targetProblem =
    targetKind === 'nova_versao'
      ? !draft.label.trim()
        ? 'Informe a identificação da nova versão.'
        : !draft.validFrom
          ? 'Informe o início da vigência.'
          : draft.validTo && draft.validTo < draft.validFrom
            ? 'O fim da vigência não pode ser anterior ao início.'
            : null
      : existing
        ? null
        : 'A norma ainda não tem versão: escolha “Nova versão”.'
  const blockers = [
    !file && 'Selecione o arquivo.',
    parsed && parsed.errors.length > 0 && 'Corrija as linhas com erro no arquivo e selecione-o novamente: legislação não é publicada pela metade.',
    effects.problems.length > 0 && `Efeitos nas licenças do pacote não reconhecidos: ${effects.problems.join('; ')}.`,
    targetProblem,
    preview && changes === 0 && 'A importação não altera nenhuma regra.',
    preview && changes > 0 && !reviewed && 'Revise as alterações antes de confirmar.',
  ].filter((b): b is string => typeof b === 'string')

  const step = published ? 5 : !file ? 0 : !parsed || parsed.errors.length > 0 || parsed.rows.length + parsed.removals.length === 0 ? 1 : !preview ? 2 : !reviewed ? 3 : 4

  if (candidates.length === 0) {
    return <EmptyState title="Cadastre primeiro a norma" description="A importação inclui o conteúdo dos anexos em uma norma cadastrada (aba Normas e versões)." />
  }

  function resetFile() {
    setFile(null)
    setSheetIndex(0)
    setReadError(null)
    setInputKey((k) => k + 1)
  }

  /** Carrega um pacote extraído dos documentos oficiais no assistente — mesma prévia, revisão e aprovação. */
  async function loadPackage(item: PackageImport) {
    if (!packageRef || !pkg.data) return
    setLoadingPackage(item.id)
    setReadError(null)
    setPublished(null)
    try {
      const target = base.legislations.find((l) => packageNormId(l) === item.norma && l.city === legislation?.city)
      if (!target) throw new Error(`a norma ${item.norma} não está cadastrada`)
      const response = await fetch(`${packageRef.base}/dados/${item.arquivo}`)
      if (!response.ok) throw new Error(`arquivo ${item.arquivo} indisponível (${response.status})`)
      const text = await readTextFile(new File([await response.blob()], item.arquivo))
      const amending = item.versao.alterada_por ? base.legislations.find((l) => packageNormId(l) === item.versao.alterada_por && l.city === target.city) : undefined
      setLegislationId(target.id)
      setMode(item.modo)
      setTargetKind('nova_versao')
      setDefaultAnnex('')
      setDraft({
        label: item.versao.rotulo,
        validFrom: item.versao.inicio,
        validTo: item.versao.fim ?? '',
        amendedBy: amending?.id ?? '',
        sourceUrl: item.versao.fonte,
        highestRisk: item.versao.maior_risco_prevalece,
      })
      const loaded: ImportLicenseEffect[] = []
      const problems: string[] = []
      if (item.efeitos) {
        for (const e of pkg.data.efeitos) {
          const cls = base.classifications.find((c) => c.code === e.classificacao_codigo)
          const license = catalog.licenseTypes.find((t) => t.code === e.licenca)
          if (!cls || !license) problems.push(`${e.classificacao} × ${e.licenca}`)
          else loaded.push({ classificationId: cls.id, licenseTypeId: license.id, outcome: e.efeito, notes: e.fundamento })
        }
      }
      setEffects({ items: loaded, problems })
      setFile({ name: item.arquivo.split('/').pop() ?? item.arquivo, kind: 'csv', sheets: [{ name: item.arquivo, data: csvToTable(text) }] })
      setSheetIndex(0)
      setReviewedKey(null)
    } catch (error) {
      setReadError(`Não foi possível carregar o pacote: ${error instanceof Error ? error.message : String(error)}.`)
    } finally {
      setLoadingPackage(null)
    }
  }

  async function onFile(selected: File | undefined) {
    if (!selected) return
    setReading(true)
    setReadError(null)
    setPublished(null)
    setEffects({ items: [], problems: [] })
    try {
      if (/\.xlsx$/i.test(selected.name)) {
        const { default: readXlsxFile } = await import('read-excel-file/browser')
        const sheets = await readXlsxFile(selected)
        setFile({ name: selected.name, kind: 'xlsx', sheets: sheets.map((s) => ({ name: s.sheet, data: s.data as unknown[][] })) })
      } else {
        setFile({ name: selected.name, kind: 'csv', sheets: [{ name: selected.name, data: csvToTable(await readTextFile(selected)) }] })
      }
      setSheetIndex(0)
    } catch {
      setFile(null)
      setReadError('Não foi possível ler o arquivo. Use CSV (separado por ; ou ,) ou Excel .xlsx.')
    } finally {
      setReading(false)
    }
  }

  async function publish() {
    if (!preview || !file || !parsed || blockers.length > 0) return
    setPublishing(true)
    const target =
      targetKind === 'nova_versao'
        ? {
            kind: 'nova_versao' as const,
            closeBaseVersion: closesBase,
            version: {
              label: draft.label.trim(),
              validFrom: draft.validFrom,
              validTo: draft.validTo || null,
              highestRiskPrevails: highestRisk,
              sourceUrl: draft.sourceUrl.trim() || null,
              notes: `Publicada por importação revisada (${file.name}).`,
              active: true,
              amendedByLegislationId: draft.amendedBy || null,
            },
          }
        : { kind: 'versao_existente' as const, versionId: existing!.id }
    const publication = buildPublication(preview, { legislationId, target, fileName: file.name, sourceKind: file.kind, rowsTotal: parsed.totalLines, licenseEffects: effects.items })
    let inserted = 0
    const ok = await act(async () => {
      inserted = (await ds.simulation.publishImport(publication)).inserted
    }, targetKind === 'nova_versao' ? 'Nova versão publicada' : 'Versão atualizada')
    setPublishing(false)
    setConfirmOpen(false)
    if (ok) {
      setPublished({ label: targetKind === 'nova_versao' ? draft.label.trim() : existing!.label, inserted })
      setDraft(EMPTY_DRAFT)
      setReviewedKey(null)
      setEffects({ items: [], problems: [] })
      resetFile()
    }
  }

  const summarize = (rules: readonly (Pick<CnaeRule, 'classificationId' | 'elseClassificationId' | 'priority'> & { conditions: ImportedRule['conditions'] })[]) =>
    [...rules]
      .sort((a, b) => a.priority - b.priority)
      .map((r) => {
        const conditions = ruleConditionsText(r, base.questions)
        return `${classification.get(r.classificationId) ?? '—'}${conditions.length > 0 ? ` — se: ${conditions.join(' e ')}` : ''}${r.elseClassificationId ? ` (senão: ${classification.get(r.elseClassificationId)})` : ''}`
      })
  const reviewTerm = reviewQuery.trim().toLowerCase()
  const visibleItems = (preview?.items ?? []).filter(
    (i) =>
      (reviewFilter === 'todos' ? i.status !== 'inalterado' : reviewFilter === 'condicoes' ? i.conditionsChanged : i.status === reviewFilter) &&
      (!reviewTerm || `${i.activity ?? ''} ${i.description ?? ''}`.toLowerCase().includes(reviewTerm) || (i.activity ?? '').includes(reviewTerm.replace(/\D/g, '') || '§')),
  )
  const activityLabel = (item: ImportItem) => (item.isCbo ? `CBO ${item.activity}` : item.activity ? formatCnae(item.activity) : 'Padrão da norma')
  const set = (patch: Partial<VersionDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const counts = preview?.counts

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-primary-line bg-primary-soft px-3.5 py-2.5 text-[12.5px] text-ink-soft">
        <p className="flex items-center gap-2 font-bold text-primary">
          <ShieldCheck className="size-4" aria-hidden /> Nenhuma importação altera automaticamente a base de produção
        </p>
        <p className="mt-0.5">
          O arquivo é lido e comparado com a versão vigente. As regras só entram em uso depois que o administrador revisar as alterações e confirmar a publicação. Os dados devem vir do
          documento oficial: o sistema não cria CNAEs, classificações nem condições por conta própria.
        </p>
      </div>

      <Stepper current={step} />

      {packageRef && (
        <section className="rounded-xl border border-line p-3.5" aria-label="Pacotes extraídos dos documentos oficiais">
          <h4 className="mb-1 flex items-center gap-2 text-[13px] font-bold text-ink">
            <PackageOpen className="size-4 text-primary" aria-hidden /> Pacotes extraídos dos documentos oficiais — {legislation?.city?.toUpperCase()}
          </h4>
          {pkg.isError ? (
            <p className="text-[12px] text-warn-ink">Pacote de dados indisponível neste ambiente.</p>
          ) : !pkg.data ? (
            <p className="text-[12px] text-muted">Carregando…</p>
          ) : (
            <>
              <p className="mb-2 text-[12px] text-muted">
                Extraídos em {formatDate(pkg.data.gerado_em)} dos PDFs do Diário Oficial ({pkg.data.totais.erros} erros, {pkg.data.totais.registros_revisao_manual} itens para revisão manual). Publique na ordem: redação original e, depois, cada alteração.
              </p>
              <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
                {pkg.data.pacotes.map((item) => {
                  const done = publishedFiles.has(item.arquivo.split('/').pop() ?? '')
                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-semibold text-ink">{item.versao.rotulo}</p>
                        <p className="text-[11.5px] text-muted">
                          Vigência a partir de {formatDate(item.versao.inicio)} · {item.modo === 'completo' ? 'anexos completos' : 'somente alterações'} · {item.linhas} linhas
                          {item.efeitos ? ' · com os efeitos nas licenças e o fundamento legal' : ''}
                        </p>
                      </div>
                      {done ? <Badge tone="ok">Publicado</Badge> : <Badge tone="warn">Aguardando aprovação</Badge>}
                      {!readOnly && !done && (
                        <Button size="sm" variant="secondary" loading={loadingPackage === item.id} onClick={() => void loadPackage(item)}>
                          Carregar no assistente
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-line p-3.5" aria-label="Destino">
          <h4 className="mb-2 text-[13px] font-bold text-ink">1. Norma de destino</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Norma" className="sm:col-span-2">
              {(p) => (
                <Select {...p} value={legislationId} onChange={(e) => setLegislationId(e.target.value)} disabled={readOnly}>
                  {candidates.map((l) => (
                    <option key={l.id} value={l.id}>
                      {legislationLabel(l)} — {l.city ?? l.uf ?? 'Brasil'}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Anexo (quando a planilha não tiver a coluna “anexo”)">
              {(p) => (
                <Select {...p} value={annexId} onChange={(e) => setDefaultAnnex(e.target.value)} disabled={readOnly}>
                  <option value="">Sem anexo</option>
                  {annexes.map((a) => (
                    <option key={a.id} value={a.id}>
                      Anexo {a.code} — {a.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Tipo de importação" hint={mode === 'completo' ? 'Regras dos anexos importados que não estiverem no arquivo serão retiradas da nova versão.' : 'Somente as linhas do arquivo; use a coluna “acao = remover” para retirar regras.'}>
              {(p) => (
                <Select {...p} value={mode} onChange={(e) => setMode(e.target.value as ImportMode)} disabled={readOnly}>
                  <option value="parcial">Somente alterações</option>
                  <option value="completo">Anexo completo</option>
                </Select>
              )}
            </Field>
            <Field label="Publicar como" className="sm:col-span-2">
              {(p) => (
                <Select {...p} value={targetKind} onChange={(e) => setTargetKind(e.target.value as typeof targetKind)} disabled={readOnly}>
                  <option value="nova_versao">Nova versão da norma (recomendado — a versão anterior é preservada)</option>
                  <option value="versao_existente" disabled={versions.length === 0}>
                    Complementar uma versão existente (correção de cadastro)
                  </option>
                </Select>
              )}
            </Field>
            {targetKind === 'nova_versao' ? (
              <>
                <Field label="Identificação da versão" required className="sm:col-span-2" hint="Ex.: Redação dada pelo Decreto nº …">
                  {(p) => <Input {...p} value={draft.label} onChange={(e) => set({ label: e.target.value })} disabled={readOnly} />}
                </Field>
                <Field label="Início da vigência" required>
                  {(p) => <Input {...p} type="date" value={draft.validFrom} onChange={(e) => set({ validFrom: e.target.value })} disabled={readOnly} />}
                </Field>
                <Field label="Fim da vigência (opcional)">
                  {(p) => <Input {...p} type="date" value={draft.validTo} onChange={(e) => set({ validTo: e.target.value })} disabled={readOnly} />}
                </Field>
                <Field label="Norma modificadora (decreto que deu a redação)" className="sm:col-span-2">
                  {(p) => (
                    <Select {...p} value={draft.amendedBy} onChange={(e) => set({ amendedBy: e.target.value })} disabled={readOnly}>
                      <option value="">Nenhuma (redação original)</option>
                      {amendmentOptions.map((l) => (
                        <option key={l.id} value={l.id}>
                          {legislationLabel(l)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Fonte oficial (link do Diário Oficial, opcional)" className="sm:col-span-2">
                  {(p) => <Input {...p} type="url" value={draft.sourceUrl} onChange={(e) => set({ sourceUrl: e.target.value })} disabled={readOnly} placeholder="https://" />}
                </Field>
                <label className="flex items-start gap-2 text-[12.5px] text-ink sm:col-span-2">
                  <input type="checkbox" className="mt-0.5 size-4 accent-[#0c6cf0]" checked={highestRisk} onChange={(e) => set({ highestRisk: e.target.checked })} disabled={readOnly} />
                  <span>
                    A norma determina que a atividade de maior risco define o enquadramento
                    <span className="block text-[11.5px] text-muted">Marque somente se constar no texto legal. Padrão: igual à versão anterior.</span>
                  </span>
                </label>
                {draft.validFrom && (
                  <p className="text-[12px] text-ink-soft sm:col-span-2">
                    {baseVersion ? (
                      <>
                        Comparação com <strong className="text-ink">{baseVersion.label}</strong> ({validityLabel(baseVersion)}).
                        {closesBase && ` Ao publicar, essa versão terá a vigência encerrada em ${formatDate(addDays(draft.validFrom, -1))} — nada é apagado.`}
                      </>
                    ) : (
                      'Não há versão anterior: todas as regras do arquivo entram como novas.'
                    )}
                  </p>
                )}
              </>
            ) : (
              <Field label="Versão" className="sm:col-span-2">
                {(p) => (
                  <Select {...p} value={existing?.id ?? ''} onChange={(e) => setExistingId(e.target.value)} disabled={readOnly}>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label} ({validityLabel(v)})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-line p-3.5" aria-label="Documento">
          <h4 className="mb-2 text-[13px] font-bold text-ink">2. Documento (CSV ou Excel)</h4>
          <p className="mb-2 text-[12px] text-muted">
            Colunas: <code>cnae</code> (ou <code>cbo</code>), <code>descricao</code>, <code>anexo</code> (I, II, III), <code>area</code> (geral, sanitária, ambiental, bombeiros…),{' '}
            <code>classificacao</code>, <code>condicao_texto</code> (texto da condição como está na norma), <code>condicao</code> (estruturada, ex.: <code>area_m2 &lt;= 200</code>),{' '}
            <code>classificacao_se_nao_atender</code>, <code>ordem</code>, <code>artigo</code>, <code>item</code>, <code>observacoes</code>, <code>resumo</code> e <code>acao</code>{' '}
            (incluir, alterar, remover). Detalhes em docs/SIMULACAO.md.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-[12px] font-semibold text-ink-soft">
              Arquivo
              <Input
                key={inputKey}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={readOnly || reading}
                className="py-1.5 text-[12px] file:mr-3 file:rounded-md file:border-0 file:bg-primary-soft file:px-2.5 file:py-1 file:text-[12px] file:font-semibold file:text-primary"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => downloadText(`﻿${RULES_CSV_HEADER}\r\n`, 'modelo-importacao-legislacao.csv')}>
              Baixar modelo
            </Button>
          </div>
          {reading && <p className="mt-2 text-[12px] text-muted">Lendo o arquivo…</p>}
          {readError && <p className="mt-2 text-[12px] text-danger-ink">{readError}</p>}
          {file && file.sheets.length > 1 && (
            <Field label="Planilha" className="mt-2 max-w-xs">
              {(p) => (
                <Select {...p} value={sheetIndex} onChange={(e) => setSheetIndex(Number(e.target.value))}>
                  {file.sheets.map((s, i) => (
                    <option key={s.name} value={i}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {parsed && file && (
            <div className="mt-3">
              <p className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                <FileSpreadsheet className="size-4 text-primary" aria-hidden /> {file.name}: {parsed.totalLines} {parsed.totalLines === 1 ? 'linha lida' : 'linhas lidas'}
                {parsed.errors.length > 0 && <span className="text-danger-ink">· {parsed.errors.length} com erro</span>}
              </p>
              {parsed.ignoredColumns.length > 0 && <p className="mt-1 text-[11.5px] text-muted">Colunas não utilizadas: {parsed.ignoredColumns.join(', ')}.</p>}
              {parsed.errors.length > 0 && (
                <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto rounded-lg bg-[#fff7f8] p-2.5 text-[12px] text-danger-ink">
                  {parsed.errors.map((e) => (
                    <li key={`${e.line}-${e.message}`}>
                      Linha {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      {published && (
        <p role="status" className="rounded-xl border border-[#a6dfc4] bg-ok-soft px-3.5 py-2.5 text-[12.5px] text-ok-ink">
          <strong>Publicado:</strong> {published.label} — {published.inserted} {published.inserted === 1 ? 'regra incluída' : 'regras incluídas'}. A versão anterior e o histórico de simulações
          foram preservados.
        </p>
      )}

      {file && parsed && !preview && !targetProblem && <p className="text-[12.5px] text-muted">Informe o destino para comparar com a base vigente.</p>}

      {preview && counts && (
        <section className="rounded-xl border border-line p-3.5" aria-label="Prévia da importação">
          <h4 className="mb-2 text-[13px] font-black tracking-wide text-ink uppercase">Prévia da importação</h4>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
            {(
              [
                ['Encontrados', counts.encontrados, 'text-ink'],
                ['Novos', counts.novos, 'text-ok-ink'],
                ['Alterados', counts.alterados, 'text-primary'],
                ['Removidos', counts.removidos, 'text-danger-ink'],
                ['Condições modificadas', counts.condicoesModificadas, 'text-warn-ink'],
                ['Inalterados', counts.inalterados, 'text-ink-soft'],
                ['Efeitos nas licenças', effects.items.length, 'text-primary'],
              ] as const
            ).map(([label, value, tone]) => (
              <div key={label} className="rounded-lg bg-[#f6f8fb] px-3 py-2">
                <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</dt>
                <dd className={cn('text-[22px] leading-tight font-black tabular-nums', tone)}>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant={reviewed ? 'secondary' : 'primary'}
              icon={<ClipboardCheck className="size-4" />}
              onClick={() => {
                setReviewFilter('todos')
                setReviewOpen(true)
              }}
              disabled={changes === 0}
              className="font-bold uppercase"
            >
              Revisar alterações
            </Button>
            {!readOnly && (
              <Button icon={<Upload className="size-4" />} onClick={() => setConfirmOpen(true)} disabled={blockers.length > 0} className="font-bold uppercase">
                Confirmar importação
              </Button>
            )}
            {reviewed && <Badge tone="ok">Alterações revisadas</Badge>}
          </div>
          {blockers.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[12px] text-warn-ink">
              {blockers.map((b) => (
                <li key={b}>• {b}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-label="Importações publicadas">
        <h4 className="mb-2 text-[13px] font-bold text-ink">Importações publicadas</h4>
        {(batches.data ?? []).length === 0 ? (
          <p className="text-[12.5px] text-muted">Nenhuma importação publicada.</p>
        ) : (
          <TableFrame>
            <Table className="min-w-[760px] text-[12px]">
              <THead>
                <tr className="h-[30px]">
                  <TH>Data</TH>
                  <TH>Norma</TH>
                  <TH>Versão</TH>
                  <TH>Arquivo</TH>
                  <TH>Tipo</TH>
                  <TH>Novos / alterados / removidos</TH>
                  <TH>Publicado por</TH>
                </tr>
              </THead>
              <tbody>
                {(batches.data ?? []).map((b) => {
                  const norm = base.legislations.find((l) => l.id === b.legislationId)
                  const version = base.versions.find((v) => v.id === b.versionId)
                  return (
                    <TR key={b.id}>
                      <TD className="py-1.5 whitespace-nowrap">{formatDateTime(b.publishedAt)}</TD>
                      <TD className="py-1.5">{norm ? legislationLabel(norm) : '—'}</TD>
                      <TD className="py-1.5">{version ? `${version.label} (${validityLabel(version)})` : '—'}</TD>
                      <TD className="py-1.5">{b.fileName}</TD>
                      <TD className="py-1.5">{b.mode === 'completo' ? 'Anexo completo' : 'Somente alterações'}</TD>
                      <TD className="tabular py-1.5">
                        {b.counts.novos} / {b.counts.alterados} / {b.counts.removidos}
                      </TD>
                      <TD className="py-1.5">{b.publishedByName || '—'}</TD>
                    </TR>
                  )
                })}
              </tbody>
            </Table>
          </TableFrame>
        )}
      </section>

      {preview && (
        <Modal
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          size="xl"
          title="Revisar alterações"
          description={`${legislation ? legislationLabel(legislation) : ''} · comparado com ${baseVersion ? baseVersion.label : 'nenhuma versão anterior'}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setReviewOpen(false)}>
                Fechar
              </Button>
              <Button
                icon={<ClipboardCheck className="size-4" />}
                onClick={() => {
                  setReviewedKey(reviewKey)
                  setReviewOpen(false)
                }}
              >
                Concluir revisão
              </Button>
            </>
          }
        >
          <Tabs
            items={[
              { id: 'todos', label: `Todas as alterações (${changes})` },
              { id: 'novo', label: `Novos (${preview.counts.novos})` },
              { id: 'alterado', label: `Alterados (${preview.counts.alterados})` },
              { id: 'removido', label: `Removidos (${preview.counts.removidos})` },
              { id: 'condicoes', label: `Condições modificadas (${preview.counts.condicoesModificadas})` },
              ...(effects.items.length > 0 ? [{ id: 'efeitos' as const, label: `Efeitos nas licenças (${effects.items.length})` }] : []),
            ]}
            value={reviewFilter}
            onChange={setReviewFilter}
            label="Filtrar alterações"
            className="mb-3"
          />
          {reviewFilter !== 'efeitos' && (
            <SearchInput value={reviewQuery} onChange={setReviewQuery} label="Buscar na revisão" placeholder="CNAE, CBO ou descrição…" className="mb-2 w-[260px]" />
          )}
          {reviewFilter === 'efeitos' ? (
            <TableFrame className="max-h-[55vh] overflow-y-auto">
              <Table className="min-w-[760px] text-[12px]">
                <THead>
                  <tr className="h-[30px]">
                    <TH>Classificação</TH>
                    <TH>Licença</TH>
                    <TH>Efeito</TH>
                    <TH>Fundamento</TH>
                  </tr>
                </THead>
                <tbody>
                  {effects.items.map((e) => (
                    <TR key={`${e.classificationId}-${e.licenseTypeId}`} className="align-top">
                      <TD className="py-1.5 font-semibold">{classification.get(e.classificationId)}</TD>
                      <TD className="py-1.5">{licenseName.get(e.licenseTypeId)}</TD>
                      <TD className="py-1.5">{LICENSE_OUTCOME_OPTION_LABEL[e.outcome]}</TD>
                      <TD className="py-1.5 text-ink-soft">{e.notes}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableFrame>
          ) : visibleItems.length === 0 ? (
            <p className="text-[12.5px] text-muted">Nenhum item neste filtro.</p>
          ) : (
            <TableFrame className="max-h-[55vh] overflow-y-auto">
              <Table className="min-w-[900px] text-[12px]">
                <THead>
                  <tr className="h-[30px]">
                    <TH>Situação</TH>
                    <TH>CNAE / CBO</TH>
                    <TH>Descrição</TH>
                    <TH>Anexo</TH>
                    <TH>Área</TH>
                    <TH>Antes</TH>
                    <TH>Depois</TH>
                  </tr>
                </THead>
                <tbody>
                  {visibleItems.slice(0, REVIEW_PAGE).map((item) => (
                    <TR key={item.key} className="align-top">
                      <TD className="py-1.5">
                        <Badge tone={STATUS_BADGE[item.status].tone}>{STATUS_BADGE[item.status].label}</Badge>
                        {item.conditionsChanged && <p className="mt-0.5 text-[11px] text-warn-ink">Condição modificada</p>}
                      </TD>
                      <TD className="tabular py-1.5 whitespace-nowrap">{activityLabel(item)}</TD>
                      <TD className="py-1.5">{item.description ?? '—'}</TD>
                      <TD className="py-1.5">{item.annexId ? (annexLabel.get(item.annexId) ?? '—') : '—'}</TD>
                      <TD className="py-1.5">{item.licenseTypeId ? (licenseName.get(item.licenseTypeId) ?? 'Licença') : 'Enquadramento geral'}</TD>
                      <TD className="py-1.5">{item.before.length > 0 ? summarize(item.before).map((t) => <p key={t}>{t}</p>) : '—'}</TD>
                      <TD className="py-1.5">{item.after.length > 0 ? summarize(item.after).map((t) => <p key={t}>{t}</p>) : item.status === 'removido' ? 'Retirada da versão' : '—'}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableFrame>
          )}
          {reviewFilter !== 'efeitos' && visibleItems.length > REVIEW_PAGE && (
            <p className="mt-1.5 text-[11.5px] text-muted">Mostrando {REVIEW_PAGE} de {visibleItems.length}. Use a busca para conferir os demais.</p>
          )}
        </Modal>
      )}

      {preview && counts && (
        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="Confirmar importação?"
          description="Aprovação do administrador"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={publishing}>
                Cancelar
              </Button>
              <Button icon={<Upload className="size-4" />} onClick={publish} loading={publishing}>
                Confirmar importação
              </Button>
            </>
          }
        >
          <dl className="space-y-1.5 text-[12.5px]">
            <div>
              <dt className="font-semibold text-ink-soft">Norma</dt>
              <dd className="text-ink">{legislation ? legislationLabel(legislation) : '—'}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink-soft">Destino</dt>
              <dd className="text-ink">
                {targetKind === 'nova_versao'
                  ? `Nova versão “${draft.label.trim()}”, vigente a partir de ${draft.validFrom ? formatDate(draft.validFrom) : '—'}${draft.validTo ? ` até ${formatDate(draft.validTo)}` : ''}`
                  : `Versão existente “${existing?.label ?? ''}”`}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink-soft">Alterações</dt>
              <dd className="text-ink">
                {counts.novos} novos · {counts.alterados} alterados · {counts.removidos} removidos · {counts.condicoesModificadas} com condições modificadas
                {effects.items.length > 0 && ` · ${effects.items.length} efeitos nas licenças`}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[12px] text-muted">
            Nada é excluído: {targetKind === 'nova_versao' ? 'a versão anterior continua disponível para datas antigas' : 'as regras substituídas são desativadas'} e as simulações já gravadas
            permanecem exatamente como foram feitas.
          </p>
        </Modal>
      )}
    </div>
  )
}
