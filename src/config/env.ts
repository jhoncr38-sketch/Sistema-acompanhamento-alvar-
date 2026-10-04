/** Lê apenas variáveis públicas (VITE_*). A service_role key NUNCA deve existir no frontend. */
export const env = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || null,
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || null,
}

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
