import { CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/data/errors'
import { combineLocalDateTime, todayISO } from '@/domain/dates'
import { formatCnpj } from '@/domain/cnpj'
import { LICENSE_SITUATION_LABEL } from '@/domain/labels'
import type { EvaluatedLicense } from '@/domain/monitoring'
import type { Company, ConsultationOutcome, LicenseSituation } from '@/domain/types'
import { useInvalidate } from '@/hooks/queries'
import { useConsultationContext } from '@/hooks/useConsultationContext'
import { registerConsultation, type ConsultationResult } from '@/services/consultation-service'
import { ChangeComparison } from '../consultations/ChangeComparison'
import { agencyLabel, providerLabel } from './license-labels'

const SITUATIONS = Object.entries(LICENSE_SITUATION_LABEL) as [LicenseSituation, string][]

function nowTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface FormState {
  licenseId: string
  date: string
  time: string
  outcome: ConsultationOutcome
  situation: LicenseSituation | ''
  expiresAt: string
  issuedAt: string
  providerCode: string
  sourceLabel: string
  documentNumber: string
  protocolNumber: string
  notes: string
  errorMessage: string
  responsibleName: string
}

/**
 * "Registrar consulta": enquanto não há integração, a consulta é feita no site do órgão
 * e registrada aqui. Cada registro vira um novo item do histórico.
 */
export function RegisterConsultationModal({
  open,
  onClose,
  company,
  licenses,
  initialLicenseId,
}: {
  open: boolean
  onClose: () => void
  company: Company
  licenses: EvaluatedLicense[]
  initialLicenseId: string | null
}) {
  const ctx = useConsultationContext()
  const { user } = useSession()
  const toast = useToast()
  const invalidate = useInvalidate()
  const selectable = useMemo(() => licenses.filter((l) => l.license.applicability !== 'nao_aplicavel'), [licenses])

  const initial = (licenseId: string | null): FormState => {
    const e = selectable.find((l) => l.license.id === licenseId) ?? selectable[0]
    return {
      licenseId: e?.license.id ?? '',
      date: todayISO(),
      time: nowTime(),
      outcome: 'sucesso',
      situation: '',
      expiresAt: '',
      issuedAt: '',
      providerCode: e?.license.providerCode ?? '',
      sourceLabel: ctx && e ? providerLabel(ctx.catalog, e.license.providerCode) : '',
      documentNumber: '',
      protocolNumber: '',
      notes: '',
      errorMessage: '',
      responsibleName: user?.fullName ?? '',
    }
  }

  const [form, setForm] = useState<FormState>(() => initial(initialLicenseId))
  const [file, setFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<ConsultationResult | null>(null)

  useEffect(() => {
    if (open) {
      setForm(initial(initialLicenseId))
      setFile(null)
      setErrors({})
      setResult(null)
    }
    // reinicia somente ao abrir
  }, [open, initialLicenseId])

  const selected = selectable.find((l) => l.license.id === form.licenseId)
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  function validate(): boolean {
    const e: typeof errors = {}
    if (!form.licenseId) e.licenseId = 'Selecione a licença.'
    if (!form.date) e.date = 'Informe a data.'
    if (!form.time) e.time = 'Informe a hora.'
    if (form.outcome === 'sucesso' && !form.situation) e.situation = 'Informe a situação encontrada.'
    if (form.outcome === 'erro' && !form.errorMessage.trim()) e.errorMessage = 'Descreva o erro.'
    if (form.expiresAt && form.issuedAt && form.expiresAt < form.issuedAt) e.expiresAt = 'A validade não pode ser anterior à emissão.'
    if (!form.responsibleName.trim()) e.responsibleName = 'Informe o responsável.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!ctx || !validate()) return
    setSaving(true)
    try {
      const r = await registerConsultation(ctx, {
        companyLicenseId: form.licenseId,
        consultedAt: combineLocalDateTime(form.date, form.time),
        outcome: form.outcome,
        situation: form.outcome === 'sucesso' ? (form.situation as LicenseSituation) : null,
        expiresAt: form.expiresAt || null,
        issuedAt: form.issuedAt || null,
        providerCode: form.providerCode || null,
        sourceLabel: form.sourceLabel || null,
        documentNumber: form.documentNumber || null,
        protocolNumber: form.protocolNumber || null,
        notes: form.notes || null,
        errorMessage: form.errorMessage || null,
        responsibleName: form.responsibleName,
        file,
      })
      setResult(r)
      await invalidate.afterConsultation()
      toast.success('Consulta registrada no histórico')
    } catch (error) {
      toast.error('Não foi possível registrar a consulta', errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const licenseName = selected?.type.name ?? 'Licença'

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={result ? 'Consulta registrada' : 'Registrar consulta'}
      description={`${company.legalName} · CNPJ ${formatCnpj(company.cnpj)}`}
      footer={
        result ? (
          <Button onClick={onClose}>Concluir</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" form="register-consultation" loading={saving}>
              Salvar no histórico
            </Button>
          </>
        )
      }
    >
      {result ? (
        <ResultView result={result} licenseName={licenseName} />
      ) : (
        <form id="register-consultation" onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
          <Field label="Empresa" className="sm:col-span-2">
            {(p) => <Input {...p} value={company.legalName} readOnly disabled />}
          </Field>
          <Field label="Licença" required error={errors.licenseId} className="sm:col-span-2">
            {(p) => (
              <Select
                {...p}
                value={form.licenseId}
                onChange={(e) => {
                  const next = selectable.find((l) => l.license.id === e.target.value)
                  setForm((f) => ({
                    ...f,
                    licenseId: e.target.value,
                    providerCode: next?.license.providerCode ?? '',
                    sourceLabel: ctx && next ? providerLabel(ctx.catalog, next.license.providerCode) : '',
                  }))
                }}
              >
                {selectable.map((l) => (
                  <option key={l.license.id} value={l.license.id}>
                    {l.type.name} — {agencyLabel(l.type, company)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data" required error={errors.date}>
              {(p) => <Input {...p} type="date" value={form.date} max={todayISO()} onChange={(e) => set('date', e.target.value)} />}
            </Field>
            <Field label="Hora" required error={errors.time}>
              {(p) => <Input {...p} type="time" value={form.time} onChange={(e) => set('time', e.target.value)} />}
            </Field>
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-[12px] font-semibold text-ink-soft">Resultado da consulta</legend>
            <div className="flex h-[34px] gap-2">
              {(['sucesso', 'erro'] as const).map((o) => (
                <label
                  key={o}
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border text-[12.5px] ${form.outcome === o ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-[#d9e1ec] text-ink-soft'}`}
                >
                  <input type="radio" name="outcome" value={o} checked={form.outcome === o} onChange={() => set('outcome', o)} className="sr-only" />
                  {o === 'sucesso' ? 'Consulta realizada' : 'Erro na consulta'}
                </label>
              ))}
            </div>
          </fieldset>

          {form.outcome === 'sucesso' ? (
            <>
              <Field label="Situação" required error={errors.situation}>
                {(p) => (
                  <Select {...p} value={form.situation} onChange={(e) => set('situation', e.target.value as LicenseSituation)}>
                    <option value="">Selecione…</option>
                    {SITUATIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Validade" error={errors.expiresAt} hint={selected && !selected.type.hasExpiration ? 'Licença sem validade' : undefined}>
                  {(p) => <Input {...p} type="date" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} />}
                </Field>
                <Field label="Emissão">
                  {(p) => <Input {...p} type="date" value={form.issuedAt} onChange={(e) => set('issuedAt', e.target.value)} />}
                </Field>
              </div>
            </>
          ) : (
            <Field label="Erro ocorrido" required error={errors.errorMessage} className="sm:col-span-1">
              {(p) => <Input {...p} value={form.errorMessage} placeholder="Ex.: site do órgão indisponível" onChange={(e) => set('errorMessage', e.target.value)} />}
            </Field>
          )}

          <Field label="Órgão / Fonte">
            {(p) => (
              <Select
                {...p}
                value={form.providerCode}
                onChange={(e) => {
                  const code = e.target.value
                  setForm((f) => ({ ...f, providerCode: code, sourceLabel: ctx ? (code ? providerLabel(ctx.catalog, code) : 'Manual') : f.sourceLabel }))
                }}
              >
                <option value="">Outra fonte (manual)</option>
                {ctx?.catalog.providers.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name} — {p.agency}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Descrição da fonte" hint="Como aparecerá no histórico">
            {(p) => <Input {...p} value={form.sourceLabel} onChange={(e) => set('sourceLabel', e.target.value)} />}
          </Field>
          <Field label="Número do documento">
            {(p) => <Input {...p} value={form.documentNumber} onChange={(e) => set('documentNumber', e.target.value)} />}
          </Field>
          <Field label="Número do protocolo">
            {(p) => <Input {...p} value={form.protocolNumber} onChange={(e) => set('protocolNumber', e.target.value)} />}
          </Field>
          <Field label="Responsável pela consulta" required error={errors.responsibleName}>
            {(p) => <Input {...p} value={form.responsibleName} onChange={(e) => set('responsibleName', e.target.value)} />}
          </Field>
          <Field label="Arquivo / documento" hint="PDF ou imagem do comprovante (opcional)">
            {(p) => (
              <Input
                {...p}
                type="file"
                accept=".pdf,image/*"
                className="py-1.5 text-[12px] file:mr-3 file:rounded-md file:border-0 file:bg-primary-soft file:px-2.5 file:py-1 file:text-[12px] file:font-semibold file:text-primary"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            )}
          </Field>
          <Field label="Observação" className="sm:col-span-2">
            {(p) => <Textarea {...p} value={form.notes} onChange={(e) => set('notes', e.target.value)} />}
          </Field>
          <p className="flex items-start gap-2 rounded-lg bg-[#f3f7fc] p-2.5 text-[12px] text-ink-soft sm:col-span-2">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            O resultado anterior nunca é apagado: esta consulta será comparada com a última e gravada como um novo registro.
          </p>
        </form>
      )}
    </Modal>
  )
}

function ResultView({ result, licenseName }: { result: ConsultationResult; licenseName: string }) {
  const { detection, previous, consultation } = result
  if (consultation.outcome === 'erro') {
    return (
      <Notice tone="warn" title="Consulta com erro registrada" text={`O erro foi guardado no histórico de ${licenseName} e um alerta foi criado. A situação atual da licença não mudou.`} />
    )
  }
  if (!detection.comparable || !previous) {
    return <Notice tone="info" title="Primeira consulta registrada" text={`Não havia consulta anterior bem-sucedida de ${licenseName} para comparar.`} />
  }
  if (!detection.changed) {
    return (
      <div className="space-y-3">
        <Notice tone="ok" title="Nenhuma alteração identificada." text={`A consulta de ${licenseName} confirma o resultado anterior.`} />
        <ChangeComparison previous={previous} current={consultation} changes={[]} />
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <Notice tone="warn" title="Alteração detectada." text={`A alteração de ${licenseName} foi registrada e um alerta foi gerado.`} />
      <ChangeComparison previous={previous} current={consultation} changes={detection.changes} />
    </div>
  )
}

function Notice({ tone, title, text }: { tone: 'ok' | 'warn' | 'info'; title: string; text: string }) {
  const Icon = tone === 'ok' ? CircleCheck : tone === 'warn' ? TriangleAlert : Info
  const cls = tone === 'ok' ? 'bg-ok-soft text-ok-ink' : tone === 'warn' ? 'bg-warn-soft text-warn-ink' : 'bg-primary-soft text-primary'
  return (
    <div className={`flex items-start gap-3 rounded-xl p-3.5 ${cls}`} role="status">
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div>
        <p className="text-[14px] font-bold">{title}</p>
        <p className="text-[12.5px] text-ink-soft">{text}</p>
      </div>
    </div>
  )
}
