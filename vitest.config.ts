import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// Configuración mínima de pruebas unitarias/de componente (Vitest + Testing Library).
// Los *.test.mjs existentes (node:test) quedan fuera: se ejecutan con `node --test`.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
