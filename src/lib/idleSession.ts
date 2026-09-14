/**
 * Reloj de inactividad para el cierre de sesión automático de Tukifac (ver hooks/useIdleLogout.ts).
 * Vive en localStorage — no solo en memoria — por dos razones:
 *  - Sobrevive a un F5/recarga de página: recargar no debe regalar 30 minutos frescos de sesión.
 *  - Varias pestañas del mismo navegador comparten el mismo reloj: actividad en una pestaña
 *    mantiene viva la sesión de las demás, sin necesidad de escuchar el evento `storage`.
 */
const LAST_ACTIVITY_KEY = 'tukifac_last_activity_at'

export function markIdleActivity(): void {
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()))
}

export function clearIdleActivity(): void {
  localStorage.removeItem(LAST_ACTIVITY_KEY)
}

/** Solo inicializa el reloj si no existía — no pisa uno ya en curso (ver comentario de arriba). */
export function ensureIdleActivity(): void {
  if (localStorage.getItem(LAST_ACTIVITY_KEY) == null) markIdleActivity()
}

export function msSinceLastActivity(): number {
  const raw = localStorage.getItem(LAST_ACTIVITY_KEY)
  const parsed = raw ? Number(raw) : NaN
  const lastActivity = Number.isFinite(parsed) ? parsed : Date.now()
  return Date.now() - lastActivity
}
