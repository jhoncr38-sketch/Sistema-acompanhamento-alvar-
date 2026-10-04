import { BellOff, Building, Check, CheckCheck, MessageSquarePlus, RotateCcw, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useDataSource } from '@/app/data-context'
import { usePageMeta } from '@/app/page-meta'
import { useSession } from '@/app/session'
import { Badge, PriorityBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, SearchInput, Select, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/data/errors'
import type { AlertFilter } from '@/data/types'
import { formatDateTime } from '@/domain/format'
import { ALERT_CATEGORY_LABEL, ALERT_PRIORITY_LABEL, ALERT_STATUS_LABEL } from '@/domain/labels'
import type { Alert, AlertCategory, AlertPriority } from '@/domain/types'
import { useAlerts, useCompanies, useInvalidate } from '@/hooks/queries'
import { cn } from '@/lib/cn'

const PRIORITY_ORDER: Record<AlertPriority, number> = { critica: 0, alta: 1, media: 2, baixa: 3 }
const BORDER: Record<AlertPriority, string> = {
  critica: 'border-l-danger',
  alta: 'border-l-[#f5710f]',
  media: 'border-l-warn',
  baixa: 'border-l-neutral',
}

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function AlertsPage() {
  usePageMeta('Central de Alertas', 'Vencimentos, alterações detectadas, erros de consulta e pendências')
  const [status, setStatus] = useState<AlertFilter['status']>('pendentes')
  const [category, setCategory] = useState<AlertCategory | ''>('')
  const [priority, setPriority] = useState<AlertPriority | ''>('')
  const [query, setQuery] = useState('')
  const [resolving, setResolving] = useState<Alert | null>(null)
  const { data, isLoading, error, refetch } = useAlerts({ status })
  const { data: companies } = useCompanies()
  const companyName = useMemo(() => new Map((companies ?? []).map((c) => [c.id, c.legalName])), [companies])

  const list = useMemo(() => {
    const q = normalize(query.trim())
    return (data ?? [])
      .filter((a) => (!category || a.category === category) && (!priority || a.priority === priority))
      .filter((a) => !q || normalize(`${a.title} ${a.message} ${companyName.get(a.companyId) ?? ''}`).includes(q))
      .sort((a, b) => Number(a.status === 'resolvido') - Number(b.status === 'resolvido') || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.createdAt.localeCompare(a.createdAt))
  }, [data, category, priority, query, companyName])

  const counts = useMemo(() => {
    const c: Record<AlertPriority, number> = { critica: 0, alta: 0, media: 0, baixa: 0 }
    for (const a of data ?? []) if (a.status !== 'resolvido') c[a.priority] += 1
    return c
  }, [data])

  return (
    <div className="mt-[9px] flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {(Object.keys(counts) as AlertPriority[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPriority((cur) => (cur === p ? '' : p))}
            aria-pressed={priority === p}
            className={cn('rounded-xl border-l-4 bg-white px-4 py-3 text-left shadow-card transition-shadow hover:shadow-pop', BORDER[p], priority === p && 'ring-2 ring-primary/30')}
          >
            <p className="tabular text-[24px] leading-none font-bold text-ink">{counts[p]}</p>
            <p className="mt-1 text-[12.5px] text-ink-soft">Prioridade {ALERT_PRIORITY_LABEL[p].toLowerCase()}</p>
          </button>
        ))}
      </div>

      <Card className="p-[14px]">
        <div className="flex flex-wrap gap-2.5">
          <SearchInput value={query} onChange={setQuery} label="Pesquisar alertas" placeholder="Pesquisar empresa ou alerta..." className="min-w-[220px] flex-1" />
          <Select value={status} onChange={(e) => setStatus(e.target.value as AlertFilter['status'])} aria-label="Status" className="w-auto">
            <option value="pendentes">Não resolvidos</option>
            <option value="aberto">Não lidos</option>
            <option value="lido">Lidos</option>
            <option value="resolvido">Resolvidos</option>
            <option value="">Todos</option>
          </Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value as AlertCategory | '')} aria-label="Categoria" className="w-auto">
            <option value="">Todas as categorias</option>
            {Object.entries(ALERT_CATEGORY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as AlertPriority | '')} aria-label="Prioridade" className="w-auto">
            <option value="">Todas as prioridades</option>
            {Object.entries(ALERT_PRIORITY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>

        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isLoading ? (
          <LoadingState />
        ) : list.length === 0 ? (
          <EmptyState icon={BellOff} title="Nenhum alerta" description="Não há alertas com os filtros selecionados." />
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {list.map((a) => (
              <AlertItem key={a.id} alert={a} companyName={companyName.get(a.companyId)} onResolve={() => setResolving(a)} />
            ))}
          </ul>
        )}
      </Card>

      <ResolveModal alert={resolving} onClose={() => setResolving(null)} />
    </div>
  )
}

