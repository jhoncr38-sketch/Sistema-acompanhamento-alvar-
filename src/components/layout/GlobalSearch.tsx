import { Building, FileText, Hash, ShieldCheck } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { SearchInput } from '@/components/ui/Form'
import type { SearchResult } from '@/data/types'
import { formatCnpj } from '@/domain/cnpj'
import { useGlobalSearch } from '@/hooks/queries'
import { cn } from '@/lib/cn'

const KIND = {
  empresa: { label: 'Empresa', icon: Building },
  licenca: { label: 'Nº da licença', icon: ShieldCheck },
  protocolo: { label: 'Protocolo', icon: Hash },
  documento: { label: 'Documento', icon: FileText },
} as const

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** Busca por razão social, nome fantasia, CNPJ, protocolo, nº de licença e documentos. */
export function GlobalSearch({ className }: { className?: string }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const debounced = useDebounced(query, 250)
  const { data, isFetching } = useGlobalSearch(debounced)
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const listId = useId()
  const results = data ?? []

  useEffect(() => {
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => setActive(0), [debounced])

  function go(r: SearchResult) {
    setOpen(false)
    setQuery('')
    navigate(`/empresas/${r.companyId}${r.companyLicenseId ? `?licenca=${r.companyLicenseId}` : ''}`)
  }

  const showPanel = open && debounced.trim().length >= 2

  return (
    <div ref={ref} className={cn('relative', className)}>
      <SearchInput
        value={query}
        onChange={(v) => {
          setQuery(v)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => Math.min(i + 1, results.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' && results[active]) {
            go(results[active])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
        placeholder="Pesquisar empresa, CNPJ ou protocolo..."
        label="Pesquisar empresa, CNPJ ou protocolo"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-activedescendant={showPanel && results[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
      />
      {showPanel && (
        <div className="absolute top-full right-0 left-0 z-40 mt-1.5 overflow-hidden rounded-xl border border-line bg-white shadow-pop">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-[12.5px] text-muted">{isFetching ? 'Pesquisando…' : 'Nenhum resultado encontrado.'}</p>
          ) : (
            <ul id={listId} role="listbox" className="max-h-80 overflow-y-auto py-1">
              {results.map((r, i) => {
                const k = KIND[r.kind]
                const Icon = k.icon
                return (
                  <li
                    key={`${r.kind}-${r.companyId}-${r.companyLicenseId}-${r.title}`}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      go(r)
                    }}
                    className={cn('flex cursor-pointer items-center gap-3 px-3 py-2', i === active && 'bg-[#eef5fe]')}
                  >
                    <Icon className="size-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">{r.title}</span>
                      <span className="block truncate text-[11.5px] text-muted">
                        {r.kind === 'empresa' ? formatCnpj(r.subtitle) : r.subtitle}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10.5px] font-semibold tracking-wide text-muted uppercase">{k.label}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
