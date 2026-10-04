import type { PostgrestError } from '@supabase/supabase-js'
import { AppError } from '../errors'
import type { Row } from './mappers'

const PAGE = 1000

/** Converte erros do PostgREST/Postgres em mensagens claras para a equipe. */
export function mapError(error: PostgrestError | Error | null | undefined): AppError {
  if (!error) return new AppError('UNKNOWN', 'Erro desconhecido.')
  if (error instanceof AppError) return error
  const pg = error as Partial<PostgrestError>
  const message = error.message ?? ''
  if (message === 'CONCURRENT_UPDATE') {
    return new AppError('CONCURRENT_UPDATE', 'Outra consulta desta licença foi registrada enquanto você preenchia. Revise e tente novamente.', error)
  }
  switch (pg.code) {
    case '42501':
      return new AppError('FORBIDDEN', message.includes('row-level security') ? 'Seu perfil de acesso não permite esta operação.' : message, error)
    case '23505':
      return new AppError('CONFLICT', message.includes('companies_cnpj_key') ? 'Já existe uma empresa cadastrada com este CNPJ.' : 'Registro duplicado.', error)
    case '23503':
      return new AppError('CONFLICT', 'O registro possui histórico vinculado e não pode ser excluído. Use o status Inativa.', error)
    case '23P01':
      return new AppError('CONFLICT', 'Já existe outra versão ativa desta norma com vigência no mesmo período.', error)
    case '23514':
      return new AppError('VALIDATION', 'Algum dado não atende às regras de validação.', error)
    case 'P0002':
    case 'PGRST116':
      return new AppError('NOT_FOUND', 'Registro não encontrado.', error)
  }
  if (error instanceof TypeError || /fetch|network/i.test(message)) {
    return new AppError('NETWORK', 'Sem conexão com o servidor. Verifique a internet e tente novamente.', error)
  }
  return new AppError('UNKNOWN', message || 'Erro ao acessar o banco de dados.', error)
}

export async function run<T>(promise: PromiseLike<{ data: T; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await promise
  if (error) throw mapError(error)
  return data
}

/** Como `run`, mas exige um registro. */
export async function runOne<T>(promise: PromiseLike<{ data: T; error: PostgrestError | null }>): Promise<NonNullable<T>> {
  const data = await run(promise)
  if (data === null || data === undefined) throw new AppError('NOT_FOUND', 'Registro não encontrado.')
  return data as NonNullable<T>
}

export type RangeBuilder = { range(from: number, to: number): PromiseLike<{ data: Row[] | null; error: PostgrestError | null }> }

/** Lê todas as páginas (o PostgREST limita a 1000 linhas por requisição). */
export async function selectAll(make: () => RangeBuilder): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const page = (await run(make().range(from, from + PAGE - 1))) ?? []
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}
