import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// In sviluppo /api e /data vanno al server locale FastAPI (server/main.py, porta 8001).
const server = 'http://127.0.0.1:8001'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  server: {
    port: 5173,
    proxy: { '/api': server, '/data': server },
  },
})
