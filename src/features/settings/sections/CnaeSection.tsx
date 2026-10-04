import { Plus, Trash } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useDataSource } from '@/app/data-context'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Form'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { useToast } from '@/components/ui/Toast'
import type { CatalogSnapshot } from '@/data/types'
import { errorMessage } from '@/data/errors'
import { formatCnae, normalizeCnae } from '@/domain/format'
import { APPLICABILITY_LABEL } from '@/domain/labels'
import { useInvalidate } from '@/hooks/queries'
import { SectionHeader } from './SectionHeader'

/** Matriz CNAE → setor → ajustes de licenças. */
export function CnaeSection({ catalog, readOnly }: { catalog: CatalogSnapshot; readOnly: boolean }) {
  const ds = useDataSource()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [sectorId, setSectorId] = useState('')
  const sectors = [...catalog.sectors].sort((a, b) => a.sortOrder - b.sortOrder)
  const sectorName = new Map(sectors.map((s) => [s.id, s.name]))
  const typeName = new Map(catalog.licenseTypes.map((t) => [t.id, t.name]))
  const cnaes = [...catalog.cnaes].sort((a, b) => a.code.localeCompare(b.code))

  async function run(fn: () => Promise<void>, success?: string) {
    try {
      await fn()
      await invalidate.catalog()
      if (success) toast.success(success)
    } catch (error) {
      toast.error('Não foi possível salvar', errorMessage(error))
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    if (normalizeCnae(code).length !== 7) {
      toast.error('CNAE inválido', 'Informe os 7 dígitos (ex.: 5611-2/01).')
      return
    }
    await run(async () => {
      const cnae = await ds.catalog.saveCnae({ code, description })
      if (sectorId) await ds.catalog.saveCnaeSectorRule({ cnaeId: cnae.id, sectorId, priority: 1 })
      setCode('')
      setDescription('')
      setSectorId('')
    }, 'CNAE salvo')
  }

  return (
    <div>
      <SectionHeader
        title="Matriz CNAE → setor → licenças"
        description="Fluxo do cadastro: CNPJ → CNAE → setor sugerido → perfil de licenciamento → licenças sugeridas. Sempre editável pelo administrador."
      />
      {!readOnly && (
        <form onSubmit={add} className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[140px_minmax(0,1fr)_200px_auto]">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="5611-2/01" aria-label="Código CNAE" />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição" aria-label="Descrição" />
          <Select value={sectorId} onChange={(e) => setSectorId(e.target.value)} aria-label="Setor sugerido">
            <option value="">Sem setor sugerido</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Button type="submit" icon={<Plus className="size-4" />}>
            Salvar CNAE
          </Button>
        </form>
      )}
      <TableFrame>
        <Table className="text-[12.5px]">
          <THead>
            <tr className="h-[34px]">
              <TH>CNAE</TH>
              <TH>Descrição</TH>
              <TH>Setor sugerido</TH>
              <TH>Ajustes de licença</TH>
            </tr>
          </THead>
          <tbody>
            {cnaes.map((c) => {
              const rule = catalog.cnaeSectorRules.find((r) => r.cnaeId === c.id)
              const licenseRules = catalog.cnaeLicenseRules.filter((r) => r.cnaeId === c.id)
              return (
                <TR key={c.id} className="h-[40px] align-top">
                  <TD className="tabular py-2 whitespace-nowrap">{formatCnae(c.code)}</TD>
                  <TD className="py-2">{c.description}</TD>
                  <TD className="py-2">
                    <Select
                      aria-label={`Setor sugerido para ${formatCnae(c.code)}`}
                      value={rule?.sectorId ?? ''}
                      disabled={readOnly}
                      onChange={(e) =>
                        run(() =>
                          e.target.value
                            ? ds.catalog.saveCnaeSectorRule({ cnaeId: c.id, sectorId: e.target.value, priority: 1 })
                            : rule
                              ? ds.catalog.deleteCnaeSectorRule(rule.id)
                              : Promise.resolve(),
                        )
                      }
                      className="h-[30px] w-[190px] text-[12.5px]"
                    >
                      <option value="">—</option>
                      {sectors.map((s) => (
                        <option key={s.id} value={s.id}>
                          {sectorName.get(s.id)}
                        </option>
                      ))}
                    </Select>
                  </TD>
                  <TD className="py-2">
                    {licenseRules.length === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {licenseRules.map((r) => (
                          <li key={r.id} className="flex items-center gap-1.5">
                            <span>
                              {typeName.get(r.licenseTypeId)}: <strong>{APPLICABILITY_LABEL[r.applicability]}</strong>
                            </span>
                            {!readOnly && (
                              <button type="button" onClick={() => run(() => ds.catalog.deleteCnaeLicenseRule(r.id))} className="text-muted hover:text-danger-ink" aria-label="Remover ajuste">
                                <Trash className="size-3.5" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TD>
                </TR>
              )
            })}
          </tbody>
        </Table>
      </TableFrame>
    </div>
  )
}
