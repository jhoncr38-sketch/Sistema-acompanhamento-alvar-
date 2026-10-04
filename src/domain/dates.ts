import type { ISODate, ISODateTime } from './types'

const DAY_MS = 86_400_000

function parseISODate(date: ISODate): number {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

/** Data local de hoje em `YYYY-MM-DD`. */
export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Data de hoje num fuso específico (servidores rodam em UTC). */
export function todayISOInTimeZone(timeZone: string, now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Dias corridos de `from` até `to` (negativo se `to` já passou). */
export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((parseISODate(to) - parseISODate(from)) / DAY_MS)
}

export function addDays(date: ISODate, days: number): ISODate {
  return new Date(parseISODate(date) + days * DAY_MS).toISOString().slice(0, 10)
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const t = parseISODate(value)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value
}

/** Combina uma data ISO com hora local `HH:mm`, devolvendo ISO com fuso. */
export function combineLocalDateTime(date: ISODate, time: string): ISODateTime {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0).toISOString()
}
