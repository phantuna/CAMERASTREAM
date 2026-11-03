import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/snapshots': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/ws/tracking': {
        target: 'http://localhost:5000',
        ws: true,
        changeOrigin: true
      },
      '/tracking-events': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
})

