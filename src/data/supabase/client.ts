import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Cliente do navegador: usa apenas a anon key; a segurança é garantida pelas políticas RLS. */
export function createSupabaseBrowserClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { headers: { 'x-app-origin': 'app' } },
  })
}
