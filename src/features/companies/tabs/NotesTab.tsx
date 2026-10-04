import { useEffect, useState } from 'react'
import { useDataSource } from '@/app/data-context'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Form'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/data/errors'
import type { CompanyOverview } from '@/domain/monitoring'
import { useInvalidate } from '@/hooks/queries'

export function NotesTab({ overview }: { overview: CompanyOverview }) {
  const { company } = overview
  const ds = useDataSource()
  const { can } = useSession()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [notes, setNotes] = useState(company.notes)
  const [saving, setSaving] = useState(false)
  const editable = can('company:write')

  useEffect(() => setNotes(company.notes), [company.id, company.notes])

  async function save() {
    setSaving(true)
    try {
      const { id: _id, createdAt: _c, updatedAt: _u, createdBy: _b, ...input } = company
      await ds.companies.update(company.id, { ...input, notes })
      await invalidate.companies()
      toast.success('Observações salvas')
    } catch (error) {
      toast.error('Não foi possível salvar', errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const licenseNotes = overview.licenses.filter((e) => e.license.notes)

  return (
    <div className="mt-3 flex flex-col gap-3">
      <label htmlFor="company-notes" className="text-[12px] font-semibold text-ink-soft">
        Observações internas sobre a empresa
      </label>
      <Textarea
        id="company-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        readOnly={!editable}
        placeholder={editable ? 'Ex.: contato preferencial, particularidades do imóvel, combinados com o cliente…' : 'Sem observações.'}
        className="min-h-[160px]"
      />
      {editable && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} loading={saving} disabled={notes === company.notes}>
            Salvar observações
          </Button>
        </div>
      )}
      {licenseNotes.length > 0 && (
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-ink-soft">Observações das licenças</p>
          <ul className="space-y-1.5">
            {licenseNotes.map((e) => (
              <li key={e.license.id} className="rounded-lg bg-[#f6f9fc] px-3 py-2 text-[12.5px]">
                <span className="font-semibold text-ink">{e.type.name}: </span>
                <span className="text-ink-soft">{e.license.notes}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
