import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Backend URL injected at build time (VITE_API_URL); defaults to local dev.
export default defineConfig({
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8001', changeOrigin: true },
      '/health': { target: 'http://localhost:8001', changeOrigin: true },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Flood Risk Map',
        short_name: 'Flood Risk',
        description: 'Flood risk forecasts with a visible evidence chain',
        theme_color: '#2196f3',
        background_color: '#0b1d2a',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globIgnores: [
          '**/FloodModule-*.js',
          '**/FloodModule-*.css',
          '**/data/*.json',
          '**/insp_*.png',
          '**/waterlab_*.js',
          '**/sirajganj_sat.js',
        ],
        runtimeCaching: [
          {
            urlPattern: /server\.arcgisonline\.com|basemaps\.cartocdn\.com|tile\.openstreetmap\.org|elevation-tiles-prod\.s3\.amazonaws\.com|tiles\.openfreemap\.org/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 2592000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
