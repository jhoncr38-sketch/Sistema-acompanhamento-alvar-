import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useDataSource } from '@/app/data-context'
import { usePageMeta } from '@/app/page-meta'
import { useSession } from '@/app/session'
import { Card } from '@/components/ui/Card'
import { LoadingState } from '@/components/ui/States'
import { useCatalog } from '@/hooks/queries'
import { cn } from '@/lib/cn'
import { AuditSection } from './sections/AuditSection'
import { CnaeSection } from './sections/CnaeSection'
import { DemoSection } from './sections/DemoSection'
import { ExpirationSection, RegularitySection } from './sections/RulesSections'
import { IntegrationsSection } from './sections/IntegrationsSection'
import { JobSection } from './sections/JobSection'
import { LicenseTypesSection } from './sections/LicenseTypesSection'
import { NotificationsSection } from './sections/NotificationsSection'
import { RulesSection } from './sections/rules/RulesSection'
import { SectorRulesSection } from './sections/SectorRulesSection'
import { UsersSection } from './sections/UsersSection'

type SectionId = 'vencimentos' | 'indice' | 'licencas' | 'setores' | 'regras' | 'cnae' | 'integracoes' | 'notificacoes' | 'rotina' | 'usuarios' | 'auditoria' | 'demo'

export function SettingsPage() {
  usePageMeta('Configurações', 'Regras de vencimento, perfis de licenciamento, integrações e acesso')
  const { data: catalog, isLoading } = useCatalog()
  const { can } = useSession()
  const ds = useDataSource()
  const [params] = useSearchParams()
  const [section, setSection] = useState<SectionId>(params.get('secao') === 'regras' ? 'regras' : 'vencimentos')

  const sections: { id: SectionId; label: string; visible: boolean }[] = [
    { id: 'vencimentos', label: 'Faixas de vencimento', visible: true },
    { id: 'indice', label: 'Índice de regularidade', visible: true },
    { id: 'licencas', label: 'Tipos de licença', visible: true },
    { id: 'setores', label: 'Licenças por setor', visible: true },
    { id: 'cnae', label: 'Matriz CNAE → setor', visible: true },
    { id: 'regras', label: 'Legislação', visible: true },
    { id: 'integracoes', label: 'Integrações', visible: true },
    { id: 'notificacoes', label: 'Notificações', visible: true },
    { id: 'rotina', label: 'Rotina automática', visible: true },
    { id: 'usuarios', label: 'Usuários e perfis', visible: true },
    { id: 'auditoria', label: 'Auditoria', visible: can('audit:view') },
    { id: 'demo', label: 'Dados de demonstração', visible: ds.mode === 'demo' },
  ]

  if (isLoading || !catalog) return <LoadingState />
  const readOnly = !can('settings:manage')

  return (
    <div className="mt-[9px] grid grid-cols-1 gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
      <Card className="p-2">
        <nav aria-label="Seções de configuração">
          <ul className="flex gap-0.5 overflow-x-auto lg:flex-col">
            {sections
              .filter((s) => s.visible)
              .map((s) => (
                <li key={s.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setSection(s.id)}
                    aria-current={s.id === section || undefined}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-left text-[13px] whitespace-nowrap transition-colors',
                      s.id === section ? 'bg-primary-soft font-semibold text-primary' : 'text-ink hover:bg-[#f3f7fc]',
                    )}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
          </ul>
        </nav>
      </Card>
      <Card className="p-5">
        {readOnly && section !== 'auditoria' && section !== 'demo' && (
          <p className="mb-4 rounded-lg bg-[#fff6dc] px-3 py-2 text-[12.5px] text-[#7a5600]">
            Somente administradores alteram configurações. Você está vendo em modo leitura.
          </p>
        )}
        {section === 'vencimentos' && <ExpirationSection catalog={catalog} readOnly={readOnly} />}
        {section === 'indice' && <RegularitySection catalog={catalog} readOnly={readOnly} />}
        {section === 'licencas' && <LicenseTypesSection catalog={catalog} readOnly={readOnly} />}
        {section === 'setores' && <SectorRulesSection catalog={catalog} readOnly={readOnly} />}
        {section === 'cnae' && <CnaeSection catalog={catalog} readOnly={readOnly} />}
        {section === 'regras' && <RulesSection catalog={catalog} readOnly={readOnly} />}
        {section === 'integracoes' && <IntegrationsSection catalog={catalog} readOnly={readOnly} />}
        {section === 'notificacoes' && <NotificationsSection catalog={catalog} readOnly={readOnly} />}
        {section === 'rotina' && <JobSection />}
        {section === 'usuarios' && <UsersSection readOnly={!can('users:manage')} />}
        {section === 'auditoria' && <AuditSection />}
        {section === 'demo' && <DemoSection />}
      </Card>
    </div>
  )
}
