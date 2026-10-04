import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useDataSource } from '@/app/data-context'
import { useSession } from '@/app/session'
import { LicenseStatusLabel } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Form'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { useToast } from '@/components/ui/Toast'
import type { CatalogSnapshot } from '@/data/types'
import { errorMessage } from '@/data/errors'
import { APPLICABILITY_LABEL } from '@/domain/labels'
import type { CompanyOverview } from '@/domain/monitoring'
import type { LicenseApplicability } from '@/domain/types'
import { useInvalidate } from '@/hooks/queries'

const APPLICABILITY = Object.entries(APPLICABILITY_LABEL) as [LicenseApplicability, string][]

/** Define quais licenças a empresa monitora e se cada uma é aplicável, não aplicável, dispensada ou em análise. */
export function LicenseManager({ overview, catalog }: { overview: CompanyOverview; catalog: CatalogSnapshot }) {
  const ds = useDataSource()
  const { can } = useSession()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [busy, setBusy] = useState<string | null>(null)
  const [newTypeId, setNewTypeId] = useState('')
  const editable = can('license:write')
  const monitored = new Set(overview.licenses.map((e) => e.type.id))
  const available = catalog.licenseTypes.filter((t) => t.active && !monitored.has(t.id)).sort((a, b) => a.sortOrder - b.sortOrder)

  async function update(licenseId: string, patch: { applicability?: LicenseApplicability; providerCode?: string | null }) {
    setBusy(licenseId)
    try {
      await ds.licenses.update(licenseId, patch)
      await invalidate.licenses()
      toast.success('Licença atualizada')
    } catch (error) {
      toast.error('Não foi possível atualizar', errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function add() {
    const type = catalog.licenseTypes.find((t) => t.id === newTypeId)
    if (!type) return
    setBusy('new')
    try {
      await ds.licenses.add(overview.company.id, { licenseTypeId: type.id, applicability: 'aplicavel', providerCode: type.defaultProviderCode })
      await invalidate.licenses()
      setNewTypeId('')
      toast.success(`${type.name} adicionada ao monitoramento`)
    } catch (error) {
      toast.error('Não foi possível adicionar', errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <TableFrame>
        <Table className="text-[12.5px]">
          <THead>
            <tr className="h-[32px]">
              <TH>Licença</TH>
              <TH>Aplicabilidade</TH>
              <TH>Fonte</TH>
              <TH>Situação atual</TH>
            </tr>
          </THead>
          <tbody>
            {overview.licenses.map((e) => (
              <TR key={e.license.id} className="h-[42px]">
                <TD>
                  <p className="font-semibold text-ink">{e.type.name}</p>
                  <p className="text-[11.5px] text-muted">{e.type.agency}</p>
                </TD>
                <TD>
                  <Select
                    aria-label={`Aplicabilidade de ${e.type.name}`}
                    value={e.license.applicability}
                    disabled={!editable || busy === e.license.id}
                    onChange={(ev) => update(e.license.id, { applicability: ev.target.value as LicenseApplicability })}
                    className="h-[30px] w-[150px] text-[12.5px]"
                  >
                    {APPLICABILITY.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </TD>
                <TD>
                  <Select
                    aria-label={`Fonte de ${e.type.name}`}
                    value={e.license.providerCode ?? ''}
                    disabled={!editable || busy === e.license.id}
                    onChange={(ev) => update(e.license.id, { providerCode: ev.target.value || null })}
                    className="h-[30px] w-[170px] text-[12.5px]"
                  >
                    <option value="">Manual</option>
                    {catalog.providers.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </TD>
                <TD>
                  <LicenseStatusLabel status={e.evaluation.status} className="text-[12px]" />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </TableFrame>
      {editable && available.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={newTypeId} onChange={(e) => setNewTypeId(e.target.value)} aria-label="Licença para adicionar" className="h-[32px] w-auto min-w-[220px] text-[12.5px]">
            <option value="">Adicionar licença ao monitoramento…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={add} disabled={!newTypeId} loading={busy === 'new'}>
            Adicionar
          </Button>
        </div>
      )}
      <p className="text-[11.5px] text-muted">
        Licenças não aplicáveis ou dispensadas não reduzem o Índice de Regularidade. Alterações ficam registradas na auditoria.
      </p>
    </div>
  )
}
