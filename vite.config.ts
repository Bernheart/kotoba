/// <reference types="vitest/config" />
import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { readFileSync, renameSync, existsSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Modes:
//  - default: PWA (GitHub Pages sets BASE_PATH=/kotoba/)
//  - single:  one self-contained HTML file in dist-single/kotoba.html (no service worker, no web fonts)
export default defineConfig(({ mode }) => {
  const single = mode === 'single'
  const plugins: PluginOption[] = [react(), tailwindcss()]
  if (single) {
    plugins.push(viteSingleFile({ removeViteModuleLoader: true }), {
      name: 'rename-single',
      closeBundle() {
        if (existsSync('dist-single/index.html')) renameSync('dist-single/index.html', 'dist-single/kotoba.html')
      },
    })
  } else {
    plugins.push(
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'splash/*.png'],
        manifest: {
          name: 'Kotoba 言葉 — Genki vocabulary',
          short_name: 'Kotoba',
          description: 'Personal Genki vocabulary trainer with spaced repetition.',
          lang: 'en',
          start_url: './',
          scope: './',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#0f1117',
          theme_color: '#0f1117',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,webmanifest}', 'icons/*.png', 'apple-touch-icon.png'],
          // Noto fonts are ~120 unicode-range slices: cache the ones actually used, on demand.
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.endsWith('.woff2'),
              handler: 'CacheFirst',
              options: { cacheName: 'fonts', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
          ],
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
        },
      }),
    )
  }
  return {
    base: single ? './' : (process.env.BASE_PATH ?? '/'),
    define: { __APP_VERSION__: JSON.stringify(pkg.version), __SINGLE__: JSON.stringify(single) },
    plugins,
    publicDir: single ? false : 'public',
    build: single ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 5000 } : { chunkSizeWarningLimit: 1500 },
    server: { port: 5173 },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  }
})
