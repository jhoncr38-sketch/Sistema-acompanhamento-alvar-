import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  description?: string
}

interface ToastApi {
  show(toast: Omit<ToastItem, 'id'>): void
  success(title: string, description?: string): void
  error(title: string, description?: string): void
  info(title: string, description?: string): void
}

const ToastContext = createContext<ToastApi | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), [])

  const show = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = nextId++
      setItems((list) => [...list.slice(-3), { ...toast, id }])
      setTimeout(() => dismiss(id), toast.tone === 'error' ? 7000 : 4500)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, description) => show({ tone: 'success', title, description }),
      error: (title, description) => show({ tone: 'error', title, description }),
      info: (title, description) => show({ tone: 'info', title, description }),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => {
          const Icon = t.tone === 'success' ? CircleCheck : t.tone === 'error' ? CircleAlert : Info
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-white p-3 shadow-pop"
            >
              <Icon
                className={cn(
                  'mt-0.5 size-5 shrink-0',
                  t.tone === 'success' && 'text-ok',
                  t.tone === 'error' && 'text-danger-ink',
                  t.tone === 'info' && 'text-primary',
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink">{t.title}</p>
                {t.description && <p className="mt-0.5 text-[12px] text-muted">{t.description}</p>}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} className="rounded p-0.5 text-muted hover:text-ink" aria-label="Fechar aviso">
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast precisa de <ToastProvider>')
  return ctx
}
