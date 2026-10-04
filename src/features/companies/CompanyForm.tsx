import { zodResolver } from '@hookform/resolvers/zod'
import { Sparkles, WandSparkles } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useDataSource } from '@/app/data-context'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { useToast } from '@/components/ui/Toast'
import type { CatalogSnapshot, CompanyInput, CompanyLicenseInput } from '@/data/types'
import { errorMessage } from '@/data/errors'
import { formatCnpj, isCnpjChecksumValid, isCnpjShapeValid } from '@/domain/cnpj'
import { formatCnae } from '@/domain/format'
import { APPLICABILITY_LABEL, COMPANY_STATUS_LABEL } from '@/domain/labels'
import type { LicenseApplicability } from '@/domain/types'
import { demoCnpjLookup, pendingCnpjLookup } from '@/integrations/cnpj/cnpj-lookup'
import { suggestLicensesFor, suggestSectorForCnaes, toLicenseInputs } from '@/services/company-service'
import { companySchema, parseCnaeList, UFS, valuesToInput, type CompanyFormValues } from './company-schema'

const APPLICABILITY = Object.entries(APPLICABILITY_LABEL) as [LicenseApplicability, string][]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-6">
      <legend className="mb-2 text-[13px] font-bold tracking-wide text-ink uppercase">{title}</legend>
      {children}
    </fieldset>
  )
}

