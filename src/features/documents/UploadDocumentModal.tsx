import { useEffect, useState, type FormEvent } from 'react'
import { useDataSource } from '@/app/data-context'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/data/errors'
import type { CompanyOverview } from '@/domain/monitoring'
import { useInvalidate } from '@/hooks/queries'

export function UploadDocumentModal({ open, onClose, overview }: { open: boolean; onClose: () => void; overview: CompanyOverview }) {
  const ds = useDataSource()
  const toast = useToast()
  const invalidate = useInvalidate()
  const licenses = overview.licenses.filter((e) => e.license.applicability !== 'nao_aplicavel')
  const [licenseId, setLicenseId] = useState('')
  const [documentType, setDocumentType] = useState('')
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [agency, setAgency] = useState('')
  const [issuedAt, setIssuedAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const first = licenses[0]
    setLicenseId(first?.license.id ?? '')
    setDocumentType(first?.type.name ?? '')
    setAgency(first?.type.agency ?? '')
    setName('')
    setNumber('')
    setIssuedAt('')
    setExpiresAt('')
    setFile(null)
    setError(null)
    // reinicia somente ao abrir
  }, [open])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!licenseId || !name.trim() || !file) {
      setError('Selecione a licença, informe o nome e escolha o arquivo.')
      return
    }
    if (issuedAt && expiresAt && expiresAt < issuedAt) {
      setError('A validade não pode ser anterior à emissão.')
      return
    }
    setSaving(true)
    try {
      await ds.documents.upload(
        {
          companyLicenseId: licenseId,
          companyId: overview.company.id,
          consultationId: null,
          documentType: documentType.trim() || 'Documento',
          name: name.trim(),
          number: number.trim() || null,
          issuingAgency: agency.trim() || null,
          issuedAt: issuedAt || null,
          expiresAt: expiresAt || null,
        },
        file,
      )
      await invalidate.documents()
      toast.success('Documento anexado')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Anexar documento"
      description={overview.company.legalName}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="upload-document" loading={saving}>
            Anexar
          </Button>
        </>
      }
    >
      <form id="upload-document" onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
        <Field label="Licença" required className="sm:col-span-2">
          {(p) => (
            <Select
              {...p}
              value={licenseId}
              onChange={(e) => {
                setLicenseId(e.target.value)
                const l = licenses.find((x) => x.license.id === e.target.value)
                if (l) {
                  setDocumentType(l.type.name)
                  setAgency(l.type.agency)
                }
              }}
            >
              {licenses.map((l) => (
                <option key={l.license.id} value={l.license.id}>
                  {l.type.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Tipo">{(p) => <Input {...p} value={documentType} onChange={(e) => setDocumentType(e.target.value)} />}</Field>
        <Field label="Nome" required>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Alvará 2026" />}</Field>
        <Field label="Número">{(p) => <Input {...p} value={number} onChange={(e) => setNumber(e.target.value)} />}</Field>
        <Field label="Órgão emissor">{(p) => <Input {...p} value={agency} onChange={(e) => setAgency(e.target.value)} />}</Field>
        <Field label="Data de emissão">{(p) => <Input {...p} type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />}</Field>
        <Field label="Data de validade">{(p) => <Input {...p} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />}</Field>
        <Field label="Arquivo" required className="sm:col-span-2" hint={ds.mode === 'demo' ? 'Modo demonstração: até 750 KB.' : 'PDF ou imagem.'}>
          {(p) => (
            <Input
              {...p}
              type="file"
              accept=".pdf,image/*"
              className="py-1.5 text-[12px] file:mr-3 file:rounded-md file:border-0 file:bg-primary-soft file:px-2.5 file:py-1 file:text-[12px] file:font-semibold file:text-primary"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          )}
        </Field>
        {error && (
          <p role="alert" className="text-[12.5px] text-danger-ink sm:col-span-2">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
