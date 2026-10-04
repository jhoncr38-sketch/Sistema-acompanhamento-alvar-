import { ArrowRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useDataSource } from '@/app/data-context'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { LICENSE_OUTCOME_TONE, TONE } from '@/config/simulation'
import { errorMessage } from '@/data/errors'
import { APPLICABILITY_LABEL } from '@/domain/labels'
import { planCompanyChanges, toAppliedChanges } from '@/domain/simulation/apply'
import type { SimulationRun } from '@/domain/simulation/types'
import type { CompanyLicense } from '@/domain/types'
import { useInvalidateSimulation } from '@/hooks/simulation-queries'
import { cn } from '@/lib/cn'

/** "Aplicar resultado à empresa": mostra o que muda (antes → depois) e pede confirmação. Nada é excluído. */
export function ApplyToCompanyModal({ run, open, onClose }: { run: SimulationRun; open: boolean; onClose: () => void }) {
  const ds = useDataSource()
  const toast = useToast()
  const invalidate = useInvalidateSimulation()
  const [licenses, setLicenses] = useState<CompanyLicense[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const companyId = run.companyId

  useEffect(() => {
    if (!open || !companyId) return
    let active = true
    setLicenses(null)
    setError(null)
    setSkipped(new Set())
    ds.licenses.listByCompany(companyId).then(
      (list) => active && setLicenses(list),
      (e) => active && setError(e),
    )
    return () => {
      active = false
    }
  }, [open, companyId, ds])

  const plans = useMemo(() => (licenses ? planCompanyChanges(run.result, licenses, { number: run.number }) : []), [licenses, run])
  const selected = plans.filter((p) => p.next && !skipped.has(p.licenseTypeId))

  async function apply() {
    if (!companyId) return
    setSaving(true)
    try {
      await ds.simulation.applyToCompany(run.id, companyId, toAppliedChanges(selected))
      await invalidate.afterApply()
      toast.success('Perfil de licenciamento atualizado', `${selected.length} licença(s) atualizada(s) em ${run.companyName}.`)
      onClose()
    } catch (e) {
      toast.error('Não foi possível aplicar', errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Aplicar resultado à empresa"
      description={`Deseja utilizar esta simulação para atualizar o perfil de licenciamento de ${run.companyName}?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={apply} loading={saving} disabled={selected.length === 0}>
            Confirmar e aplicar ({selected.length})
          </Button>
        </>
      }
    >
      {error ? (
        <ErrorState error={error} />
      ) : !licenses ? (
        <LoadingState />
      ) : (
        <>
          <ul className="divide-y divide-line-soft rounded-lg border border-line">
            {plans.map((plan) => {
              const tone = TONE[LICENSE_OUTCOME_TONE[plan.outcome]]
              const changes = plan.next !== null
              return (
                <li key={plan.licenseTypeId} className={cn('flex items-start gap-3 px-3 py-2.5', !changes && 'bg-[#fafbfd]')}>
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-[#0c6cf0] disabled:opacity-40"
                    checked={changes && !skipped.has(plan.licenseTypeId)}
                    disabled={!changes}
                    aria-label={`Aplicar em ${plan.licenseName}`}
                    onChange={(e) =>
                      setSkipped((current) => {
                        const next = new Set(current)
                        if (e.target.checked) next.delete(plan.licenseTypeId)
                        else next.add(plan.licenseTypeId)
                        return next
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold text-ink">{plan.licenseName}</p>
                      <span className={cn('inline-flex h-5 items-center rounded-md px-2 text-[11px] font-bold uppercase', tone.soft, tone.text)}>{plan.outcomeLabel}</span>
                    </div>
                    {changes && plan.next ? (
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-soft">
                        <Badge tone="neutral">{plan.current ? APPLICABILITY_LABEL[plan.current] : 'Não monitorada'}</Badge>
                        <ArrowRight className="size-3.5" aria-hidden />
                        <Badge tone="blue">{APPLICABILITY_LABEL[plan.next]}</Badge>
                        <span className="text-muted">{plan.action === 'adicionar' ? 'entra no cadastro da empresa' : ''}</span>
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[12px] text-muted">{plan.explanation}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-[12px] text-muted">
            Nenhum registro é excluído. O fundamento (número da simulação e base normativa) é anotado nas observações de cada licença e a alteração fica na auditoria.
          </p>
        </>
      )}
    </Modal>
  )
}
