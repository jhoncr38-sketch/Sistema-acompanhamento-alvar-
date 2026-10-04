import { useEffect, useMemo, useRef } from 'react'
import { Building } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/States'
import type { CatalogSnapshot } from '@/data/types'
import type { CompanyOverview } from '@/domain/monitoring'
import type { Sector } from '@/domain/types'
import { cn } from '@/lib/cn'
import { CompanyPanel } from '../companies/CompanyPanel'
import { SectorCompaniesPanel } from './SectorCompaniesPanel'

/** Painel do setor (esquerda) + perfil da empresa (direita), como na referência aprovada. */
export function MonitorWorkspace({
  sector,
  overviews,
  catalog,
  selectedCompanyId,
  onSelectCompany,
  highlightLicenseId,
  className,
}: {
  sector: Sector
  overviews: CompanyOverview[]
  catalog: CatalogSnapshot
  selectedCompanyId: string | null
  onSelectCompany: (companyId: string) => void
  highlightLicenseId?: string | null
  className?: string
}) {
  const companyRef = useRef<HTMLDivElement>(null)
  const lastSelection = useRef(selectedCompanyId)

  const inSector = useMemo(
    () =>
      overviews
        .filter((o) => o.monitored && o.company.sectorId === sector.id)
        .sort((a, b) => a.company.createdAt.localeCompare(b.company.createdAt)),
    [overviews, sector.id],
  )
  const selected = inSector.find((o) => o.company.id === selectedCompanyId) ?? inSector[0]

  useEffect(() => {
    if (lastSelection.current === selectedCompanyId) return
    lastSelection.current = selectedCompanyId
    // Em telas onde os painéis ficam empilhados, leva o usuário até o perfil escolhido.
    if (window.matchMedia('(max-width: 1439px)').matches) companyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selectedCompanyId])

  return (
    <div className={cn('grid grid-cols-1 items-stretch gap-[10px] min-[1440px]:grid-cols-[minmax(0,1.33fr)_minmax(0,1fr)]', className)}>
      <SectorCompaniesPanel
        sector={sector}
        overviews={overviews}
        catalog={catalog}
        selectedCompanyId={selected?.company.id ?? null}
        onSelectCompany={onSelectCompany}
      />
      <div ref={companyRef} className="scroll-mt-4">
        {selected ? (
          <CompanyPanel overview={selected} catalog={catalog} highlightLicenseId={highlightLicenseId} className="h-full" />
        ) : (
          <Card className="h-full">
            <EmptyState icon={Building} title="Nenhuma empresa selecionada" description="Cadastre ou selecione uma empresa para ver o perfil." />
          </Card>
        )}
      </div>
    </div>
  )
}
