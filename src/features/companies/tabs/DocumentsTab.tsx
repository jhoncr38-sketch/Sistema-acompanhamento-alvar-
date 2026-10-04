import { Archive, Download, FileText, Upload } from 'lucide-react'
import { useState } from 'react'
import { useDataSource } from '@/app/data-context'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/data/errors'
import { formatDate, formatDateTime } from '@/domain/format'
import type { CompanyOverview } from '@/domain/monitoring'
import type { LicenseDocument } from '@/domain/types'
import { useDocuments, useInvalidate } from '@/hooks/queries'
import { formatBytes } from '@/lib/download'
import { UploadDocumentModal } from '../../documents/UploadDocumentModal'

export function DocumentsTab({ overview }: { overview: CompanyOverview }) {
  const { data, isLoading, error, refetch } = useDocuments({ companyId: overview.company.id })
  const ds = useDataSource()
  const { can } = useSession()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [uploadOpen, setUploadOpen] = useState(false)
  const typeName = new Map(overview.licenses.map((e) => [e.license.id, e.type.name]))

  async function open(doc: LicenseDocument) {
    const url = await ds.documents.getFileUrl(doc)
    if (!url) {
      toast.info('Arquivo indisponível', ds.mode === 'demo' ? 'Documento de demonstração sem arquivo anexado.' : 'O arquivo não foi encontrado.')
      return
    }
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener'
    if (url.startsWith('data:')) a.download = doc.fileName ?? 'documento'
    a.click()
  }

  async function archive(doc: LicenseDocument) {
    try {
      await ds.documents.archive(doc.id)
      await invalidate.documents()
      toast.success('Documento arquivado', 'Ele continua guardado e pode ser consultado na auditoria.')
    } catch (e) {
      toast.error('Não foi possível arquivar', errorMessage(e))
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] text-ink-soft">Documentos anexados às licenças desta empresa.</p>
        {can('document:write') && (
          <Button size="sm" icon={<Upload className="size-4" />} onClick={() => setUploadOpen(true)}>
            Anexar documento
          </Button>
        )}
      </div>
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyState icon={FileText} title="Nenhum documento anexado" description="Anexe alvarás, licenças, protocolos e comprovantes de consulta." />
      ) : (
        <ul className="divide-y divide-line-soft rounded-lg border border-line">
          {data.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e3eefc] text-primary">
                <FileText className="size-[18px]" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-ink">{doc.name}</p>
                <p className="text-[11.5px] text-muted">
                  {typeName.get(doc.companyLicenseId) ?? 'Licença'} · {doc.documentType}
                  {doc.number && ` · Nº ${doc.number}`}
                  {doc.issuingAgency && ` · ${doc.issuingAgency}`}
                </p>
                <p className="text-[11.5px] text-muted">
                  Emissão {formatDate(doc.issuedAt)} · Validade {formatDate(doc.expiresAt)} · {formatBytes(doc.sizeBytes)} · enviado por {doc.uploadedByName} em{' '}
                  {formatDateTime(doc.uploadedAt)}
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="xs" variant="secondary" icon={<Download className="size-3.5" />} onClick={() => open(doc)}>
                  Abrir
                </Button>
                {can('document:write') && (
                  <Button size="xs" variant="ghost" icon={<Archive className="size-3.5" />} onClick={() => archive(doc)} aria-label={`Arquivar ${doc.name}`}>
                    Arquivar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <UploadDocumentModal open={uploadOpen} onClose={() => setUploadOpen(false)} overview={overview} />
    </div>
  )
}
