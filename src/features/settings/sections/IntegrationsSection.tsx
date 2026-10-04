import { useDataSource } from '@/app/data-context'
import { IntegrationBadge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Form'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { useToast } from '@/components/ui/Toast'
import type { CatalogSnapshot } from '@/data/types'
import { errorMessage } from '@/data/errors'
import type { IntegrationStatus } from '@/domain/types'
import { useInvalidate } from '@/hooks/queries'
import { hasAdapter } from '@/integrations/licensing/providers'
import { SectionHeader } from './SectionHeader'

export function IntegrationsSection({ catalog, readOnly }: { catalog: CatalogSnapshot; readOnly: boolean }) {
  const ds = useDataSource()
  const toast = useToast()
  const invalidate = useInvalidate()

  async function setStatus(code: string, status: IntegrationStatus, notes: string | null) {
    try {
      await ds.catalog.updateProvider(code, { status, notes })
      await invalidate.catalog()
    } catch (error) {
      toast.error('Não foi possível salvar', errorMessage(error))
    }
  }

  return (
    <div>
      <SectionHeader
        title="Integrações com órgãos"
        description="Cada fonte terá seu próprio adapter, executado no servidor (Edge Function), somente com acesso oficial autorizado. Enquanto a integração não existir, o sistema funciona com o registro manual das consultas."
      />
      <TableFrame>
        <Table className="text-[12.5px]">
          <THead>
            <tr className="h-[34px]">
              <TH>Fonte</TH>
              <TH>Órgão</TH>
              <TH>Situação</TH>
              <TH>Adapter</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <tbody>
            {catalog.providers.map((p) => {
              const implemented = hasAdapter(p.code)
              return (
                <TR key={p.code} className="h-[42px]">
                  <TD className="font-semibold text-ink">{p.name}</TD>
                  <TD>{p.agency}</TD>
                  <TD>
                    <IntegrationBadge status={p.status} />
                  </TD>
                  <TD className="text-muted">{implemented ? 'Implementado' : 'Não implementado'}</TD>
                  <TD>
                    <Select
                      aria-label={`Status de ${p.name}`}
                      value={p.status}
                      disabled={readOnly}
                      onChange={(e) => setStatus(p.code, e.target.value as IntegrationStatus, p.notes)}
                      className="h-[30px] w-[170px] text-[12.5px]"
                    >
                      <option value="pendente">Integração pendente</option>
                      <option value="ativa" disabled={!implemented}>
                        Ativa{implemented ? '' : ' (requer adapter)'}
                      </option>
                      <option value="inativa">Inativa</option>
                    </Select>
                  </TD>
                </TR>
              )
            })}
          </tbody>
        </Table>
      </TableFrame>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-[12px] text-ink-soft">
        <li>Nenhum endereço de API foi presumido. Cada adapter deve seguir a documentação oficial do órgão.</li>
        <li>Credenciais e certificados ficam apenas no servidor (variáveis da Edge Function), nunca no navegador.</li>
        <li>Toda chamada gera registro em <code>integration_logs</code> e a consulta entra no histórico como AUTOMÁTICA.</li>
      </ul>
    </div>
  )
}
