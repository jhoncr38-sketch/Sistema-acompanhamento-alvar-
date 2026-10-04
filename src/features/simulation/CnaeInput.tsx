import { useMemo, type InputHTMLAttributes } from 'react'
import { SuggestInput } from '@/components/ui/SuggestInput'
import { formatCnae, normalizeCnae } from '@/domain/format'
import type { Cnae } from '@/domain/types'

export interface CnaeEntry {
  text: string
  /** 7 dígitos quando o texto contém um CNAE completo. */
  code: string | null
  description: string | null
}

export const EMPTY_CNAE: CnaeEntry = { text: '', code: null, description: null }

function normalizeText(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function cnaeEntry(code: string, description: string | null): CnaeEntry {
  const normalized = normalizeCnae(code)
  return { text: description ? `${formatCnae(normalized)} — ${description}` : formatCnae(normalized), code: normalized, description }
}

/** Aceita "6911-7/01", "6911701" ou o texto já selecionado ("6911-7/01 — Serviços advocatícios"). */
export function parseCnaeText(text: string, cnaes: readonly Cnae[]): CnaeEntry {
  const match = text.match(/^\s*(\d{4})-?(\d)\/?(\d{2})(?!\d)/)
  if (!match) return { text, code: null, description: null }
  const code = `${match[1]}${match[2]}${match[3]}`
  return { text, code, description: cnaes.find((c) => normalizeCnae(c.code) === code)?.description ?? null }
}

export function CnaeInput({
  value,
  onChange,
  cnaes,
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onSelect'> & {
  value: CnaeEntry
  onChange: (entry: CnaeEntry) => void
  cnaes: readonly Cnae[]
}) {
  const options = useMemo(() => {
    const text = value.text.trim()
    if (text.length < 2) return []
    if (value.code && value.description && text === cnaeEntry(value.code, value.description).text) return []
    const digits = text.replace(/\D/g, '')
    const words = normalizeText(text.replace(/[\d\-/—]/g, ' ')).trim()
    return cnaes
      .filter((c) => {
        if (digits.length >= 2 && normalizeCnae(c.code).startsWith(digits)) return true
        return words.length >= 3 && normalizeText(c.description).includes(words)
      })
      .slice(0, 8)
      .map((c) => ({ key: c.code, title: `${formatCnae(c.code)} — ${c.description}` }))
  }, [value, cnaes])

  return (
    <SuggestInput
      {...inputProps}
      value={value.text}
      options={options}
      onChange={(text) => onChange(parseCnaeText(text, cnaes))}
      onSelect={(code) => {
        const cnae = cnaes.find((c) => c.code === code)
        if (cnae) onChange(cnaeEntry(cnae.code, cnae.description))
      }}
      onBlur={() => {
        // CNAE completo digitado e presente no catálogo: mostra a descrição.
        if (value.code && value.description) onChange(cnaeEntry(value.code, value.description))
      }}
      placeholder={inputProps.placeholder ?? 'Código (6911-7/01) ou descrição (advocacia)'}
    />
  )
}
