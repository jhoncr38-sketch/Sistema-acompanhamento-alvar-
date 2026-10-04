import { Plus, Trash } from 'lucide-react'
import { useState } from 'react'
import { useDataSource } from '@/app/data-context'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Form'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { useToast } from '@/components/ui/Toast'
import type { CatalogSnapshot } from '@/data/types'
import { errorMessage } from '@/data/errors'
import { APPLICABILITY_LABEL } from '@/domain/labels'
import type { LicenseApplicability, SectorLicenseRule } from '@/domain/types'
import { useInvalidate } from '@/hooks/queries'
import { SectionHeader } from './SectionHeader'

const APPLICABILITY = Object.entries(APPLICABILITY_LABEL) as [LicenseApplicability, string][]

/** Perfil de licenciamento por setor: licenças sugeridas, aplicabilidade inicial e colunas da tabela do setor. */

/** Colunas de licença na tabela do setor: as 4 do layout aprovado + a Licença de Acessibilidade. */
const MAX_COLUMNS = 5

export function SectorRulesSection({ catalog, readOnly }: { catalog: CatalogSnapshot; readOnly: boolean }) {
  const ds = useDataSource()
  const toast = useToast()
  const invalidate = useInvalidate()
  const sectors = [...catalog.sectors].sort((a, b) => a.sortOrder - b.sortOrder)
  const [sectorId, setSectorId] = useState(sectors[0]?.id ?? '')
  const [newType, setNewType] = useState('')
  const types = new Map(catalog.licenseTypes.map((t) => [t.id, t]))
  const rules = catalog.sectorLicenseRules
    .filter((r) => r.sectorId === sectorId)
    .sort((a, b) => (types.get(a.licenseTypeId)?.sortOrder ?? 0) - (types.get(b.licenseTypeId)?.sortOrder ?? 0))
  const used = new Set(rules.map((r) => r.licenseTypeId))
  const columns = rules.filter((r) => r.showInTable).length

  async function run(fn: () => Promise<void>) {
    try {
      await fn()
      await invalidate.catalog()
    } catch (error) {
      toast.error('Não foi possível salvar', errorMessage(error))
    }
  }

  const save = (rule: SectorLicenseRule, patch: Partial<SectorLicenseRule>) => run(() => ds.catalog.saveSectorLicenseRule({ ...rule, ...patch }))

  return (
    <div>
      <SectionHeader
        title="Licenças por setor"
        description="Configuração inicial sugerida a novas empresas do setor. Não define obrigação legal: em cada empresa a licença pode ser marcada como aplicável, não aplicável, dispensada ou em análise."
      />
      <Select value={sectorId} onChange={(e) => setSectorId(e.target.value)} aria-label="Setor" className="mb-3 w-auto min-w-[240px]">
        {sectors.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <TableFrame>
        <Table className="text-[12.5px]">
          <THead>
            <tr className="h-[34px]">
              <TH>Licença</TH>
              <TH>Aplicabilidade sugerida</TH>
              <TH className="text-center">Coluna na tabela do setor</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {rules.map((r) => (
              <TR key={r.id} className="h-[40px]">
                <TD>
                  <p className="font-semibold text-ink">{types.get(r.licenseTypeId)?.name}</p>
                  {r.notes && <p className="text-[11.5px] text-muted">{r.notes}</p>}
                </TD>
                <TD>
                  <Select
                    aria-label="Aplicabilidade sugerida"
                    value={r.defaultApplicability}
                    disabled={readOnly}
                    onChange={(e) => save(r, { defaultApplicability: e.target.value as LicenseApplicability })}
                    className="h-[30px] w-[160px] text-[12.5px]"
                  >
                    {APPLICABILITY.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </TD>
                <TD className="text-center">
                  <input
                    type="checkbox"
                    aria-label="Mostrar como coluna"
                    checked={r.showInTable}
                    disabled={readOnly || (!r.showInTable && columns >= MAX_COLUMNS)}
                    title={!r.showInTable && columns >= MAX_COLUMNS ? `Máximo de ${MAX_COLUMNS} colunas na tabela do setor` : undefined}
                    onChange={(e) => save(r, { showInTable: e.target.checked })}
                    className="size-4 accent-[#0c6cf0]"
                  />
                </TD>
                <TD className="text-right">
                  {!readOnly && (
                    <Button size="xs" variant="ghost" icon={<Trash className="size-3.5" />} onClick={() => run(() => ds.catalog.deleteSectorLicenseRule(r.id))} aria-label="Remover do perfil">
                      Remover
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </TableFrame>
      {!readOnly && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={newType} onChange={(e) => setNewType(e.target.value)} aria-label="Licença" className="h-[32px] w-auto min-w-[220px] text-[12.5px]">
            <option value="">Adicionar licença ao perfil…</option>
            {catalog.licenseTypes
              .filter((t) => !used.has(t.id))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus className="size-4" />}
            disabled={!newType}
            onClick={() =>
              run(async () => {
                await ds.catalog.saveSectorLicenseRule({ sectorId, licenseTypeId: newType, defaultApplicability: 'em_analise', showInTable: false, sortOrder: rules.length, notes: null })
                setNewType('')
              })
            }
          >
            Adicionar
          </Button>
        </div>
      )}
      <p className="mt-3 text-[11.5px] text-muted">A tabela do setor mostra até {MAX_COLUMNS} colunas de licença (as 4 do layout aprovado e a Licença de Acessibilidade).</p>
    </div>
  )
}
