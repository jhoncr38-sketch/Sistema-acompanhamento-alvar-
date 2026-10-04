import { useDataSource } from '@/app/data-context'
import { useSession } from '@/app/session'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Form'
import { LoadingState } from '@/components/ui/States'
import { Table, TableFrame, TD, TH, THead, TR } from '@/components/ui/Table'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/data/errors'
import { ROLE_LABEL } from '@/domain/labels'
import type { UserRole } from '@/domain/types'
import { useInvalidate, useUsers } from '@/hooks/queries'
import { SectionHeader } from './SectionHeader'

const PERMISSIONS: [string, boolean, boolean, boolean, boolean][] = [
  ['Ver empresas, licenças e histórico', true, true, true, true],
  ['Cadastrar e editar empresas e licenças', true, true, true, false],
  ['Registrar consultas, anexar documentos, tratar alertas', true, true, true, false],
  ['Excluir empresa sem histórico', true, false, false, false],
  ['Configurações, catálogo, integrações e usuários', true, false, false, false],
  ['Ver auditoria', true, true, false, false],
]

export function UsersSection({ readOnly }: { readOnly: boolean }) {
  const { data, isLoading } = useUsers()
  const ds = useDataSource()
  const { user: me } = useSession()
  const toast = useToast()
  const invalidate = useInvalidate()

  async function change(id: string, role: UserRole) {
    try {
      await ds.users.updateRole(id, role)
      await invalidate.all()
      toast.success('Perfil atualizado')
    } catch (error) {
      toast.error('Não foi possível alterar', errorMessage(error))
    }
  }

  return (
    <div>
      <SectionHeader
        title="Usuários e perfis de acesso"
        description="Login pelo Supabase Auth. Novos usuários entram com o perfil Consulta (somente leitura) até um administrador definir o perfil."
      />
      {isLoading ? (
        <LoadingState />
      ) : (
        <TableFrame>
          <Table className="text-[12.5px]">
            <THead>
              <tr className="h-[34px]">
                <TH>Usuário</TH>
                <TH>E-mail</TH>
                <TH>Perfil</TH>
                <TH>Situação</TH>
              </tr>
            </THead>
            <tbody>
              {data?.map((u) => (
                <TR key={u.id} className="h-[42px]">
                  <TD className="font-semibold text-ink">
                    {u.fullName} {u.id === me?.id && <span className="font-normal text-muted">(você)</span>}
                  </TD>
                  <TD>{u.email}</TD>
                  <TD>
                    <Select
                      aria-label={`Perfil de ${u.fullName}`}
                      value={u.role}
                      disabled={readOnly || u.id === me?.id}
                      onChange={(e) => change(u.id, e.target.value as UserRole)}
                      className="h-[30px] w-[160px] text-[12.5px]"
                    >
                      {Object.entries(ROLE_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </TD>
                  <TD>
                    <Badge tone={u.active ? 'ok' : 'neutral'}>{u.active ? 'Ativo' : 'Inativo'}</Badge>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}

      <h3 className="mt-6 mb-2 text-[13px] font-bold tracking-wide text-ink uppercase">Permissões por perfil</h3>
      <TableFrame>
        <Table className="text-[12.5px]">
          <THead>
            <tr className="h-[34px]">
              <TH>Ação</TH>
              {(['administrador', 'contador', 'colaborador', 'consulta'] as const).map((r) => (
                <TH key={r} className="text-center">
                  {ROLE_LABEL[r]}
                </TH>
              ))}
            </tr>
          </THead>
          <tbody>
            {PERMISSIONS.map(([label, ...allowed]) => (
              <TR key={label} className="h-[34px]">
                <TD>{label}</TD>
                {allowed.map((ok, i) => (
                  <TD key={i} className={ok ? 'text-center font-bold text-ok-ink' : 'text-center text-muted'}>
                    {ok ? '✓' : '—'}
                  </TD>
                ))}
              </TR>
            ))}
          </tbody>
        </Table>
      </TableFrame>
    </div>
  )
}
