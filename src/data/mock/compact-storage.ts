/**
 * Gravação compacta do banco da demonstração no navegador. As tabelas de regras da legislação têm milhares de linhas
 * com valores repetidos (versão, classificação, anexo, documento…): cada valor é guardado uma vez num dicionário e as
 * linhas guardam só os índices. Sem isso, a base de Teresina passaria do limite de armazenamento do navegador.
 */
export interface PackedRows {
  packed: 1
  keys: string[]
  dict: unknown[]
  rows: number[][]
}

export function packRows(rows: readonly object[]): PackedRows {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const dict: unknown[] = []
  const index = new Map<string, number>()
  const ref = (value: unknown) => {
    const normalized = value === undefined ? null : value
    const key = JSON.stringify(normalized)
    let i = index.get(key)
    if (i === undefined) {
      i = dict.length
      dict.push(normalized)
      index.set(key, i)
    }
    return i
  }
  return { packed: 1, keys, dict, rows: rows.map((r) => keys.map((k) => ref((r as Record<string, unknown>)[k]))) }
}

export function isPacked(value: unknown): value is PackedRows {
  return typeof value === 'object' && value !== null && (value as PackedRows).packed === 1 && Array.isArray((value as PackedRows).rows)
}

/** Objetos e listas são copiados: linhas diferentes nunca compartilham a mesma referência. */
export function unpackRows<T>(packed: PackedRows): T[] {
  return packed.rows.map(
    (row) =>
      Object.fromEntries(
        packed.keys.map((key, i) => {
          const value = packed.dict[row[i]!]
          return [key, typeof value === 'object' && value !== null ? structuredClone(value) : value]
        }),
      ) as T,
  )
}

export const PACKED_TABLES = ['cnaeRules', 'licenseRules', 'cnaes'] as const

export function serializeDb(db: object): string {
  const record = db as Record<string, unknown>
  const packed: Record<string, unknown> = { ...record, __packed: PACKED_TABLES }
  for (const table of PACKED_TABLES) {
    if (Array.isArray(record[table])) packed[table] = packRows(record[table] as object[])
  }
  return JSON.stringify(packed)
}

export function deserializeDb<T>(raw: string): T {
  const parsed = JSON.parse(raw) as Record<string, unknown>
  for (const table of PACKED_TABLES) {
    if (isPacked(parsed[table])) parsed[table] = unpackRows(parsed[table])
  }
  delete parsed.__packed
  return parsed as T
}
