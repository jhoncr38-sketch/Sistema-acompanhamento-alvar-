import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

/**
 * Empacota a rotina de monitoramento para a Edge Function (Deno).
 * Uso: npm run build:edge → supabase/functions/_shared/monitoring.js
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'supabase/functions/_shared',
    emptyOutDir: false,
    minify: false,
    target: 'es2022',
    lib: {
      entry: fileURLToPath(new URL('./src/server/monitoring-entry.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'monitoring.js',
    },
    rollupOptions: {
      external: ['@supabase/supabase-js'],
      output: { paths: { '@supabase/supabase-js': 'npm:@supabase/supabase-js@2' } },
    },
  },
})
