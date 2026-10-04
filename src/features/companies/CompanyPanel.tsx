import { useEffect, useMemo, useState } from 'react'
import { useSession } from '@/app/session'
import { CompanyStatusBadge } from '@/components/ui/Badge'
import { Card, IconTile } from '@/components/ui/Card'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { SECTOR_ICONS, sectorTheme } from '@/config/sector-theme'
import type { CatalogSnapshot } from '@/data/types'
import { formatCnpj } from '@/domain/cnpj'
import type { CompanyOverview } from '@/domain/monitoring'
import type { CompanyLicense } from '@/domain/types'
import { useInvalidate } from '@/hooks/queries'
import { useConsultationContext } from '@/hooks/useConsultationContext'
import { cn } from '@/lib/cn'
import { consultViaProviders } from '@/services/consultation-service'
import { ConsultAllModal } from '../licenses/ConsultAllModal'
import { RegisterConsultationModal } from '../licenses/RegisterConsultationModal'
import { DocumentsTab } from './tabs/DocumentsTab'
import { EditTab } from './tabs/EditTab'
import { HistoryTab } from './tabs/HistoryTab'
import { NotesTab } from './tabs/NotesTab'
import { SummaryTab } from './tabs/SummaryTab'

export type CompanyTab = 'resumo' | 'documentos' | 'historico' | 'observacoes' | 'editar'

function addressLine(o: CompanyOverview) {
  const a = o.company.address
  return [a.street, a.number].filter(Boolean).join(', ') + (a.district ? ` - ${a.district}` : '')
}

export function CompanyPanel({
  overview,
  catalog,
  highlightLicenseId,
  className,
}: {
  overview: CompanyOverview
  catalog: CatalogSnapshot
  highlightLicenseId?: string | null
  className?: string
}) {
  const { can } = useSession()
  const toast = useToast()
  const invalidate = useInvalidate()
  const ctx = useConsultationContext()
  const [tab, setTab] = useState<CompanyTab>('resumo')
  const [consultTarget, setConsultTarget] = useState<string | null>(null)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [consultAllOpen, setConsultAllOpen] = useState(false)
  const { company, sector } = overview
  const theme = sectorTheme(sector?.color)
  const Icon = sector ? SECTOR_ICONS[sector.icon] : SECTOR_ICONS.store

  useEffect(() => setTab('resumo'), [company.id])

  const tabs = useMemo<TabItem<CompanyTab>[]>(
    () => [
      { id: 'resumo', label: 'Resumo' },
      { id: 'documentos', label: 'Documentos' },
      { id: 'historico', label: 'Histórico' },
      { id: 'observacoes', label: 'Observações' },
      ...(can('company:write') ? [{ id: 'editar' as const, label: 'Editar' }] : []),
    ],
    [can],
  )

  const openRegister = (licenseId: string | null) => {
    setConsultTarget(licenseId)
    setRegisterOpen(true)
  }

  /** "Consultar": tenta a fonte integrada; sem integração, abre o registro manual. */
  async function consult(license: CompanyLicense) {
    if (!ctx) return
    const [attempt] = await consultViaProviders(ctx, [license])
    if (!attempt || attempt.state === 'pendente') {
      if (attempt) toast.info(`INTEGRAÇÃO PENDENTE — ${attempt.providerName}`, 'Consulte no site do órgão e registre o resultado.')
      if (can('consultation:create')) openRegister(license.id)
      return
    }
    if (attempt.state === 'erro') {
      toast.error('Falha na consulta', attempt.message)
      return
    }
    await invalidate.afterConsultation()
    toast.success(attempt.result.detection.changed ? 'Alteração detectada.' : 'Nenhuma alteração identificada.')
  }

  return (
    <Card className={cn('flex flex-col p-[14px]', className)}>
      <div className="flex gap-3">
        <IconTile className={cn('size-[46px]', theme.soft)}>
          <Icon className={cn('size-[26px]', theme.text, sector?.icon !== 'scale' && 'fill-current')} strokeWidth={sector?.icon === 'scale' ? 2.2 : 1.6} />
        </IconTile>
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] leading-tight font-bold text-ink">{company.legalName}</h2>
          <dl className="mt-[3px] text-[12.5px] leading-[1.22] text-ink-soft">
            <div>
              <dt className="inline">CNPJ: </dt>
              <dd className="tabular inline">{formatCnpj(company.cnpj)}</dd>
            </div>
            <div>
              <dt className="inline">Setor: </dt>
              <dd className="inline">{sector?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="inline">Município: </dt>
              <dd className="inline">
                {company.address.city} - {company.address.state}
              </dd>
            </div>
            <div>
              <dt className="inline">Endereço: </dt>
              <dd className="inline">{addressLine(overview) || '—'}</dd>
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <CompanyStatusBadge status={company.status} />
          {company.photoUrl && (
            <img
              src={company.photoUrl}
              alt={`Fachada de ${company.tradeName || company.legalName}`}
              className="hidden h-[64px] w-[164px] rounded-lg object-cover shadow-[0_2px_8px_rgb(15_45_82/0.18)] sm:block"
            />
          )}
        </div>
      </div>

      <Tabs items={tabs} value={tab} onChange={setTab} label="Seções da empresa" className="mt-2.5" />

      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {tab === 'resumo' && (
          <SummaryTab
            overview={overview}
            catalog={catalog}
            highlightLicenseId={highlightLicenseId ?? null}
            onConsult={consult}
            onConsultAll={() => setConsultAllOpen(true)}
            onShowHistory={() => setTab('historico')}
          />
        )}
        {tab === 'documentos' && <DocumentsTab overview={overview} />}
        {tab === 'historico' && <HistoryTab overview={overview} catalog={catalog} onRegister={can('consultation:create') ? () => openRegister(null) : undefined} />}
        {tab === 'observacoes' && <NotesTab overview={overview} />}
        {tab === 'editar' && <EditTab overview={overview} catalog={catalog} />}
      </div>

      <RegisterConsultationModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        company={company}
        licenses={overview.licenses}
        initialLicenseId={consultTarget}
      />
      <ConsultAllModal
        open={consultAllOpen}
        onClose={() => setConsultAllOpen(false)}
        company={company}
        licenses={overview.licenses}
        onRegisterManual={(id) => {
          setConsultAllOpen(false)
          openRegister(id)
        }}
      />
    </Card>
  )
}
