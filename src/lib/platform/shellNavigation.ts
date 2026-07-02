import type { NavigateFunction } from 'react-router-dom'
import { isNativeShell } from '@/lib/platform/detect'

/** Navegación con replace; en Tauri/Capacitor también actualiza el hash (HashRouter). */
export function replaceRoute(path: string, navigate: NavigateFunction) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  navigate(normalized, { replace: true })
  if (isNativeShell() && typeof window !== 'undefined') {
    const hash = `#${normalized}`
    if (window.location.hash !== hash) {
      window.location.hash = hash
    }
  }
}
