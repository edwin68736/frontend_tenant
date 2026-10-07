import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { startRum, trackViewSettle } from './rum'

/**
 * Mide cuánto tarda cada vista en cargar sus datos (ver lib/rum/rum.ts). Se monta una vez dentro del Router;
 * no renderiza nada. La primera ruta cuenta como "carga completa de página", las siguientes como navegación interna.
 */
export default function RumRouteTracker() {
  const { pathname } = useLocation()
  const firstRef = useRef(true)

  useEffect(() => {
    startRum()
    const first = firstRef.current
    firstRef.current = false
    return trackViewSettle(pathname, first)
  }, [pathname])

  return null
}
