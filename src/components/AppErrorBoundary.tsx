import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null; info: string }

/**
 * Captura errores de render en toda la app. Sin esto, cualquier excepción
 * durante el arranque (providers, router, detección de plataforma) deja la
 * pantalla en blanco sin ninguna pista — problema típico en Tauri/Android.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Queda en la consola del WebView (Tauri: clic derecho → Inspeccionar; Android: chrome://inspect)
    console.error('[Tukifac] Error de arranque:', error, info)
    this.setState({ info: info.componentStack ?? '' })
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error, info } = this.state
    if (!error) return this.props.children

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
