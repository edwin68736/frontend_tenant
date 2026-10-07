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
          // Chunks por paquete. Antes solo se separaban recharts/jspdf/pdfjs por coincidencia de texto en la ruta, y
          // Rollup dejaba DENTRO de vendor-charts a react y react-dom (los usa recharts, el primero que los pidió)
          // y dentro de vendor-jspdf a utilidades compartidas: la entrada tenía que importar esos archivos para
          // arrancar y bajaba ~290 KB de gráficos y PDF hasta en el login. Con react en su propio chunk, los
          // chunks pesados solo contienen paquetes exclusivos y se cargan cuando una vista los usa.
          manualChunks(id) {
            // Helper de Vite para import() dinámicos (__vitePreload): lo usa la entrada; si Rollup lo deja dentro de
            // vendor-jspdf, la entrada tiene que bajar jsPDF (~130 KB br) para poder arrancar.
            if (id.includes('vite/preload-helper') || id.includes('vite/modulepreload-polyfill')) return 'vendor-common'
            if (!id.includes('node_modules')) return
            const m = id.match(/node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/)
            const pkg = m ? m[1] : ''
            if (
              ['react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom', '@remix-run/router', 'react-is'].includes(pkg)
            ) {
              return 'vendor-react'
            }
            // Exclusivos de recharts (ninguna otra parte de la app los importa).
            if (
              pkg === 'recharts' ||
              pkg === 'recharts-scale' ||
              pkg === 'react-smooth' ||
              pkg === 'decimal.js-light' ||
              pkg === 'fast-equals' ||
              pkg === 'eventemitter3' ||
              pkg === 'internmap' ||
              pkg === 'victory-vendor' ||
              pkg === 'lodash' ||
              pkg === 'prop-types' ||
              pkg.startsWith('d3-')
            ) {
              return 'vendor-charts'
            }
            // Pequeñas y compartidas entre la app y los chunks pesados: en un chunk neutro, para que no arrastren
            // a recharts/jsPDF al arranque.
            if (['clsx', 'tiny-invariant', 'fflate', '@babel/runtime'].includes(pkg)) return 'vendor-common'
            if (pkg === 'pdfjs-dist') return 'vendor-pdf'
            // Exclusivos de jsPDF. fflate y @babel/runtime también los usan otras dependencias: se dejan fuera.
            if (['jspdf', 'pako', 'fast-png', 'iobuffer', 'canvg', 'html2canvas', 'dompurify'].includes(pkg)) return 'vendor-jspdf'
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
