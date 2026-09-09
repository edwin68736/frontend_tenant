import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null; info: string; autoReloading: boolean }

/** sessionStorage: cuándo se hizo el último auto-reload por chunk viejo, para no entrar en loop
 *  si el reload tampoco arregla nada (servidor caído de verdad, no solo un deploy reciente). */
const CHUNK_RELOAD_KEY = 'tukifac:chunk-reload-at'
const CHUNK_RELOAD_COOLDOWN_MS = 15_000

/**
 * "Failed to fetch dynamically imported module" (Chrome/Edge), "error loading dynamically
 * imported module" (Firefox) e "Importing a module script failed" (Safari) son el mismo caso:
 * el navegador tenía cargado un index.html de ANTES del último deploy, que referencia un chunk
 * con hash viejo (ej. POSPage-<hash>.js) que el deploy siguiente ya borró del servidor (rsync
 * --delete, ver deploy.yml) — el import() dinámico del lazy-loading de la ruta hace 404. No es un
 * error real de la app: un reload trae el index.html nuevo, con los hashes correctos.
 */
function isStaleChunkError(error: Error): boolean {
  const msg = `${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase()
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('chunkloaderror')
  )
}

/** true si NO se intentó ya un auto-reload por este motivo en los últimos
 *  CHUNK_RELOAD_COOLDOWN_MS — si el reload tampoco lo arregla (servidor caído, red, etc.), no hay
 *  que quedar recargando en bucle: se cae a la pantalla de error técnico de siempre. */
function canAutoReloadForStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0)
    if (Date.now() - last < CHUNK_RELOAD_COOLDOWN_MS) return false
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
    return true
  } catch {
    // sessionStorage no disponible (modo privado estricto, etc.): mejor no arriesgar un loop.
    return false
  }
}

/**
 * Captura errores de render en toda la app. Sin esto, cualquier excepción
 * durante el arranque (providers, router, detección de plataforma) deja la
 * pantalla en blanco sin ninguna pista — problema típico en Tauri/Android.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '', autoReloading: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Decidido acá (sincrónico, antes del primer render con el error) para que ese primer
    // render ya muestre el mensaje amigable de "actualizando" en vez de la pantalla técnica —
    // sin esto habría un parpadeo del stack trace antes de que componentDidCatch dispare el reload.
    return { error, autoReloading: isStaleChunkError(error) && canAutoReloadForStaleChunk() }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Queda en la consola del WebView (Tauri: clic derecho → Inspeccionar; Android: chrome://inspect)
    console.error('[Tukifac] Error de arranque:', error, info)
    this.setState({ info: info.componentStack ?? '' })

    if (this.state.autoReloading) this.handleReload()
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error, info, autoReloading } = this.state
    if (!error) return this.props.children

    if (autoReloading) {
      return (
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 24,
            background: '#f3f4f6',
            color: '#111827',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              border: '3px solid #d1d5db',
              borderTopColor: '#15803d',
              borderRadius: '50%',
              animation: 'tukifac-spin 0.8s linear infinite',
            }}
          />
          <style>{'@keyframes tukifac-spin { to { transform: rotate(360deg) } }'}</style>
          <p style={{ fontSize: 14, color: '#374151' }}>Hay una versión nueva disponible, actualizando…</p>
        </div>
      )
    }

    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          background: '#f3f4f6',
          color: '#111827',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>La aplicación no pudo iniciar</h1>
        <p style={{ fontSize: 13, color: '#6b7280', maxWidth: 480 }}>
          Ocurrió un error durante el arranque. Detalle técnico:
        </p>
        <pre
          style={{
            maxWidth: '100%',
            maxHeight: 240,
            overflow: 'auto',
            textAlign: 'left',
            fontSize: 11,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 12,
            color: '#b91c1c',
            whiteSpace: 'pre-wrap',
          }}
        >
          {String(error?.stack || error?.message || error)}
          {info ? `\n\nComponentes:${info}` : ''}
        </pre>
        <button
          type="button"
          onClick={this.handleReload}
          style={{
            borderRadius: 12,
            background: '#15803d',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            padding: '10px 20px',
            border: 'none',
          }}
        >
          Reintentar
        </button>
      </div>
    )
  }
}