function AlertItem({ alert: a, companyName, onResolve }: { alert: Alert; companyName?: string; onResolve: () => void }) {
  const ds = useDataSource()
  const { can } = useSession()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const manage = can('alert:manage')

  async function run(fn: () => Promise<void>, success: string) {
    setBusy(true)
    try {
      await fn()
      await invalidate.alerts()
      toast.success(success)
    } catch (error) {
      toast.error('Não foi possível concluir', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={cn('rounded-lg border border-l-4 border-line p-3', BORDER[a.priority], a.status === 'resolvido' && 'opacity-70', a.status === 'aberto' && 'bg-[#fbfdff]')}>
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge priority={a.priority} />
        <Badge tone="neutral" className="text-[11px]">{ALERT_CATEGORY_LABEL[a.category]}</Badge>
        <Badge tone={a.status === 'aberto' ? 'blue' : a.status === 'resolvido' ? 'ok' : 'neutral'} className="text-[11px]">
          {ALERT_STATUS_LABEL[a.status]}
        </Badge>
        <span className="tabular ml-auto text-[11.5px] text-muted">{formatDateTime(a.createdAt)}</span>
      </div>
      <p className={cn('mt-1.5 text-[13.5px] text-ink', a.status === 'aberto' ? 'font-bold' : 'font-semibold')}>{a.title}</p>
      <p className="text-[12.5px] text-ink-soft">{a.message}</p>
      {companyName && <p className="mt-0.5 text-[12px] text-muted">{companyName}</p>}

      {(a.notes.length > 0 || a.resolutionNote) && (
        <ul className="mt-2 space-y-1 border-l-2 border-line pl-3">
          {a.notes.map((n) => (
            <li key={n.id} className="text-[12px] text-ink-soft">
              <span className="font-semibold text-ink">{n.authorName}</span> · {formatDateTime(n.createdAt)} — {n.note}
            </li>
          ))}
          {a.resolutionNote && (
            <li className="text-[12px] text-ok-ink">
              <span className="font-semibold">Resolução:</span> {a.resolutionNote}
            </li>
          )}
        </ul>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Link to={`/empresas/${a.companyId}`} className="inline-flex h-6 items-center gap-1 rounded-md border border-[#d9e1ec] bg-white px-2 text-[11px] font-semibold text-ink hover:bg-[#f5f8fc]">
          <Building className="size-3.5" aria-hidden /> Abrir empresa
        </Link>
        {a.companyLicenseId && (
          <Link
            to={`/empresas/${a.companyId}?licenca=${a.companyLicenseId}`}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-[#d9e1ec] bg-white px-2 text-[11px] font-semibold text-ink hover:bg-[#f5f8fc]"
          >
            <ShieldCheck className="size-3.5" aria-hidden /> Abrir licença
          </Link>
        )}
        {manage && a.status === 'aberto' && (
          <Button size="xs" variant="secondary" icon={<Check className="size-3.5" />} disabled={busy} onClick={() => run(() => ds.alerts.markRead(a.id), 'Alerta marcado como lido')}>
            Marcar como lido
          </Button>
        )}
        {manage && a.status !== 'resolvido' && (
          <Button size="xs" variant="soft" icon={<CheckCheck className="size-3.5" />} disabled={busy} onClick={onResolve}>
            Resolver
          </Button>
        )}
        {manage && a.status === 'resolvido' && (
          <Button size="xs" variant="ghost" icon={<RotateCcw className="size-3.5" />} disabled={busy} onClick={() => run(() => ds.alerts.reopen(a.id), 'Alerta reaberto')}>
            Reabrir
          </Button>
        )}
        {manage && (
          <Button size="xs" variant="ghost" icon={<MessageSquarePlus className="size-3.5" />} onClick={() => setNoteOpen((v) => !v)} aria-expanded={noteOpen}>
            Adicionar observação
          </Button>
        )}
      </div>
      {noteOpen && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!note.trim()) return
            void run(async () => {
              await ds.alerts.addNote(a.id, note.trim())
              setNote('')
              setNoteOpen(false)
            }, 'Observação adicionada')
          }}
        >
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Observação"
            placeholder="Ex.: cliente avisado por telefone"
            className="h-8 flex-1 rounded-lg border border-[#d9e1ec] px-3 text-[12.5px] focus:border-primary focus:outline-none"
            autoFocus
          />
          <Button size="sm" type="submit" disabled={!note.trim() || busy}>
            Salvar
          </Button>
        </form>
      )}
    </li>
  )
}

function ResolveModal({ alert, onClose }: { alert: Alert | null; onClose: () => void }) {
  const ds = useDataSource()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function resolve() {
    if (!alert) return
    setSaving(true)
    try {
      await ds.alerts.resolve(alert.id, note.trim() || null)
      await invalidate.alerts()
      toast.success('Alerta resolvido')
      setNote('')
      onClose()
    } catch (error) {
      toast.error('Não foi possível resolver', errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={!!alert}
      onClose={onClose}
      size="sm"
      title="Resolver alerta"
      description={alert?.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={resolve} loading={saving}>
            Marcar como resolvido
          </Button>
        </>
      }
    >
      <Field label="Observação da resolução" hint="Opcional — fica registrada no alerta.">
        {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: alvará renovado, consulta registrada." />}
      </Field>
    </Modal>
  )
}
