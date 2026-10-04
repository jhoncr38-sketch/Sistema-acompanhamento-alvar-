import { useState } from 'react'
import { useDataSource } from '@/app/data-context'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import { DEMO_CITY } from '@/config/simulation'
import type { CatalogSnapshot } from '@/data/types'
import { useRuleBase } from '@/hooks/simulation-queries'
import { SectionHeader } from '../SectionHeader'
import { ClassificationsTab, QuestionsTab } from './CatalogTabs'
import { DocumentsTab } from './DocumentsTab'
import { ImportTab } from './ImportTab'
import { LegalBaseTab } from './LegalBaseTab'
import { NormsTab } from './NormsTab'
import { RulesTab } from './RulesTab'

type RulesTabId = 'base' | 'documentos' | 'normas' | 'regras' | 'perguntas' | 'classificacoes' | 'importar'

const TABS: { id: RulesTabId; label: string }[] = [
  { id: 'base', label: 'Base Legal' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'normas', label: 'Normas e versões' },
  { id: 'regras', label: 'Regras por CNAE' },
  { id: 'perguntas', label: 'Perguntas' },
  { id: 'classificacoes', label: 'Classificações' },
  { id: 'importar', label: 'Importar legislação' },
]

/** Painel administrativo da Simulação: tudo o que o motor de regras usa é cadastrado aqui. */
export function RulesSection({ catalog, readOnly }: { catalog: CatalogSnapshot; readOnly: boolean }) {
  const ds = useDataSource()
  const { data: base, isLoading, error, refetch } = useRuleBase()
  const [tab, setTab] = useState<RulesTabId>('base')

  return (
    <div>
      <SectionHeader
        title="Legislação"
        description="Base da Simulação de Licenciamento. O simulador decide somente com o que estiver cadastrado aqui: normas, anexos, versões com vigência, regras por CNAE, condições e efeitos nas licenças. Nada é excluído — normas, versões e regras são desativadas."
      />
      {ds.mode === 'demo' && (
        <p className="mb-3 rounded-lg bg-[#fff8e1] px-3 py-2 text-[12.5px] text-[#7a5600]">
          Modo demonstração: as normas de Teresina – PI estão com os documentos oficiais na biblioteca e os pacotes extraídos aguardam a sua aprovação (aba Importar legislação). A norma
          de “{DEMO_CITY}” é um <strong>exemplo fictício</strong> para testar o simulador e não representa legislação real.
        </p>
      )}
      <Tabs items={TABS} value={tab} onChange={setTab} label="Legislação" className="mb-4" />
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading || !base ? (
        <LoadingState />
      ) : (
        <>
          {tab === 'base' && <LegalBaseTab base={base} catalog={catalog} />}
          {tab === 'documentos' && <DocumentsTab base={base} readOnly={readOnly} />}
          {tab === 'normas' && <NormsTab base={base} catalog={catalog} readOnly={readOnly} />}
          {tab === 'regras' && <RulesTab base={base} catalog={catalog} readOnly={readOnly} />}
          {tab === 'perguntas' && <QuestionsTab base={base} readOnly={readOnly} />}
          {tab === 'classificacoes' && <ClassificationsTab base={base} readOnly={readOnly} />}
          {tab === 'importar' && <ImportTab base={base} catalog={catalog} readOnly={readOnly} />}
        </>
      )}
    </div>
  )
}
