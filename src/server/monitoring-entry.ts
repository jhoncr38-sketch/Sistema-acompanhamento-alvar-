import { createClient } from '@supabase/supabase-js'
import { createSupabaseDataSource } from '@/data/supabase/supabase-data-source'
import { todayISOInTimeZone } from '@/domain/dates'
import type { UserProfile } from '@/domain/types'
import { createInAppChannel, createWhatsAppChannel } from '@/integrations/notifications/channels'
import { createResendEmailChannel } from '@/integrations/notifications/resend'
import { runMonitoringCycle, type MonitoringCycleReport } from '@/services/monitoring-job'

/**
 * Ponto de entrada da rotina no servidor. Empacotado por `npm run build:edge` em
 * supabase/functions/_shared/monitoring.js e chamado pela Edge Function `monitor-licenses`.
 * Reaproveita exatamente as mesmas regras (src/domain) e serviços usados na interface.
 */
export interface ServerMonitoringOptions {
  supabaseUrl: string
  serviceRoleKey: string
  timeZone?: string
  email?: { apiKey?: string; from?: string; to: string[] }
}

const SYSTEM_USER: UserProfile = {
  id: '00000000-0000-0000-0000-000000000000',
  fullName: 'Rotina automática',
  email: '',
  role: 'administrador',
  active: true,
}

export async function runServerMonitoring(options: ServerMonitoringOptions): Promise<MonitoringCycleReport> {
  const client = createClient(options.supabaseUrl, options.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-app-origin': 'rotina' } },
  })
  const ds = createSupabaseDataSource(options.supabaseUrl, options.serviceRoleKey, client)
  const catalog = await ds.catalog.getCatalog()
  return runMonitoringCycle(
    { ds, catalog, user: SYSTEM_USER, today: todayISOInTimeZone(options.timeZone ?? 'America/Fortaleza') },
    [
      createInAppChannel(),
      createResendEmailChannel({ apiKey: options.email?.apiKey, from: options.email?.from, to: options.email?.to ?? [] }),
      createWhatsAppChannel(),
    ],
  )
}
