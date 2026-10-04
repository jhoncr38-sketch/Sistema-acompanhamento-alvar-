import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { brand } from '@/config/brand'

interface PageMeta {
  title: string
  subtitle?: string
}

const PageMetaContext = createContext<{ meta: PageMeta; setMeta: (m: PageMeta) => void } | null>(null)

export function PageMetaProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<PageMeta>({ title: brand.moduleName })
  return <PageMetaContext.Provider value={{ meta, setMeta }}>{children}</PageMetaContext.Provider>
}

export function usePageMetaValue(): PageMeta {
  return useContext(PageMetaContext)?.meta ?? { title: brand.moduleName }
}

/** Define o título exibido no cabeçalho e na aba do navegador. */
export function usePageMeta(title: string, subtitle?: string) {
  const ctx = useContext(PageMetaContext)
  const setMeta = ctx?.setMeta
  useEffect(() => {
    setMeta?.({ title, subtitle })
    document.title = title === brand.moduleName ? `${brand.productName} — ${brand.moduleName}` : `${title} · ${brand.productName}`
  }, [title, subtitle, setMeta])
}
