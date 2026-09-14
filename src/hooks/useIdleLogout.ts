import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { redirectToLogin } from '@/services/api'
import { ensureIdleActivity, markIdleActivity, clearIdleActivity, msSinceLastActivity } from '@/lib/idleSession'

// Decidido con el usuario (14-sep-2026): 30 min de inactividad en Tukifac (ERP, un usuario por
// equipo). Tukichef queda fuera a propósito por ahora — terminal compartida entre varios
// empleados durante el turno, necesita su propio umbral/comportamiento (pendiente aparte).
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000
const WARNING_BEFORE_MS = 5 * 60 * 1000
const CHECK_INTERVAL_MS = 15 * 1000
// mousemove/scroll disparan decenas de eventos por segundo — no tiene sentido pisar
// localStorage en cada uno, solo nos importa la resolución del CHECK_INTERVAL_MS de arriba.
const ACTIVITY_WRITE_THROTTLE_MS = 5 * 1000
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'] as const
const WARNING_TOAST_ID = 'idle-warning'

/**
 * Cierre de sesión automático por inactividad. El JWT de Tukifac no vence por inactividad (dura
 * 24h fijas — ver `PasswordSessionTTL` en el backend), así que este control vive enteramente en
 * el cliente: si dejas el equipo con la sesión abierta, se cierra sola antes de que alguien más
 * pueda usarla.
 *
 * Se activa solo mientras `enabled` (isAuthenticated) es true — se llama una vez desde
 * AuthProvider, no hace falta montarlo en cada página.
 */
export function useIdleLogout(enabled: boolean): void {
  const warnedRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    let lastWrite = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - lastWrite < ACTIVITY_WRITE_THROTTLE_MS) return
      lastWrite = now
      markIdleActivity()
      if (warnedRef.current) {
        warnedRef.current = false
        toast.dismiss(WARNING_TOAST_ID)
      }
    }

    // No pisa un reloj ya en curso (ver comentario en idleSession.ts): un F5 no debe regalar
    // 30 minutos frescos si el usuario ya llevaba 25 sin tocar nada.
    ensureIdleActivity()
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, onActivity, { passive: true }))

    const interval = window.setInterval(() => {
      const remaining = INACTIVITY_TIMEOUT_MS - msSinceLastActivity()

      if (remaining <= 0) {
        clearIdleActivity()
        toast.dismiss(WARNING_TOAST_ID)
        redirectToLogin('Tu sesión se cerró por inactividad.')
        return
      }

      if (remaining <= WARNING_BEFORE_MS && !warnedRef.current) {
        warnedRef.current = true
        const minutes = Math.max(1, Math.round(remaining / 60000))
        toast.warning(`Tu sesión se cerrará en ${minutes} min por inactividad.`, {
          id: WARNING_TOAST_ID,
          duration: remaining,
          action: { label: 'Seguir conectado', onClick: onActivity },
        })
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivity))
      window.clearInterval(interval)
    }
  }, [enabled])
}
