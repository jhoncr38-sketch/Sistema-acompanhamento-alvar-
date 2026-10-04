import { env, isSupabaseConfigured } from '@/config/env'
import { createMockDataSource } from './mock/mock-data-source'
import type { DataSource } from './types'

/**
 * Supabase quando configurado no .env; caso contrário, modo demonstração com dados fictícios.
 * O cliente Supabase só é baixado quando necessário.
 */
export async function loadDataSource(): Promise<DataSource> {
  if (!isSupabaseConfigured) return createMockDataSource()
  const { createSupabaseDataSource } = await import('./supabase/supabase-data-source')
  return createSupabaseDataSource(env.supabaseUrl!, env.supabaseAnonKey!)
}
