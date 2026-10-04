import { Building, CircleCheck, FlaskConical, Info, Pencil, Plus, RotateCcw, SearchCheck, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useDataSource } from '@/app/data-context'
import { usePageMeta } from '@/app/page-meta'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Form'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { SuggestInput } from '@/components/ui/SuggestInput'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { DEMO_CITY } from '@/config/simulation'
import { UF_NAMES, UFS } from '@/config/ufs'
import { errorMessage } from '@/data/errors'
import { formatCnpj, isCnpjShapeValid, normalizeCnpj } from '@/domain/cnpj'
import { todayISO } from '@/domain/dates'
import { formatCnae, formatDate } from '@/domain/format'
import { collectQuestions, runSimulation } from '@/domain/simulation/engine'
import type { QuestionRequest, SimulationCnae, SimulationResult, SimulationRun } from '@/domain/simulation/types'
import type { Company } from '@/domain/types'
import { useCatalog, useCompanies } from '@/hooks/queries'
import { useInvalidateSimulation, useRuleBase } from '@/hooks/simulation-queries'
import {
  buildSimulationInput,
  companyCnaes,
  saveSimulationRun,
  searchCnpjForSimulation,
  validateSimulationForm,
  type SimulationCompanyLink,
  type SimulationForm,
} from '@/services/simulation-service'
import { ApplyToCompanyModal } from './ApplyToCompanyModal'
import { CnaeInput, cnaeEntry, EMPTY_CNAE, type CnaeEntry } from './CnaeInput'
import { Questionnaire, type Answers } from './Questionnaire'
import { ResultView } from './ResultView'

export interface SimulationPrefill {
  company: SimulationCompanyLink | null
  cnpj: string | null
  cnaes: SimulationCnae[]
  uf: string
  city: string
}

export function SimulationNav({ current }: { current: 'nova' | 'historico' }) {
  const navigate = useNavigate()
  return (
    <Tabs
      label="Simulação"
      className="mb-3"
      value={current}
      onChange={(id) => navigate(id === 'nova' ? '/simulacao' : '/simulacao/historico')}
      items={[
        { id: 'nova', label: 'Nova simulação' },
        { id: 'historico', label: 'Histórico de simulações' },
      ]}
    />
  )
}

