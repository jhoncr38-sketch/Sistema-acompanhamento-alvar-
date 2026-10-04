import { Trash } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useDataSource } from '@/app/data-context'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import type { CatalogSnapshot } from '@/data/types'
import { errorMessage } from '@/data/errors'
import type { CompanyOverview } from '@/domain/monitoring'
import { useInvalidate } from '@/hooks/queries'
import { LicenseManager } from '../../licenses/LicenseManager'
import { CompanyForm } from '../CompanyForm'
import { companyToValues } from '../company-schema'

export function EditTab({ overview, catalog }: { overview: CompanyOverview; catalog: CatalogSnapshot }) {
  const { company } = overview
  const ds = useDataSource()
  const { can } = useSession()
  const toast = useToast()
  const invalidate = useInvalidate()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const initialValues = useMemo(() => companyToValues(company), [company])

  async function remove() {
    setDeleting(true)
    try {
      await ds.companies.remove(company.id)
      await invalidate.companies()
      toast.success('Empresa excluída')
      navigate('/empresas')
    } catch (error) {
      toast.error('Não foi possível excluir', errorMessage(error))
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-6">
      <CompanyForm
        mode="edit"
        catalog={catalog}
        initialValues={initialValues}
        photoUrl={company.photoUrl}
        onSubmit={async (input) => {
          try {
            await ds.companies.update(company.id, input)
            await invalidate.companies()
            toast.success('Cadastro atualizado')
          } catch (error) {
            toast.error('Não foi possível salvar', errorMessage(error))
          }
        }}
      />

      <section>
        <h3 className="mb-2 text-[13px] font-bold tracking-wide text-ink uppercase">Licenças monitoradas</h3>
        <LicenseManager overview={overview} catalog={catalog} />
      </section>

      {can('company:delete') && (
        <section className="rounded-xl border border-[#f7c3cb] bg-[#fff7f8] p-4">
          <h3 className="text-[13px] font-bold text-danger-ink">Excluir empresa</h3>
          <p className="mt-1 text-[12px] text-ink-soft">
            Só é possível excluir empresas sem histórico. Empresas com consultas, documentos ou alertas devem ser marcadas como Inativas, para preservar o histórico.
          </p>
          <Button variant="danger" size="sm" className="mt-3" icon={<Trash className="size-4" />} onClick={() => setConfirmDelete(true)}>
            Excluir empresa
          </Button>
        </section>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        size="sm"
        title="Excluir empresa?"
        description={company.legalName}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={remove} loading={deleting}>
              Excluir definitivamente
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-soft">Esta ação não pode ser desfeita. As licenças configuradas desta empresa também serão removidas.</p>
      </Modal>
    </div>
  )
}
