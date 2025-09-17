
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
      '/ws':  { target: 'ws://localhost:8787', changeOrigin: true, ws: true }
    },
    fs: {
      strict: true,
      allow: [
        path.resolve(__dirname),
        path.resolve(__dirname, 'node_modules'),
        path.resolve(__dirname, '..'),
        process.env.USERPROFILE ? path.resolve(process.env.USERPROFILE) : ''
      ].filter(Boolean)
    }
  },
  optimizeDeps: { force: true },
  build: {
    rollupOptions: {
      output: { manualChunks: { echarts: ['echarts'], maplibre: ['maplibre-gl'] } }
    },
    chunkSizeWarningLimit: 1500
  }
});
