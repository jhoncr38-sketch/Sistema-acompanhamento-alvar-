import { BookOpen, Check, CircleQuestionMark, ExternalLink, FileSearch, FileText, Landmark, Lightbulb, ListChecks, Minus, TriangleAlert, X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, IconTile } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { SolidStatusIcon } from '@/components/ui/StatusIcon'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { LICENSE_OUTCOME_TONE, licenseIcon, SIMULATION_DISCLAIMER, STATUS_TONE, TONE } from '@/config/simulation'
import { UF_NAMES } from '@/config/ufs'
import { formatCnae, formatDate } from '@/domain/format'
import { CONFIDENCE_LABEL, LEGISLATION_KIND_LABEL, legislationLabel, LEVEL_LABEL, licenseOutcomeLabel, localityLabel, STATUS_LABEL } from '@/domain/simulation/labels'
import type {
  ClassificationRef,
  ClassificationTone,
  CnaeNormEvaluation,
  CnaeResult,
  ConditionState,
  LegalBasisSummary,
  LicenseResult,
  NormRef,
  RuleConfidence,
  RuleTrace,
  SimulationResult,
  SimulationStatus,
} from '@/domain/simulation/types'
import { cn } from '@/lib/cn'

function statusDisplay(status: SimulationStatus, classification: ClassificationRef | null): { label: string; tone: ClassificationTone } {
  if (status === 'classificada' && classification) return { label: classification.name, tone: classification.tone }
  const key = status === 'classificada' ? 'necessita_analise' : status
  return { label: STATUS_LABEL[key], tone: STATUS_TONE[key] }
}

export function ClassificationBadge({ status, classification, className }: { status: SimulationStatus; classification: ClassificationRef | null; className?: string }) {
  const { label, tone } = statusDisplay(status, classification)
  return (
    <span className={cn('inline-flex h-[22px] items-center rounded-md px-2 text-[12px] font-bold whitespace-nowrap', TONE[tone].soft, TONE[tone].text, className)}>
      {label}
    </span>
  )
}

const CONFIDENCE_TONE: Record<RuleConfidence, ClassificationTone> = { completa: 'green', condicionada: 'yellow', nao_cadastrada: 'gray' }

/**
 * Simulações gravadas por versões anteriores do motor não têm os campos da base legal: completa com
 * valores neutros para que o histórico continue abrindo exatamente como foi gravado.
 */
function withDefaults(result: SimulationResult): SimulationResult {
  const legacy = result as Partial<SimulationResult>
  const fallbackBasis: LegalBasisSummary = {
    locality: `${result.city} – ${result.uf}`,
    baseNorms: result.norms.filter((n) => n.general).map((n) => `${legislationLabel(n)} (${n.versionLabel})`),
    amendments: [],
    otherNorms: result.norms.filter((n) => !n.general).map((n) => `${legislationLabel(n)} (${n.versionLabel})`),
    referenceDate: result.referenceDate,
  }
  return {
    ...result,
    justification: legacy.justification ?? [],
    pendingNorms: legacy.pendingNorms ?? [],
    legalBasis: legacy.legalBasis ?? fallbackBasis,
    overall: { ...result.overall, conditionalClassification: (result.overall as Partial<SimulationResult['overall']>).conditionalClassification ?? null },
    cnaes: result.cnaes.map((c) => {
      const old = c as Partial<CnaeResult>
      return { ...c, areaEvaluations: old.areaEvaluations ?? [], conditionalClassification: old.conditionalClassification ?? null }
    }),
  }
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h3 className="mb-2.5 flex items-center gap-2 text-[15px] font-bold text-ink">
      <span className="text-primary">{icon}</span>
      {children}
    </h3>
  )
}

const allEvaluations = (cnae: CnaeResult): CnaeNormEvaluation[] => [...cnae.evaluations, ...cnae.areaEvaluations.map((a) => a.evaluation)]

