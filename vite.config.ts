/// <reference types="vitest/config" />
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const LIBRARY = fileURLToPath(new URL('./legislacao', import.meta.url))
const LIBRARY_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * Biblioteca de legislação (pasta `legislacao/`): servida em /legislacao durante o desenvolvimento e copiada sem
 * alteração para o build. Os PDFs oficiais ficam preservados como foram baixados.
 */
function legislationLibrary(): Plugin {
  let outDir = resolve('dist')
  const serve = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const relative = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/')
    const file = normalize(join(LIBRARY, relative))
    if (!file.startsWith(LIBRARY + sep) || !existsSync(file) || !statSync(file).isFile()) return next()
    res.setHeader('Content-Type', LIBRARY_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream')
    createReadStream(file).pipe(res)
  }
  return {
    name: 'legislation-library',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      server.middlewares.use('/legislacao', serve)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/legislacao', serve)
    },
    closeBundle() {
      if (existsSync(LIBRARY)) cpSync(LIBRARY, join(outDir, 'legislacao'), { recursive: true })
    },
  }
}

export default defineConfig({
  plugins: [
    legislationLibrary(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Alexandre Alvarás — Monitor de Licenças & Alvarás',
        short_name: 'Alvarás',
        description: 'Monitoramento de licenças, alvarás e registros das empresas atendidas pelo escritório.',
        lang: 'pt-BR',
        theme_color: '#0b2340',
        background_color: '#e9f1fb',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        // a biblioteca de legislação (PDF, CSV, JSON) nunca é trocada pela página do app
        navigateFallbackDenylist: [/^\/auth\//, /^\/legislacao\//],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
