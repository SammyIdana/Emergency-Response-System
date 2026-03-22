import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/auth':      { target: 'http://localhost:3001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/auth/, '') },
      '/api/incident':  { target: 'http://localhost:3002', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/incident/, '') },
      '/api/tracking':  { target: 'http://localhost:3003', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/tracking/, '') },
      '/api/analytics': { target: 'http://localhost:3004', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/analytics/, '') },
    }
  }
})