function Metrics({ result }: { result: SimulationResult }) {
  const total = result.cnaes.length
  const classified = result.cnaes.filter((c) => c.status === 'classificada').length
  const noRule = result.cnaes.filter((c) => c.status === 'regra_nao_cadastrada').length
  const conditions = result.cnaes.flatMap((c) => allEvaluations(c).flatMap((e) => e.rules.flatMap((r) => r.conditions)))
  const pending = conditions.filter((c) => c.state === 'pendente').length
  const chip = (tone: ClassificationTone, content: ReactNode, ok = false) => (
    <span className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold', TONE[tone].soft, TONE[tone].text)}>
      {ok && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
      {content}
    </span>
  )
  return (
    <div className="mt-3 flex flex-wrap gap-2" aria-label="Resumo da análise">
      {chip('gray', `${total} ${total === 1 ? 'CNAE analisado' : 'CNAEs analisados'}`)}
      {classified > 0 && chip('green', `${classified} ${classified === 1 ? 'enquadrado' : 'enquadrados'} nas regras cadastradas`, true)}
      {noRule > 0 && chip('gray', `${noRule} sem regra cadastrada`)}
      {conditions.length > 0 && (pending > 0 ? chip('yellow', `${pending} ${pending === 1 ? 'condição pendente' : 'condições pendentes'}`) : chip('green', 'Condições atendidas', true))}
    </div>
  )
}

function OverallCard({ result, onExplain }: { result: SimulationResult; onExplain: () => void }) {
  const { overall } = result
  const { label, tone } = statusDisplay(overall.status, overall.classification)
  const classes = TONE[tone]
  const confidence = CONFIDENCE_LABEL[overall.confidence]
  const ufName = UF_NAMES[result.uf as keyof typeof UF_NAMES] ?? result.uf
  return (
    <Card className="relative overflow-hidden" aria-live="polite">
      <span className={cn('absolute inset-y-0 left-0 w-1.5', classes.bar)} aria-hidden />
      <div className="flex flex-col gap-4 py-4 pr-4 pl-6 sm:flex-row sm:items-start">
        <span className={cn('grid size-14 shrink-0 place-items-center rounded-2xl', classes.soft, classes.text)} aria-hidden>
          {overall.status === 'classificada' || overall.status === 'condicionada' ? (
            <ListChecks className="size-7" />
          ) : overall.status === 'necessita_analise' ? (
            <TriangleAlert className="size-7" />
          ) : (
            <CircleQuestionMark className="size-7" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-bold tracking-[0.08em] text-muted uppercase">Resultado da simulação</p>
          <p className={cn('text-[26px] leading-tight font-black tracking-[-0.01em] uppercase', classes.text)}>{label}</p>
          {overall.status === 'condicionada' && overall.conditionalClassification && (
            <p className="mt-0.5 text-[13px] text-ink-soft">
              Classificação prevista, se atendidas as condições: <ClassificationBadge status="classificada" classification={overall.conditionalClassification} className="align-middle" />
            </p>
          )}
          <p className="mt-1 text-[14px] font-semibold text-ink">{overall.headline}</p>
          {overall.explanation.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-ink-soft">
              {overall.explanation.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          {overall.partialHighest && (
            <p className="mt-1.5 text-[12.5px] text-ink-soft">
              Entre os CNAEs já enquadrados, a maior classificação é <strong className="text-ink">{overall.partialHighest.name}</strong>.
            </p>
          )}
          <Metrics result={result} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px]', TONE[CONFIDENCE_TONE[overall.confidence]].border, TONE[CONFIDENCE_TONE[overall.confidence]].soft)}
              title="Qualidade dos dados usados na simulação"
            >
              <strong className={TONE[CONFIDENCE_TONE[overall.confidence]].text}>{confidence.title}</strong>
              <span className="text-ink-soft">{confidence.description}</span>
            </span>
            <span className="rounded-lg border border-line px-2.5 py-1 text-[12px] text-ink-soft">
              {result.city} – {ufName}
            </span>
            <span className="rounded-lg border border-line px-2.5 py-1 text-[12px] text-ink-soft">Data de referência: {formatDate(result.referenceDate)}</span>
          </div>
        </div>
        <Button variant="soft" size="sm" icon={<CircleQuestionMark className="size-4" />} onClick={onExplain} className="shrink-0 font-bold uppercase">
          Por que este resultado?
        </Button>
      </div>
    </Card>
  )
}

function PendingNormsNotice({ result }: { result: SimulationResult }) {
  if (result.pendingNorms.length === 0) return null
  return (
    <div role="note" className="rounded-xl border border-[#efd27a] bg-warn-soft px-4 py-3 text-[12.5px] text-ink">
      <p className="flex items-center gap-2 font-bold text-warn-ink">
        <TriangleAlert className="size-4" aria-hidden /> Base legal cadastrada, aguardando importação do conteúdo
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-soft">
        {result.pendingNorms.map((p) => (
          <li key={p.legislationId}>
            <strong className="text-ink">{p.label}</strong> — {p.reason === 'sem_versao_vigente' ? 'sem versão vigente na data de referência' : 'sem regras cadastradas'}.
          </li>
        ))}
      </ul>
      <p className="mt-1 text-ink-soft">
        Enquanto o conteúdo não for importado a partir do documento oficial, os CNAEs aparecem como <strong>Regra não cadastrada</strong>. A ausência de
        informação nunca é tratada como dispensa.
      </p>
    </div>
  )
}

function DriversBox({ result }: { result: SimulationResult }) {
  const { overall } = result
  if (result.cnaes.length < 2 || overall.drivers.length === 0) return null
  const drivers = result.cnaes.filter((c) => overall.drivers.includes(c.code))
  const changed = overall.status === 'classificada' || overall.status === 'condicionada'
  return (
    <section aria-label="CNAE que alterou o enquadramento" className="rounded-xl border border-[#f5c27a] bg-[#fffaf0] px-4 py-3">
      <p className="flex items-center gap-2 text-[13px] font-black tracking-wide text-warn-ink uppercase">
        <TriangleAlert className="size-4" aria-hidden /> {changed ? 'CNAE que alterou o enquadramento' : 'CNAE que impediu a conclusão do enquadramento'}
      </p>
      <ul className="mt-2 space-y-1.5">
        {drivers.map((cnae) => (
          <li key={cnae.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
            <span className="tabular font-bold text-ink">{formatCnae(cnae.code)}</span>
            <span className="min-w-0 flex-1 text-ink-soft">{cnae.description ?? 'CNAE não consta no catálogo'}</span>
            <ClassificationBadge status={cnae.status} classification={cnae.classification ?? cnae.conditionalClassification} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function LicenseCard({ license }: { license: LicenseResult }) {
  const tone = TONE[LICENSE_OUTCOME_TONE[license.outcome]]
  const Icon = licenseIcon(license.code)
  const areaClassifications = [...new Set(license.contributions.filter((c) => c.fromArea && c.classification).map((c) => c.classification!.name))]
  return (
    <Card className="flex flex-col p-3.5">
      <div className="flex items-center gap-3">
        <IconTile className={cn('size-10', tone.soft, tone.text)}>
          <Icon className="size-5" />
        </IconTile>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-bold text-ink" title={license.name}>
            {license.name}
          </p>
          <p className="truncate text-[11.5px] text-muted">{license.agency}</p>
        </div>
      </div>
      <p className={cn('mt-3 inline-flex h-7 w-fit items-center rounded-md px-2.5 text-[12.5px] font-black tracking-wide uppercase', tone.soft, tone.text)}>
        {licenseOutcomeLabel(license.outcome, license.name)}
      </p>
      <p className="mt-2 text-[12px] leading-snug text-ink-soft">{license.summary}</p>
      {areaClassifications.length > 0 && <p className="mt-1.5 text-[11.5px] text-muted">Classificação específica da área: {areaClassifications.join(', ')}.</p>}
    </Card>
  )
}

const CONDITION_ICON: Record<ConditionState, ReactNode> = {
  atendida: <SolidStatusIcon tone="ok" glyph="check" size={15} label="Condição atendida" />,
  nao_atendida: (
    <span role="img" aria-label="Condição não atendida" className="inline-grid size-[15px] shrink-0 place-items-center rounded-full bg-danger text-white">
      <X className="size-2.5" strokeWidth={4} />
    </span>
  ),
  pendente: <SolidStatusIcon tone="warn" glyph="question" size={15} label="Condição pendente" />,
}

const annexOf = (rule: RuleTrace): string | null => rule.annexLabel ?? rule.annex

/** Regras que sustentam o resultado (aplicadas, alternativas ou aguardando resposta). */
const usedRules = (result: SimulationResult): RuleTrace[] =>
  result.cnaes.flatMap((c) => allEvaluations(c).flatMap((e) => e.rules.filter((r) => r.state !== 'nao_atendida' || r.ruleId === e.decidingRuleId)))

/** [VER FONTE]: abre o documento oficial na página de onde a regra foi extraída. */
function SourceLine({ rule, compact = false }: { rule: RuleTrace; compact?: boolean }) {
  const source = rule.source ?? null
  if (!source) {
    return (
      <span className={cn('inline-flex items-center gap-1 font-semibold text-warn-ink', compact ? 'text-[11px]' : 'text-[11.5px]')}>
        <TriangleAlert className="size-3.5" aria-hidden /> Sem documento-fonte vinculado — NECESSITA REVISÃO
      </span>
    )
  }
  const label = `${source.label}${source.page ? `, pág. ${source.page}` : ''}`
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5', compact ? 'text-[11px]' : 'text-[11.5px]')}>
      {!compact && <span className="font-semibold text-ink-soft">Fonte:</span>}
      {!compact && <span className="text-muted">{label}</span>}
      {source.url ? (
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-link uppercase hover:underline" title={label}>
          <FileText className="size-3.5" aria-hidden /> Ver fonte
        </a>
      ) : (
        <span className="text-muted">arquivo não disponível</span>
      )}
    </span>
  )
}

function SourceReviewNotice({ result }: { result: SimulationResult }) {
  const missing = usedRules(result).filter((r) => !r.source)
  if (missing.length === 0) return null
  return (
    <div role="note" className="rounded-xl border border-[#efd27a] bg-warn-soft px-4 py-3 text-[12.5px] text-ink">
      <p className="flex items-center gap-2 font-bold text-warn-ink">
        <TriangleAlert className="size-4" aria-hidden /> NECESSITA REVISÃO
      </p>
      <p className="mt-0.5 text-ink-soft">
        {missing.length === 1 ? 'Uma regra usada neste resultado não tem' : `${missing.length} regras usadas neste resultado não têm`} documento-fonte vinculado. Todo resultado jurídico precisa de norma,
        regra, vigência e fonte: confira as regras em Configurações › Legislação antes de usar o resultado.
      </p>
    </div>
  )
}

function baseReference(rule: RuleTrace): string {
  return [rule.article, annexOf(rule), rule.item ? `Item ${rule.item}`.replace(/^Item Item/i, 'Item') : null].filter(Boolean).join(' · ')
}

const TRACE_LABEL: Record<RuleTrace['state'], string> = {
  aplicada: 'Regra aplicada',
  alternativa: 'Condição não atendida: classificação alternativa aplicada',
  nao_atendida: 'Condição não atendida',
  pendente: 'Aguardando informação',
}

/** Avaliação com condição ainda sem resposta aparece como "Enquadramento Condicionado". */
const evaluationStatus = (evaluation: CnaeNormEvaluation): SimulationStatus => (evaluation.pending && !evaluation.classification ? 'condicionada' : evaluation.status)

function EvaluationBlock({ evaluation, area }: { evaluation: CnaeNormEvaluation; area?: string }) {
  return (
    <div className="rounded-lg border border-line-soft bg-[#fafcfe] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12.5px] font-semibold text-ink">{legislationLabel(evaluation.norm)}</p>
        <Badge tone="neutral" className="h-[18px] text-[10.5px]">
          {area ? `Classificação específica — ${area}` : evaluation.norm.general ? 'Enquadramento geral' : 'Norma específica'}
        </Badge>
        <ClassificationBadge status={evaluationStatus(evaluation)} classification={evaluation.classification} className="ml-auto h-5 text-[11.5px]" />
      </div>
      {evaluation.rules.map((rule) => (
        <div key={rule.ruleId} className="mt-2 border-t border-line-soft pt-2 first:mt-1.5">
          <p className="text-[12px] text-ink-soft">
            <span className="font-semibold text-ink">
              {rule.isDefault ? 'Regra padrão da norma' : `Regra ${rule.priority}`} → {rule.classification.name}
            </span>
            {' · '}
            {TRACE_LABEL[rule.state]}
            {rule.state === 'alternativa' && rule.elseClassification && `: ${rule.elseClassification.name}`}
          </p>
          {rule.conditions.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {rule.conditions.map((c) => (
                <li key={c.conditionId} className="flex items-start gap-2 text-[12px]">
                  <span className="mt-px">{CONDITION_ICON[c.state]}</span>
                  <span className="text-ink">
                    {c.legalText && <span className="mr-1 font-semibold text-ink-soft">Condição da norma:</span>}
                    {c.description}
                    <span className="text-muted"> — informado: {c.answerLabel}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
              <Minus className="size-3.5" aria-hidden /> Regra sem condições.
            </p>
          )}
          {(baseReference(rule) || rule.description) && (
            <p className="mt-1 text-[11.5px] text-muted">
              <span className="font-semibold text-ink-soft">Base normativa:</span> {[baseReference(rule), rule.description].filter(Boolean).join(' — ')}
            </p>
          )}
          {rule.notes && (
            <p className="mt-0.5 text-[11.5px] text-muted">
              <span className="font-semibold text-ink-soft">Observações da norma:</span> {rule.notes}
            </p>
          )}
          {(rule.state !== 'nao_atendida' || rule.ruleId === evaluation.decidingRuleId) && (
            <p className="mt-0.5">
              <SourceLine rule={rule} />
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function CnaeCard({ cnae, isDriver }: { cnae: CnaeResult; isDriver: boolean }) {
  return (
    <li className={cn('rounded-xl border p-3', isDriver ? 'border-[#f5c27a] bg-[#fffaf0]' : 'border-line')}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold text-ink">
            <span className="tabular">{formatCnae(cnae.code)}</span>
            <Badge tone={cnae.primary ? 'blue' : 'neutral'} className="ml-2 h-[18px] align-middle text-[10.5px]">
              {cnae.primary ? 'PRINCIPAL' : 'SECUNDÁRIO'}
            </Badge>
          </p>
          <p className="text-[12.5px] text-ink-soft">{cnae.description ?? 'CNAE não consta no catálogo — confira o código.'}</p>
        </div>
        <ClassificationBadge status={cnae.status} classification={cnae.classification} />
      </div>
      {cnae.status === 'condicionada' && cnae.conditionalClassification && (
        <p className="mt-1.5 text-[12px] text-ink-soft">
          Pode ser classificado como <strong className="text-ink">{cnae.conditionalClassification.name}</strong> desde que as condições previstas na legislação sejam atendidas.
        </p>
      )}
      {isDriver && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-warn-ink">
          <TriangleAlert className="size-3.5" aria-hidden /> Este CNAE definiu ou alterou o resultado geral.
        </p>
      )}
      {cnae.evaluations.length === 0 && cnae.areaEvaluations.length === 0 ? (
        <p className="mt-2 text-[12px] text-muted">{cnae.reason}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {(cnae.status === 'necessita_analise' || cnae.evaluations.length === 0) && <p className="text-[12px] text-warn-ink">{cnae.reason}</p>}
          {cnae.evaluations.map((evaluation) => (
            <EvaluationBlock key={evaluation.norm.versionId} evaluation={evaluation} />
          ))}
          {cnae.areaEvaluations.map((a) => (
            <EvaluationBlock key={`${a.licenseTypeId}-${a.evaluation.norm.versionId}`} evaluation={a.evaluation} area={a.licenseName} />
          ))}
        </div>
      )}
    </li>
  )
}

const vigencia = (norm: NormRef) => `${formatDate(norm.validFrom)} a ${norm.validTo ? formatDate(norm.validTo) : 'atualmente'}`

function NormCard({ norm, result }: { norm: NormRef; result: SimulationResult }) {
  const used = result.cnaes.flatMap((cnae) =>
    allEvaluations(cnae)
      .filter((e) => e.norm.versionId === norm.versionId)
      .flatMap((e) => e.rules.filter((r) => r.state !== 'nao_atendida' || r.ruleId === e.decidingRuleId).map((rule) => ({ cnae, rule }))),
  )
  const field = (label: string, value: ReactNode) => (
    <div>
      <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="text-[12.5px] text-ink">{value}</dd>
    </div>
  )
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-[14px] font-bold text-ink">{legislationLabel(norm)}</p>
      <p className="text-[12.5px] text-ink-soft">{norm.title}</p>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
        {field('Órgão emissor', norm.issuingBody || '—')}
        {field('Abrangência', localityLabel(norm))}
        {field('Versão da regra', norm.versionLabel)}
        {field('Vigência', vigencia(norm))}
        {norm.normDate && field('Data da norma', formatDate(norm.normDate))}
        {norm.amendedBy && field('Redação dada por', norm.amendedBy.label)}
        <div className="col-span-2 md:col-span-4">
          <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">Fonte oficial</dt>
          <dd className="text-[12.5px]">
            {norm.officialUrl ? (
              <a href={norm.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-link hover:underline">
                {norm.officialUrl} <ExternalLink className="size-3 shrink-0" aria-hidden />
              </a>
            ) : (
              <span className="text-muted">Não informada no cadastro</span>
            )}
          </dd>
        </div>
      </dl>
      {used.length > 0 && (
        <TableFrame className="mt-3">
          <Table className="text-[12px]">
            <THead>
              <tr className="h-[28px]">
                <TH>CNAE</TH>
                <TH>Artigo</TH>
                <TH>Anexo</TH>
                <TH>Item</TH>
                <TH>Regra utilizada</TH>
                <TH>Fonte</TH>
              </tr>
            </THead>
            <tbody>
              {used.map(({ cnae, rule }) => (
                <TR key={`${cnae.code}-${rule.ruleId}`} className="h-[28px] align-top">
                  <TD className="tabular py-1 whitespace-nowrap">{formatCnae(cnae.code)}</TD>
                  <TD className="py-1">{rule.article ?? '—'}</TD>
                  <TD className="py-1">{annexOf(rule) ?? '—'}</TD>
                  <TD className="py-1">{rule.item ?? '—'}</TD>
                  <TD className="py-1">{rule.description || `Classificação: ${rule.classification.name}`}</TD>
                  <TD className="py-1">
                    <SourceLine rule={rule} compact />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  )
}

/** Painel "Por que este resultado?": justificativa do motor e cada regra usada, com a base legal. */
interface ExplanationRow {
  cnae: CnaeResult
  key: string
  e: CnaeNormEvaluation | null
  area: string | null
  rule: RuleTrace | null
}

function ExplanationModal({ result, open, onClose }: { result: SimulationResult; open: boolean; onClose: () => void }) {
  const rows = result.cnaes.flatMap((cnae): ExplanationRow[] => {
    const evaluations = [
      ...cnae.evaluations.map((e) => ({ e, area: null as string | null })),
      ...cnae.areaEvaluations.map((a) => ({ e: a.evaluation, area: a.licenseName })),
    ]
    if (evaluations.length === 0) return [{ cnae, key: cnae.code, e: null, area: null, rule: null }]
    return evaluations.flatMap(({ e, area }) =>
      e.rules
        .filter((r) => r.state !== 'nao_atendida' || r.ruleId === e.decidingRuleId || r.conditions.length > 0)
        .map((rule) => ({ cnae, key: `${cnae.code}-${area ?? 'geral'}-${rule.ruleId}`, e, area, rule })),
    )
  })
  return (
    <Modal open={open} onClose={onClose} title="Por que este resultado?" description="Explicação gerada pelo motor de regras a partir da legislação cadastrada." size="xl">
      <div className="space-y-4">
        <section>
          <h4 className="mb-1.5 text-[12px] font-black tracking-wide text-ink-soft uppercase">Justificativa</h4>
          {result.justification.length > 0 ? (
            <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-ink">
              {result.justification.map((line, i) => (
                <li key={`${i}-${line}`}>{line}</li>
              ))}
            </ol>
          ) : (
            <p className="text-[12.5px] text-muted">{result.overall.headline}</p>
          )}
        </section>
        <section>
          <h4 className="mb-1.5 text-[12px] font-black tracking-wide text-ink-soft uppercase">Regras utilizadas</h4>
          <TableFrame>
            <Table className="min-w-[1080px] text-[12px]">
              <THead>
                <tr className="h-[30px]">
                  <TH>CNAE</TH>
                  <TH>Descrição</TH>
                  <TH>Classificação</TH>
                  <TH>Condição</TH>
                  <TH>Resposta</TH>
                  <TH>Legislação</TH>
                  <TH>Nº da norma</TH>
                  <TH>Anexo</TH>
                  <TH>Artigo / item</TH>
                  <TH>Vigência</TH>
                  <TH>Decreto modificador</TH>
                  <TH>Fonte</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map(({ cnae, key, e, area, rule }) => (
                  <TR key={key} className="align-top">
                    <TD className="tabular py-1.5 whitespace-nowrap">{formatCnae(cnae.code)}</TD>
                    <TD className="py-1.5">{cnae.description ?? '—'}</TD>
                    <TD className="py-1.5">
                      {e ? <ClassificationBadge status={evaluationStatus(e)} classification={e.classification} className="h-5 text-[11px]" /> : <ClassificationBadge status={cnae.status} classification={null} className="h-5 text-[11px]" />}
                      {area && <p className="mt-0.5 text-[11px] text-muted">{area}</p>}
                      {rule && <p className="mt-0.5 text-[11px] text-muted">Regra: {rule.classification.name} · {TRACE_LABEL[rule.state]}</p>}
                    </TD>
                    <TD className="py-1.5">
                      {rule && rule.conditions.length > 0 ? (
                        <ul className="space-y-1">
                          {rule.conditions.map((c) => (
                            <li key={c.conditionId}>{c.description}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted">{rule ? 'Sem condições' : '—'}</span>
                      )}
                    </TD>
                    <TD className="py-1.5">
                      {rule && rule.conditions.length > 0 ? (
                        <ul className="space-y-1">
                          {rule.conditions.map((c) => (
                            <li key={c.conditionId} className="flex items-start gap-1.5">
                              <span className="mt-px">{CONDITION_ICON[c.state]}</span>
                              {c.answerLabel}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD className="py-1.5">{e ? `${LEGISLATION_KIND_LABEL[e.norm.kind]} ${LEVEL_LABEL[e.norm.level]}` : <span className="text-muted">Regra não cadastrada</span>}</TD>
                    <TD className="py-1.5 whitespace-nowrap">{e ? `${e.norm.number}/${e.norm.year}` : '—'}</TD>
                    <TD className="py-1.5">{rule ? (annexOf(rule) ?? '—') : '—'}</TD>
                    <TD className="py-1.5">{rule ? [rule.article, rule.item].filter(Boolean).join(' · ') || '—' : '—'}</TD>
                    <TD className="py-1.5 whitespace-nowrap">{e ? vigencia(e.norm) : '—'}</TD>
                    <TD className="py-1.5">{e?.norm.amendedBy?.label ?? '—'}</TD>
                    <TD className="py-1.5">{rule ? <SourceLine rule={rule} compact /> : '—'}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableFrame>
        </section>
        <p className="text-[11.5px] text-muted">
          O resultado é produzido exclusivamente pelo motor de regras com a legislação cadastrada e revisada pelo administrador. Informações que não constam na base aparecem como
          “Regra não cadastrada” ou “Necessita análise” — nunca como dispensa.
        </p>
      </div>
    </Modal>
  )
}

function LegalBasisFooter({ basis, onShow }: { basis: LegalBasisSummary; onShow: () => void }) {
  const item = (label: string, value: ReactNode) => (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="text-[12.5px] text-ink">{value}</dd>
    </div>
  )
  const list = (values: string[], empty: string) => (values.length > 0 ? values.join('; ') : <span className="text-muted">{empty}</span>)
  return (
    <Card className="p-[14px]">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle icon={<Landmark className="size-[18px]" />}>Base legal utilizada</SectionTitle>
        <Button variant="secondary" size="sm" icon={<FileSearch className="size-4" />} onClick={onShow} className="mb-2.5 ml-auto font-bold uppercase">
          Ver fundamentação
        </Button>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
        {item('Município', basis.locality)}
        {item('Norma-base', list(basis.baseNorms, 'Nenhuma norma de enquadramento aplicada'))}
        {item('Alterações consideradas', list(basis.amendments, 'Nenhuma'))}
        {item('Data de referência', formatDate(basis.referenceDate))}
        {basis.otherNorms.length > 0 && <div className="sm:col-span-2 xl:col-span-4">{item('Normas específicas de órgãos', list(basis.otherNorms, '—'))}</div>}
      </dl>
    </Card>
  )
}

/** Resultado completo, renderizado apenas a partir do `SimulationResult` (serve para o histórico). */
export function ResultView({ result: stored }: { result: SimulationResult }) {
  const result = withDefaults(stored)
  const answered = result.answers.filter((a) => a.answer !== null)
  const [explaining, setExplaining] = useState(false)
  const groundsRef = useRef<HTMLDivElement>(null)
  const showGrounds = () => {
    groundsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    groundsRef.current?.focus({ preventScroll: true })
  }
  return (
    <div className="flex flex-col gap-4">
      <OverallCard result={result} onExplain={() => setExplaining(true)} />
      <PendingNormsNotice result={result} />
      <SourceReviewNotice result={result} />
      <DriversBox result={result} />

      <section aria-label="Resultado por área">
        <SectionTitle icon={<ListChecks className="size-[18px]" />}>Resultado por área</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {result.licenses.map((license) => (
            <LicenseCard key={license.licenseTypeId} license={license} />
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-muted">
          Cada órgão tem regra própria: o Baixo Risco A de um órgão não dispensa automaticamente os demais. Corpo de Bombeiros: análise separada pelo órgão competente.
        </p>
      </section>

      <Card className="p-[14px]">
        <SectionTitle icon={<ListChecks className="size-[18px]" />}>CNAEs analisados</SectionTitle>
        <ul className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
          {result.cnaes.map((cnae) => (
            <CnaeCard key={cnae.code} cnae={cnae} isDriver={result.cnaes.length > 1 && result.overall.drivers.includes(cnae.code)} />
          ))}
        </ul>
        {answered.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-[12px] font-semibold text-ink-soft">Informações fornecidas</p>
            <ul className="flex flex-wrap gap-2">
              {answered.map((a) => (
                <li key={a.questionId} className="rounded-lg bg-[#f3f7fc] px-2.5 py-1 text-[12px] text-ink-soft">
                  {a.text}: <strong className="text-ink">{a.answerLabel}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <div ref={groundsRef} tabIndex={-1} className="scroll-mt-4 outline-none">
        <Card className="p-[14px]">
          <SectionTitle icon={<BookOpen className="size-[18px]" />}>Fundamentação</SectionTitle>
          {result.norms.length === 0 ? (
            <p className="text-[12.5px] text-muted">Nenhuma norma cadastrada se aplica aos CNAEs, à localidade e à data informados.</p>
          ) : (
            <div className="space-y-2.5">
              {result.norms.map((norm) => (
                <NormCard key={norm.versionId} norm={norm} result={result} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {result.suggestions.length > 0 && (
        <Card className="p-[14px]">
          <SectionTitle icon={<Lightbulb className="size-[18px]" />}>Sugestões</SectionTitle>
          <ul className="space-y-1.5">
            {result.suggestions.map((s) => (
              <li key={s.text} className="flex items-start gap-2 text-[13px] text-ink">
                {s.tone === 'ok' ? <Check className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={3} aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />}
                {s.text}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <LegalBasisFooter basis={result.legalBasis} onShow={showGrounds} />

      <p className="text-[11.5px] leading-relaxed text-muted">
        {SIMULATION_DISCLAIMER} Motor de regras v{result.engineVersion}.
      </p>

      <ExplanationModal result={result} open={explaining} onClose={() => setExplaining(false)} />
    </div>
  )
}