function normalizeText(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

type Step = 'form' | 'questions' | 'result'
type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'skipped'

export function SimulationPage() {
  usePageMeta('Simulação de Licenciamento', 'Analise o enquadramento da atividade e identifique possíveis dispensas e exigências de licenciamento.')
  const ds = useDataSource()
  const { can } = useSession()
  const toast = useToast()
  const invalidate = useInvalidateSimulation()
  const catalog = useCatalog()
  const ruleBase = useRuleBase()
  const companies = useCompanies()
  const location = useLocation()
  const [params] = useSearchParams()
  const topRef = useRef<HTMLDivElement>(null)

  const [companyText, setCompanyText] = useState('')
  const [company, setCompany] = useState<SimulationCompanyLink | null>(null)
  const [cnpj, setCnpj] = useState<string | null>(null)
  const [cnaes, setCnaes] = useState<CnaeEntry[]>([EMPTY_CNAE])
  const [uf, setUf] = useState('PI')
  const [city, setCity] = useState('Teresina')
  const [referenceDate, setReferenceDate] = useState(todayISO())
  const [step, setStep] = useState<Step>('form')
  const [requests, setRequests] = useState<QuestionRequest[]>([])
  const [answers, setAnswers] = useState<Answers>({})
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [run, setRun] = useState<SimulationRun | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [formError, setFormError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const prefilled = useRef(false)

  const cnaeCatalog = useMemo(() => catalog.data?.cnaes ?? [], [catalog.data])

  function fillCnaes(list: SimulationCnae[]) {
    if (list.length > 0) setCnaes(list.map((c) => cnaeEntry(c.code, c.description)))
  }

  function linkCompany(c: Company) {
    if (!catalog.data) return
    setCompany({ id: c.id, name: c.legalName, cnpj: c.cnpj })
    setCompanyText(`${c.legalName} — ${formatCnpj(c.cnpj)}`)
    setCnpj(null)
    fillCnaes(companyCnaes(c, catalog.data))
    if ((UFS as readonly string[]).includes(c.address.state)) setUf(c.address.state)
    if (c.address.city) setCity(c.address.city)
  }

  // Pré-preenchimento: ?empresa=<id> ou "simular novamente" a partir do histórico.
  useEffect(() => {
    if (prefilled.current || !catalog.data || !companies.data) return
    prefilled.current = true
    const prefill = (location.state as { prefill?: SimulationPrefill } | null)?.prefill
    const fromParam = companies.data.find((c) => c.id === params.get('empresa'))
    if (prefill) {
      setCompany(prefill.company)
      setCompanyText(prefill.company ? `${prefill.company.name} — ${formatCnpj(prefill.company.cnpj)}` : prefill.cnpj ? formatCnpj(prefill.cnpj) : '')
      setCnpj(prefill.company ? null : prefill.cnpj)
      fillCnaes(prefill.cnaes)
      setUf(prefill.uf)
      setCity(prefill.city)
    } else if (fromParam) {
      linkCompany(fromParam)
    }
    // executa uma única vez, quando os dados chegam
  }, [catalog.data, companies.data])

  useEffect(() => {
    if (step !== 'form') topRef.current?.scrollIntoView({ block: 'start' })
  }, [step])

  const companyOptions = useMemo(() => {
    const text = companyText.trim()
    if (company || text.length < 2) return []
    const q = normalizeText(text)
    const digits = normalizeCnpj(text)
    return (companies.data ?? [])
      .filter((c) => normalizeText(`${c.legalName} ${c.tradeName}`).includes(q) || (digits.length >= 3 && c.cnpj.includes(digits)))
      .slice(0, 6)
      .map((c) => ({ key: c.id, title: c.legalName, subtitle: formatCnpj(c.cnpj) }))
  }, [companyText, company, companies.data])

  const cityOptions = useMemo(() => {
    const names = new Set<string>()
    for (const l of ruleBase.data?.legislations ?? []) if (l.level === 'municipal' && l.city && l.uf === uf) names.add(l.city)
    for (const c of companies.data ?? []) if (c.address.state === uf && c.address.city) names.add(c.address.city)
    return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [ruleBase.data, companies.data, uf])

  if (catalog.error || ruleBase.error) return <ErrorState error={catalog.error ?? ruleBase.error} onRetry={() => void Promise.all([catalog.refetch(), ruleBase.refetch()])} />
  if (!catalog.data || !ruleBase.data) return <LoadingState />
  const base = ruleBase.data
  const snapshot = catalog.data

  const form = (): SimulationForm => ({
    company,
    cnpj,
    cnaes: cnaes
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry, index }) => index === 0 || entry.text.trim() !== '')
      .map(({ entry, index }) => ({ code: entry.code ?? '', description: entry.description, primary: index === 0 })),
    uf,
    city,
    referenceDate,
  })

  async function searchCnpj() {
    if (!isCnpjShapeValid(companyText)) {
      toast.info('Informe o CNPJ completo', 'São 14 caracteres. Para empresa já cadastrada, digite o nome e escolha na lista.')
      return
    }
    setSearching(true)
    try {
      const found = await searchCnpjForSimulation(ds, snapshot, companies.data ?? [], companyText)
      if (found.kind === 'empresa') {
        linkCompany(found.company)
        toast.success('Empresa cadastrada encontrada', 'CNAEs e localidade preenchidos a partir do cadastro.')
      } else {
        setCompany(null)
        setCnpj(found.cnpj)
        setCompanyText(formatCnpj(found.cnpj))
        fillCnaes(found.cnaes)
        if ((UFS as readonly string[]).includes(found.uf)) setUf(found.uf)
        if (found.city) setCity(found.city)
        toast.success('CNAEs preenchidos', ds.mode === 'demo' ? 'Dados fictícios de demonstração — confira antes de simular.' : found.legalName)
      }
    } catch (error) {
      toast.info('Consulta por CNPJ indisponível', `${errorMessage(error)} Informe os CNAEs manualmente.`)
    } finally {
      setSearching(false)
    }
  }

  async function execute(currentAnswers: Answers) {
    const current = form()
    const simulation = runSimulation(base, buildSimulationInput(snapshot, current, currentAnswers))
    setResult(simulation)
    setRun(null)
    setStep('result')
    if (!can('simulation:save')) {
      setSaveState('skipped')
      return
    }
    setSaveState('saving')
    try {
      setRun(await saveSimulationRun(ds, current, simulation))
      setSaveState('saved')
      void invalidate.runs()
    } catch (error) {
      setSaveState('error')
      toast.error('A simulação não foi salva no histórico', errorMessage(error))
    }
  }

  function simulate() {
    const current = form()
    const problem = validateSimulationForm(current)
    setFormError(problem)
    if (problem) return
    const needed = collectQuestions(base, current)
    setRequests(needed)
    const kept: Answers = {}
    for (const r of needed) kept[r.question.id] = answers[r.question.id]
    setAnswers(kept)
    if (needed.length > 0) setStep('questions')
    else void execute(kept)
  }

  function reset() {
    setCompany(null)
    setCompanyText('')
    setCnpj(null)
    setCnaes([EMPTY_CNAE])
    setReferenceDate(todayISO())
    setAnswers({})
    setRequests([])
    setResult(null)
    setRun(null)
    setSaveState('idle')
    setFormError(null)
    setStep('form')
  }

  const setCnae = (index: number, entry: CnaeEntry) => setCnaes((list) => list.map((c, i) => (i === index ? entry : c)))
  const summary = form()

  return (
    <div ref={topRef} className="scroll-mt-4 pt-[2px]">
      <SimulationNav current="nova" />

      {ds.mode === 'demo' ? (
        <p className="mb-3 flex items-start gap-2 rounded-xl border border-[#efd27a] bg-[#fff8e1] px-3.5 py-2.5 text-[12.5px] text-[#7a5600]">
          <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong>Modo demonstração.</strong> Teresina – PI: os documentos oficiais (LC nº 5.788/2022, LC nº 6.048/2023, Decreto nº 24.861/2023 e os Decretos nº 25.363/2023 e
            nº 28.436/2025) estão na biblioteca, e os dados extraídos deles só valem depois de aprovados em Configurações › Legislação › Importar legislação — até lá o resultado é
            “Regra não cadastrada”. Para testar sem importar, use a localidade fictícia{' '}
            <button type="button" className="font-semibold underline" onClick={() => { setUf('PI'); setCity(DEMO_CITY) }}>
              {DEMO_CITY} (PI)
            </button>
            , que tem uma norma de <strong>exemplo fictício</strong>. A legislação é mantida em{' '}
            <Link to="/configuracoes?secao=regras" className="font-semibold underline">
              Configurações › Legislação
            </Link>
            .
          </span>
        </p>
      ) : (
        base.legislations.length === 0 && (
          <p className="mb-3 flex items-start gap-2 rounded-xl border border-primary-line bg-primary-soft px-3.5 py-2.5 text-[12.5px] text-ink-soft">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>
              Ainda não há legislação cadastrada. As simulações retornarão “Regra não cadastrada” até que as normas sejam incluídas em{' '}
              <Link to="/configuracoes?secao=regras" className="font-semibold text-primary underline">
                Configurações › Legislação
              </Link>
              .
            </span>
          </p>
        )
      )}

      {step === 'form' && (
        <Card className="max-w-[980px] p-5">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              simulate()
            }}
            className="flex flex-col gap-4"
          >
            <Field label="CNPJ ou empresa cadastrada (opcional)" hint="A simulação pode ser feita só com o CNAE. Vincule uma empresa para depois aplicar o resultado ao cadastro dela.">
              {(p) => (
                <div className="flex gap-2">
                  <SuggestInput
                    {...p}
                    className="min-w-0 flex-1"
                    value={companyText}
                    options={companyOptions}
                    placeholder="00.000.000/0000-00 ou nome da empresa"
                    onChange={(text) => {
                      setCompanyText(text)
                      setCompany(null)
                      setCnpj(null)
                    }}
                    onSelect={(id) => {
                      const selected = companies.data?.find((c) => c.id === id)
                      if (selected) linkCompany(selected)
                    }}
                  />
                  <Button variant="secondary" onClick={searchCnpj} loading={searching} disabled={!companyText.trim() || !!company}>
                    Consultar por CNPJ
                  </Button>
                </div>
              )}
            </Field>
            {company && (
              <p className="-mt-2 flex w-fit items-center gap-2 rounded-lg bg-primary-soft px-2.5 py-1 text-[12.5px] text-primary">
                <Building className="size-3.5" aria-hidden /> Vinculada à empresa cadastrada <strong>{company.name}</strong>
                <button
                  type="button"
                  aria-label="Desvincular empresa"
                  className="rounded p-0.5 hover:bg-white/60"
                  onClick={() => {
                    setCompany(null)
                    setCompanyText('')
                  }}
                >
                  <X className="size-3.5" />
                </button>
              </p>
            )}

            <Field label="Informe o CNAE principal" required>
              {(p) => <CnaeInput {...p} value={cnaes[0] ?? EMPTY_CNAE} onChange={(entry) => setCnae(0, entry)} cnaes={cnaeCatalog} />}
            </Field>

            {cnaes.length > 1 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-[12px] font-semibold text-ink-soft">CNAEs secundários</legend>
                {cnaes.slice(1).map((entry, i) => (
                  <div key={i} className="flex gap-2">
                    <CnaeInput className="min-w-0 flex-1" aria-label={`CNAE secundário ${i + 1}`} value={entry} onChange={(next) => setCnae(i + 1, next)} cnaes={cnaeCatalog} />
                    <Button variant="ghost" aria-label={`Remover CNAE secundário ${i + 1}`} onClick={() => setCnaes((list) => list.filter((_, index) => index !== i + 1))} icon={<X className="size-4" />} />
                  </div>
                ))}
              </fieldset>
            )}
            <div>
              <Button variant="soft" size="sm" icon={<Plus className="size-4" />} onClick={() => setCnaes((list) => [...list, EMPTY_CNAE])}>
                Adicionar outro CNAE
              </Button>
              <span className="ml-2 text-[11.5px] text-muted">Todos os CNAEs informados são analisados, não só o principal.</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_minmax(0,1fr)_190px]">
              <Field label="UF" required>
                {(p) => (
                  <Select {...p} value={uf} onChange={(e) => setUf(e.target.value)}>
                    {UFS.map((code) => (
                      <option key={code} value={code}>
                        {UF_NAMES[code]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Município" required>
                {(p) => (
                  <>
                    <Input {...p} value={city} onChange={(e) => setCity(e.target.value)} list="simulation-cities" autoComplete="off" />
                    <datalist id="simulation-cities">
                      {cityOptions.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </>
                )}
              </Field>
              <Field label="Data de referência" required hint="Usa a legislação vigente nesta data.">
                {(p) => <Input {...p} type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} />}
              </Field>
            </div>

            {formError && (
              <p role="alert" className="flex items-center gap-2 text-[13px] text-danger-ink">
                <TriangleAlert className="size-4" aria-hidden /> {formError}
              </p>
            )}

            <div className="border-t border-line pt-4">
              <Button type="submit" className="h-11 px-6 text-[14px] tracking-wide uppercase" icon={<SearchCheck className="size-5" />}>
                Simular licenciamento
              </Button>
            </div>
          </form>
        </Card>
      )}

      {step === 'questions' && (
        <Card className="max-w-[980px] p-5">
          <h2 className="text-[18px] font-bold text-ink">Precisamos de algumas informações</h2>
          <p className="mb-4 text-[13px] text-ink-soft">Para determinar corretamente o enquadramento desta atividade, responda:</p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void execute(answers)
            }}
          >
            <Questionnaire requests={requests} answers={answers} onChange={setAnswers} />
            <p className="mt-4 text-[12px] text-muted">
              As perguntas vêm das condições cadastradas na legislação. Se deixar alguma em branco, o resultado ficará como “regra condicionada”.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              <Button variant="secondary" onClick={() => setStep('form')}>
                Voltar
              </Button>
              <Button type="submit" icon={<SearchCheck className="size-4" />}>
                Ver resultado
              </Button>
            </div>
          </form>
        </Card>
      )}

      {step === 'result' && result && (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1 text-[12.5px] text-ink-soft">
              <p className="text-[13.5px] font-semibold text-ink">
                {summary.company?.name ?? (summary.cnpj ? `CNPJ ${formatCnpj(summary.cnpj)}` : 'Simulação sem empresa vinculada')}
              </p>
              <p>
                {summary.cnaes.map((c) => formatCnae(c.code)).join(' · ')} — {city} – {uf} — referência {formatDate(referenceDate)}
              </p>
            </div>
            <SaveIndicator state={saveState} run={run} onRetry={() => void execute(answers)} />
            <Button variant="secondary" size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setStep('form')}>
              Alterar dados
            </Button>
          </Card>

          <ResultView result={result} />

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {run?.companyId && can('license:write') && (
              <Button icon={<Building className="size-4" />} onClick={() => setApplyOpen(true)}>
                Aplicar resultado à empresa
              </Button>
            )}
            <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={reset}>
              Nova simulação
            </Button>
            <Link to="/simulacao/historico" className="ml-auto text-[12.5px] font-medium text-link hover:underline">
              Ver simulações anteriores
            </Link>
          </div>
          {run && <ApplyToCompanyModal run={run} open={applyOpen} onClose={() => setApplyOpen(false)} />}
        </div>
      )}
    </div>
  )
}

function SaveIndicator({ state, run, onRetry }: { state: SaveState; run: SimulationRun | null; onRetry: () => void }) {
  if (state === 'saving') return <span className="text-[12px] text-muted">Salvando no histórico…</span>
  if (state === 'saved' && run) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-ok-soft px-2.5 py-1 text-[12px] font-semibold text-ok-ink">
        <CircleCheck className="size-3.5" aria-hidden /> Simulação nº {run.number} salva no histórico
      </span>
    )
  }
  if (state === 'error') {
    return (
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Salvar simulação
      </Button>
    )
  }
  if (state === 'skipped') return <span className="text-[12px] text-muted">Seu perfil não grava simulações no histórico.</span>
  return null
}
