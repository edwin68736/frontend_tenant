import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      // En desarrollo, las peticiones /api/* se proxean al backend Go
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // Si el tenant se identifica por header en local, añádelo aquí
        // o usa el archivo .env para configurar la URL del backend
      },
    },
  },
})
