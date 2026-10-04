import { useEffect, useState } from 'react'
import { useSession } from '@/app/session'
import { IntegrationBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { LoadingState } from '@/components/ui/States'
import { SolidStatusIcon } from '@/components/ui/StatusIcon'
import type { EvaluatedLicense } from '@/domain/monitoring'
import type { Company } from '@/domain/types'
import { useInvalidate } from '@/hooks/queries'
import { useConsultationContext } from '@/hooks/useConsultationContext'
import { consultViaProviders, type ProviderAttempt } from '@/services/consultation-service'
import { agencyLabel } from './license-labels'

/** "Consultar todas as licenças": tenta cada fonte integrada; as pendentes viram registro manual. */
export function ConsultAllModal({
  open,
  onClose,
  company,
  licenses,
  onRegisterManual,
}: {
  open: boolean
  onClose: () => void
  company: Company
  licenses: EvaluatedLicense[]
  onRegisterManual: (licenseId: string) => void
}) {
  const ctx = useConsultationContext()
  const { can } = useSession()
  const invalidate = useInvalidate()
  const [attempts, setAttempts] = useState<ProviderAttempt[] | null>(null)

  useEffect(() => {
    if (!open || !ctx) return
    let active = true
    setAttempts(null)
    consultViaProviders(ctx, licenses.map((l) => l.license)).then((a) => {
      if (!active) return
      setAttempts(a)
      if (a.some((x) => x.state === 'consultada')) void invalidate.afterConsultation()
    })
    return () => {
      active = false
    }
    // executa uma vez por abertura
  }, [open])

  const byId = new Map(licenses.map((l) => [l.license.id, l]))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Consultar todas as licenças"
      description={company.legalName}
      footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}
    >
      {!attempts ? (
        <LoadingState label="Consultando fontes…" />
      ) : attempts.length === 0 ? (
        <p className="text-[13px] text-muted">Nenhuma licença aplicável para consultar.</p>
      ) : (
        <>
          <p className="mb-3 text-[12.5px] text-ink-soft">
            As fontes abaixo ainda não possuem integração oficial. Consulte no site do órgão e registre o resultado — o histórico e a
            comparação com a consulta anterior são feitos automaticamente.
          </p>
          <ul className="divide-y divide-line-soft rounded-lg border border-line">
            {attempts.map((a) => {
              const e = byId.get(a.license.id)
              if (!e) return null
              return (
                <li key={a.license.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-ink">{e.type.name}</p>
                    <p className="text-[12px] text-muted">{agencyLabel(e.type, company)}</p>
                  </div>
                  {a.state === 'pendente' && (
                    <>
                      <IntegrationBadge status="pendente" />
                      {can('consultation:create') && (
                        <Button size="sm" variant="soft" onClick={() => onRegisterManual(a.license.id)}>
                          Registrar consulta
                        </Button>
                      )}
                    </>
                  )}
                  {a.state === 'consultada' && (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ok-ink">
                      <SolidStatusIcon tone="ok" glyph="check" size={14} />
                      {a.result.detection.changed ? 'Alteração detectada' : 'Nenhuma alteração identificada'}
                    </span>
                  )}
                  {a.state === 'erro' && <span className="text-[12.5px] text-danger-ink">{a.message}</span>}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Modal>
  )
}
