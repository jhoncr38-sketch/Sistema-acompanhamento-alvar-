import { Pencil, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useDataSource } from '@/app/data-context'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { useToast } from '@/components/ui/Toast'
import type { CatalogSnapshot } from '@/data/types'
import { errorMessage } from '@/data/errors'
import type { AgencyScope, LicenseType } from '@/domain/types'
import { useInvalidate } from '@/hooks/queries'
import { SectionHeader } from './SectionHeader'

const SCOPE_LABEL: Record<AgencyScope, string> = {
  municipal: 'Municipal',
  estadual: 'Estadual',
  federal: 'Federal',
  conselho: 'Conselho de classe',
}

type Draft = Omit<LicenseType, 'id'> & { id?: string }

function toCode(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^(licenca|registro|certificado)( de| da| do| no| na)? /, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40)
}

/** Catálogo de licenças: novas licenças entram aqui e depois nos perfis de setor e nas empresas. */
export function LicenseTypesSection({ catalog, readOnly }: { catalog: CatalogSnapshot; readOnly: boolean }) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const types = [...catalog.licenseTypes].sort((a, b) => a.sortOrder - b.sortOrder)
  const providerName = new Map(catalog.providers.map((p) => [p.code, p.name]))

  const startNew = () =>
    setDraft({
      code: '',
      name: '',
      shortName: '',
      agency: '',
      agencyScope: 'municipal',
      defaultProviderCode: null,
      hasExpiration: true,
      sortOrder: Math.max(0, ...types.map((t) => t.sortOrder)) + 1,
      active: true,
    })

  return (
    <div>
      <SectionHeader
        title="Tipos de licença"
        description="Licenças, registros e certificados que o escritório pode monitorar. Depois de cadastrar, inclua a licença no perfil dos setores (Licenças por setor) ou diretamente na empresa (aba Editar)."
        actions={
          !readOnly && (
            <Button icon={<Plus className="size-4" />} onClick={startNew}>
              Nova licença
            </Button>
          )
        }
      />
      <TableFrame>
        <Table className="text-[12.5px]">
          <THead>
            <tr className="h-[34px]">
              <TH>Licença</TH>
              <TH>Órgão</TH>
              <TH>Esfera</TH>
              <TH>Fonte padrão</TH>
              <TH>Validade</TH>
              <TH>Situação</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {types.map((t) => (
              <TR key={t.id} className="h-[40px]">
                <TD>
                  <p className="font-semibold text-ink">{t.name}</p>
                  <p className="text-[11.5px] text-muted">{t.shortName}</p>
                </TD>
                <TD>{t.agency}</TD>
                <TD>{SCOPE_LABEL[t.agencyScope]}</TD>
                <TD>{t.defaultProviderCode ? (providerName.get(t.defaultProviderCode) ?? t.defaultProviderCode) : 'Manual'}</TD>
                <TD>{t.hasExpiration ? 'Com validade' : 'Sem validade'}</TD>
                <TD>
                  <Badge tone={t.active ? 'ok' : 'neutral'}>{t.active ? 'Ativa' : 'Inativa'}</Badge>
                </TD>
                <TD className="text-right">
                  {!readOnly && (
                    <Button size="xs" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setDraft(t)} aria-label={`Editar ${t.name}`}>
                      Editar
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </TableFrame>
      {draft && <LicenseTypeModal key={draft.id ?? 'nova'} draft={draft} catalog={catalog} onClose={() => setDraft(null)} />}
    </div>
  )
}

function LicenseTypeModal({ draft, catalog, onClose }: { draft: Draft; catalog: CatalogSnapshot; onClose: () => void }) {
  const ds = useDataSource()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [current, setCurrent] = useState<Draft>(draft)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const isNew = !draft.id

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setCurrent((f) => ({ ...f, [key]: value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const code = isNew ? toCode(current.name) : current.code
    if (!current.name.trim() || !current.shortName.trim() || !current.agency.trim() || !code) {
      setError('Preencha nome, nome curto e órgão.')
      return
    }
    if (isNew && catalog.licenseTypes.some((t) => t.code === code)) {
      setError('Já existe uma licença com nome equivalente.')
      return
    }
    setSaving(true)
    try {
      await ds.catalog.saveLicenseType({ ...current, code, name: current.name.trim(), shortName: current.shortName.trim(), agency: current.agency.trim() })
      await invalidate.catalog()
      toast.success(isNew ? 'Licença cadastrada' : 'Licença atualizada')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Nova licença' : 'Editar licença'}
      description={isNew ? 'Ex.: Certificado de Inspeção, Registro em conselho, Licença de Publicidade.' : draft.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="license-type-form" loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="license-type-form" onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
        <Field label="Nome" required className="sm:col-span-2">
          {(p) => <Input {...p} value={current.name} onChange={(e) => set('name', e.target.value)} placeholder="Certificado de Inspeção" />}
        </Field>
        <Field label="Nome curto" required hint="Usado nas tabelas e no histórico">
          {(p) => <Input {...p} value={current.shortName} onChange={(e) => set('shortName', e.target.value)} placeholder="Inspeção" maxLength={18} />}
        </Field>
        <Field label="Órgão emissor" required>
          {(p) => <Input {...p} value={current.agency} onChange={(e) => set('agency', e.target.value)} placeholder="Prefeitura" />}
        </Field>
        <Field label="Esfera" hint="Municipal mostra o município ao lado do órgão">
          {(p) => (
            <Select {...p} value={current.agencyScope} onChange={(e) => set('agencyScope', e.target.value as AgencyScope)}>
              {Object.entries(SCOPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Fonte padrão da consulta">
          {(p) => (
            <Select {...p} value={current.defaultProviderCode ?? ''} onChange={(e) => set('defaultProviderCode', e.target.value || null)}>
              <option value="">Manual</option>
              {catalog.providers.map((pr) => (
                <option key={pr.code} value={pr.code}>
                  {pr.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" checked={current.hasExpiration} onChange={(e) => set('hasExpiration', e.target.checked)} className="size-4 accent-[#0c6cf0]" />
          Possui data de validade
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" checked={current.active} onChange={(e) => set('active', e.target.checked)} className="size-4 accent-[#0c6cf0]" />
          Ativa (disponível para monitorar)
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
