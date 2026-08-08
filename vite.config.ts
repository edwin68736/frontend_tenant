import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import httpProxy from 'http-proxy'

function useRelativeBase(mode: string): boolean {
  return Boolean(process.env.TAURI_PLATFORM) || mode === 'capacitor'
}

function normalizeApiOrigin(raw: string | undefined): string {
  const fallback = 'http://localhost:3000'
  if (!raw?.trim()) return fallback
  let base = raw.trim().replace(/\/+$/, '')
  if (base.endsWith('/api')) base = base.slice(0, -4)
  return base
}

/** Proxy /api según slug del tenant (header X-Tenant-Api-Origin) en dev nativo y web local. */
function dynamicApiProxyPlugin(defaultTarget: string): Plugin {
  const secure = defaultTarget.startsWith('https://')
  const proxy = httpProxy.createProxyServer({ changeOrigin: true, secure })

  return {
    name: 'tukifac-tenant-api-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        if (!/^\/(api|uploads|storage|health)(\/|$)/.test(url)) {
          next()
          return
        }
        const raw = req.headers['x-tenant-api-origin']
        const target =
          typeof raw === 'string' && raw.trim()
            ? normalizeApiOrigin(raw.trim())
            : defaultTarget
        delete req.headers['x-tenant-api-origin']
        proxy.web(req, res, { target }, (err) => {
          if (err && !res.headersSent) {
            res.statusCode = 502
            res.end('Proxy error')
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const centralTarget = normalizeApiOrigin(env.VITE_CENTRAL_API_URL || env.VITE_API_URL)

  return {
    base: useRelativeBase(mode) ? './' : '/',
    plugins: [react(), dynamicApiProxyPlugin(centralTarget)],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    optimizeDeps: {
      include: ['@tauri-apps/api/core', '@capacitor/core'],
    },
    build: {
      // Sin esto, Vite 7 usa safari16 como piso por defecto (esbuild) y deja sin
      // transpilar sintaxis ES2021+ (ej. `||=`, usado 150+ veces en jsPDF/Recharts,
      // que se cargan eager en el chunk de arranque vía MainLayout → PdfViewerHost).
      // En iPhones con Safari más viejo eso es un SyntaxError de PARSEO del <script>
      // antes de que React llegue a montar — pantalla en blanco / "no carga", sin que
      // el ErrorBoundary pueda atraparlo. Bajar el target hace que esbuild transpile
      // TODO el bundle (incluidas las dependencias) a algo compatible.
      target: ['es2019', 'safari13', 'ios13', 'chrome87', 'firefox78', 'edge88'],
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('recharts')) return 'vendor-charts'
            if (id.includes('pdfjs')) return 'vendor-pdf'
            if (id.includes('jspdf')) return 'vendor-jspdf'
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  }
})
