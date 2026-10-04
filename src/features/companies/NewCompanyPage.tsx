import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useDataSource } from '@/app/data-context'
import { usePageMeta } from '@/app/page-meta'
import { useSession } from '@/app/session'
import { Card } from '@/components/ui/Card'
import { EmptyState, LoadingState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/data/errors'
import { useCatalog, useInvalidate } from '@/hooks/queries'
import { CompanyForm } from './CompanyForm'
import { emptyCompanyValues } from './company-schema'

export function NewCompanyPage() {
  usePageMeta('Nova Empresa', 'Cadastro com sugestão de setor e de licenças pelo CNAE')
  const { data: catalog, isLoading } = useCatalog()
  const ds = useDataSource()
  const { can } = useSession()
  const toast = useToast()
  const invalidate = useInvalidate()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const sectorId = catalog?.sectors.find((s) => s.slug === params.get('setor'))?.id ?? ''
  const initialValues = useMemo(() => emptyCompanyValues(sectorId), [sectorId])

  if (isLoading || !catalog) return <LoadingState />
  if (!can('company:write')) {
    return (
      <Card className="mt-3">
        <EmptyState icon={ShieldAlert} title="Acesso restrito" description="Seu perfil de acesso não permite cadastrar empresas." />
      </Card>
    )
  }

  return (
    <div className="mt-[9px] flex flex-col gap-3">
      <button type="button" onClick={() => navigate(-1)} className="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-medium text-link hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Voltar
      </button>
      <Card className="p-5">
        <CompanyForm
          mode="create"
          catalog={catalog}
          initialValues={initialValues}
          onCancel={() => navigate(-1)}
          onSubmit={async (input, licenses) => {
            try {
              const company = await ds.companies.create(input, licenses)
              await invalidate.companies()
              toast.success('Empresa cadastrada', 'As licenças sugeridas foram adicionadas ao monitoramento como pendentes de consulta.')
              navigate(`/empresas/${company.id}`)
            } catch (error) {
              toast.error('Não foi possível cadastrar', errorMessage(error))
            }
          }}
        />
      </Card>
    </div>
  )
}
