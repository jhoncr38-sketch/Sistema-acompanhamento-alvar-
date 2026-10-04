import type { ISODate, ISODateTime } from './types'

/** `2026-12-31` → `31/12/2026`. */
export function formatDate(date: ISODate | null | undefined): string {
  if (!date) return '—'
  const [y, m, d] = date.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** Data e hora local: `04/10/2026 09:42`. */
export function formatDateTime(value: ISODateTime | null | undefined): string {
  if (!value) return '—'
  const dt = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

/** CNAE só com dígitos (7) → `1091-1/02`. */
export function formatCnae(code: string): string {
  const d = code.replace(/\D/g, '')
  if (d.length !== 7) return code
  return `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5)}`
}

export function normalizeCnae(code: string): string {
  return code.replace(/\D/g, '').slice(0, 7)
}
