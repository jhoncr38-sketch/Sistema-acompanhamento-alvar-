/**
 * CNPJ numérico e alfanumérico (IN RFB 2.229/2024, a partir de julho/2026):
 * 12 posições alfanuméricas + 2 dígitos verificadores numéricos.
 */
const WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

export function normalizeCnpj(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14)
}

export function formatCnpj(value: string): string {
  const v = normalizeCnpj(value)
  const parts = [v.slice(0, 2), v.slice(2, 5), v.slice(5, 8), v.slice(8, 12), v.slice(12, 14)]
  let out = parts[0] ?? ''
  if (parts[1]) out += `.${parts[1]}`
  if (parts[2]) out += `.${parts[2]}`
  if (parts[3]) out += `/${parts[3]}`
  if (parts[4]) out += `-${parts[4]}`
  return out
}

export function isCnpjShapeValid(value: string): boolean {
  return /^[0-9A-Z]{12}[0-9]{2}$/.test(normalizeCnpj(value))
}

function checkDigit(base: string, weights: number[]): number {
  const sum = [...base].reduce((acc, ch, i) => acc + (ch.charCodeAt(0) - 48) * (weights[i] ?? 0), 0)
  const rest = sum % 11
  return rest < 2 ? 0 : 11 - rest
}

export function isCnpjChecksumValid(value: string): boolean {
  const v = normalizeCnpj(value)
  if (!isCnpjShapeValid(v) || /^(\d)\1{13}$/.test(v)) return false
  const d1 = checkDigit(v.slice(0, 12), WEIGHTS_1)
  const d2 = checkDigit(v.slice(0, 12) + d1, WEIGHTS_2)
  return v.endsWith(`${d1}${d2}`)
}