export function CompanyForm({
  mode,
  catalog,
  initialValues,
  photoUrl = null,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit'
  catalog: CatalogSnapshot
  initialValues: CompanyFormValues
  photoUrl?: string | null
  onSubmit: (input: CompanyInput, licenses: CompanyLicenseInput[]) => Promise<void>
  onCancel?: () => void
}) {
  const ds = useDataSource()
  const toast = useToast()
  const lookup = ds.mode === 'demo' ? demoCnpjLookup : pendingCnpjLookup
  const [lookingUp, setLookingUp] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, LicenseApplicability>>({})

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CompanyFormValues>({ resolver: zodResolver(companySchema), defaultValues: initialValues })

  useEffect(() => reset(initialValues), [initialValues, reset])

  const [cnpj, mainCnae, secondaryCnaes, sectorId] = useWatch({ control, name: ['cnpj', 'mainCnae', 'secondaryCnaes', 'sectorId'] })
  const cnaeCodes = useMemo(() => [...parseCnaeList(mainCnae ?? ''), ...parseCnaeList(secondaryCnaes ?? '')], [mainCnae, secondaryCnaes])
  const sectorSuggestion = useMemo(() => suggestSectorForCnaes(catalog, cnaeCodes), [catalog, cnaeCodes])
  const suggestions = useMemo(() => (sectorId ? suggestLicensesFor(catalog, sectorId, cnaeCodes) : []), [catalog, sectorId, cnaeCodes])
  const typeById = new Map(catalog.licenseTypes.map((t) => [t.id, t]))
  const sectors = catalog.sectors.filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder)
  const checksumWarning = cnpj && isCnpjShapeValid(cnpj) && !isCnpjChecksumValid(cnpj)

  async function fillFromCnpj() {
    setLookingUp(true)
    try {
      const data = await lookup.lookup(cnpj ?? '')
      setValue('legalName', data.legalName, { shouldDirty: true })
      setValue('tradeName', data.tradeName, { shouldDirty: true })
      setValue('mainCnae', data.mainCnae ? formatCnae(data.mainCnae) : '', { shouldDirty: true })
      setValue('secondaryCnaes', data.secondaryCnaes.map(formatCnae).join(', '), { shouldDirty: true })
      setValue('street', data.address.street, { shouldDirty: true })
      setValue('number', data.address.number, { shouldDirty: true })
      setValue('district', data.address.district, { shouldDirty: true })
      setValue('city', data.address.city, { shouldDirty: true })
      if ((UFS as readonly string[]).includes(data.address.state)) setValue('state', data.address.state as CompanyFormValues['state'], { shouldDirty: true })
      setValue('zipCode', data.address.zipCode, { shouldDirty: true })
      setValue('phone', data.phone, { shouldDirty: true })
      setValue('email', data.email, { shouldDirty: true })
      toast.success('Dados preenchidos', lookup.available && ds.mode === 'demo' ? 'Dados fictícios de demonstração — revise antes de salvar.' : undefined)
    } catch (error) {
      toast.info('Preenchimento automático indisponível', errorMessage(error))
    } finally {
      setLookingUp(false)
    }
  }

  const submit = handleSubmit(async (values) => {
    const licenses = toLicenseInputs(
      catalog,
      suggestions.map((s) => ({ ...s, applicability: overrides[s.licenseTypeId] ?? s.applicability })),
    )
    await onSubmit(valuesToInput(values, photoUrl), mode === 'create' ? licenses : [])
  })

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <Section title="Identificação">
        <Field label="CNPJ" required error={errors.cnpj?.message} hint={checksumWarning ? 'Atenção: dígitos verificadores não conferem. Confira o número.' : 'Aceita CNPJ numérico e alfanumérico.'} className="sm:col-span-3">
          {(p) => (
            <div className="flex gap-2">
              <Input
                {...p}
                {...register('cnpj', { onChange: (e) => setValue('cnpj', formatCnpj(e.target.value)) })}
                placeholder="00.000.000/0000-00"
                autoComplete="off"
                className="tabular uppercase"
              />
              <Button variant="secondary" onClick={fillFromCnpj} loading={lookingUp} disabled={!cnpj || !isCnpjShapeValid(cnpj)} icon={<WandSparkles className="size-4" />}>
                Buscar dados
              </Button>
            </div>
          )}
        </Field>
        <Field label="Status" required className="sm:col-span-3">
          {(p) => (
            <Select {...p} {...register('status')}>
              {Object.entries(COMPANY_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Razão social" required error={errors.legalName?.message} className="sm:col-span-3">
          {(p) => <Input {...p} {...register('legalName')} />}
        </Field>
        <Field label="Nome fantasia" className="sm:col-span-3">
          {(p) => <Input {...p} {...register('tradeName')} />}
        </Field>
        <Field label="CNAE principal" error={errors.mainCnae?.message} className="sm:col-span-2">
          {(p) => <Input {...p} {...register('mainCnae')} placeholder="5611-2/01" />}
        </Field>
        <Field label="CNAEs secundários" error={errors.secondaryCnaes?.message} hint="Separe por vírgula" className="sm:col-span-4">
          {(p) => <Input {...p} {...register('secondaryCnaes')} placeholder="5611-2/03, 4721-1/02" />}
        </Field>
        <Field label="Setor" required error={errors.sectorId?.message} className="sm:col-span-3">
          {(p) => (
            <Select {...p} {...register('sectorId')}>
              <option value="">Selecione…</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex items-end sm:col-span-3">
          {sectorSuggestion && sectorSuggestion.sectorId !== sectorId && (
            <p className="flex flex-wrap items-center gap-2 rounded-lg bg-[#f3f7fc] px-3 py-2 text-[12px] text-ink-soft">
              <Sparkles className="size-4 text-primary" aria-hidden />
              CNAE {formatCnae(sectorSuggestion.cnaeCode)} sugere <strong>{catalog.sectors.find((s) => s.id === sectorSuggestion.sectorId)?.name}</strong>
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setValue('sectorId', sectorSuggestion.sectorId, { shouldDirty: true, shouldValidate: true })}>
                Aplicar
              </button>
            </p>
          )}
        </div>
      </Section>

      <Section title="Endereço e contato">
        <Field label="Logradouro" className="sm:col-span-3">{(p) => <Input {...p} {...register('street')} />}</Field>
        <Field label="Número" className="sm:col-span-1">{(p) => <Input {...p} {...register('number')} />}</Field>
        <Field label="Complemento" className="sm:col-span-2">{(p) => <Input {...p} {...register('complement')} />}</Field>
        <Field label="Bairro" className="sm:col-span-2">{(p) => <Input {...p} {...register('district')} />}</Field>
        <Field label="Município" required error={errors.city?.message} className="sm:col-span-2">{(p) => <Input {...p} {...register('city')} />}</Field>
        <Field label="UF" required error={errors.state?.message} className="sm:col-span-1">
          {(p) => (
            <Select {...p} {...register('state')}>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="CEP" className="sm:col-span-1">{(p) => <Input {...p} {...register('zipCode')} />}</Field>
        <Field label="Telefone" className="sm:col-span-2">{(p) => <Input {...p} {...register('phone')} type="tel" />}</Field>
        <Field label="E-mail" error={errors.email?.message} className="sm:col-span-2">{(p) => <Input {...p} {...register('email')} type="email" />}</Field>
        <Field label="Responsável" className="sm:col-span-2">{(p) => <Input {...p} {...register('responsibleName')} />}</Field>
        {mode === 'create' && (
          <Field label="Observações" className="sm:col-span-6">{(p) => <Textarea {...p} {...register('notes')} />}</Field>
        )}
      </Section>

      {mode === 'create' && (
        <fieldset>
          <legend className="mb-1 text-[13px] font-bold tracking-wide text-ink uppercase">Licenças sugeridas</legend>
          <p className="mb-3 text-[12px] text-muted">
            Sugestão pelo perfil do setor e pelos CNAEs. Não é uma obrigação legal: confirme a aplicabilidade de cada licença.
          </p>
          {!sectorId ? (
            <p className="rounded-lg bg-[#f6f9fc] px-3 py-3 text-[12.5px] text-muted">Selecione o setor para ver as licenças sugeridas.</p>
          ) : suggestions.length === 0 ? (
            <p className="rounded-lg bg-[#f6f9fc] px-3 py-3 text-[12.5px] text-muted">Nenhuma licença configurada para este setor.</p>
          ) : (
            <ul className="divide-y divide-line-soft rounded-lg border border-line">
              {suggestions.map((s) => {
                const type = typeById.get(s.licenseTypeId)
                return (
                  <li key={s.licenseTypeId} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-ink">{type?.name}</p>
                      <p className="text-[11.5px] text-muted">
                        {type?.agency} · {s.reason}
                      </p>
                    </div>
                    <Select
                      aria-label={`Aplicabilidade de ${type?.name}`}
                      value={overrides[s.licenseTypeId] ?? s.applicability}
                      onChange={(e) => setOverrides((o) => ({ ...o, [s.licenseTypeId]: e.target.value as LicenseApplicability }))}
                      className="h-[30px] w-[150px] text-[12.5px]"
                    >
                      {APPLICABILITY.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </li>
                )
              })}
            </ul>
          )}
        </fieldset>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={isSubmitting} disabled={mode === 'edit' && !isDirty}>
          {mode === 'create' ? 'Cadastrar empresa' : 'Salvar alterações'}
        </Button>
      </div>
    </form>
  )
}

