import { useEffect, useRef } from 'react'
import { getApiBaseUrl, getTenantApiOriginForSlug, getTenantSlug, shouldUseDevApiProxy } from '@/config/apiBaseUrl'
import { useAuth } from '@/contexts/AuthContext'
import { useBranch } from '@/contexts/BranchContext'
import { openEventStream, type EventStreamHandle } from '@/lib/sse/fetchEventStream'
import { getResolvedTenantApiUrl } from '@/lib/tenantBinding/store'
import { normalizeBindingApiUrl } from '@/lib/tenantBinding/types'
import { isNativeShell } from '@/lib/platform/detect'
import { BRANCH_INVALID_EVENT, SESSION_CONTEXT_STALE_EVENT, refreshAccessToken } from '@/services/api'

export interface BillingStatusEvent {
  event: string
  tenant_id?: number
  sale_id: number
  status: string
  pipeline_status?: string
  sunat_message?: string
}

const TERMINAL_BILLING = new Set(['accepted', 'rejected', 'error'])

export function isBillingStatusTerminal(status: string): boolean {
  return TERMINAL_BILLING.has(status)
}

/** URL del stream: SIN token ni tenant_slug (van en cabeceras). */
export function billingEventsUrl(): string {
  const apiBase = shouldUseDevApiProxy() ? '' : getApiBaseUrl().replace(/\/$/, '')
  return `${apiBase}/api/billing/events`
}

/**
 * Cabeceras del stream. Mismas que arma el interceptor de axios (token vigente, tenant y, con el proxy de
 * desarrollo, el origen del tenant). NO lleva `X-Branch-Mode`: el servidor filtra los eventos por la sucursal
 * del token (activa + asignadas; el administrador ve todas), no por esa cabecera, que solo afecta a los
 * listados. Así el modo "Todas las sucursales" no necesita tocar el stream: el stream ya cubre lo que el
 * usuario puede leer.
 */
export function billingEventsHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'text/event-stream' }
  const token = localStorage.getItem('token')
  if (token) headers.Authorization = `Bearer ${token}`
  const slug = getTenantSlug()
  if (slug) headers['X-Tenant-Slug'] = slug
  if (shouldUseDevApiProxy()) {
    const origin = isNativeShell() ? getResolvedTenantApiUrl() : slug ? getTenantApiOriginForSlug(slug) : ''
    if (origin) headers['X-Tenant-Api-Origin'] = normalizeBindingApiUrl(origin)
  }
  return headers
}

/**
 * Suscripción SSE de facturación — actualiza filas sin polling masivo.
 *
 * Usa `fetch` + stream (cabecera Authorization) en lugar de `EventSource` con el JWT en la URL. Se reabre
 * cuando cambian el token, la sucursal activa o la época (`resetEpoch`) y se aborta al desmontar.
 * `onReconnect` (opcional) se llama al RE-conectar tras un corte: no hay `Last-Event-ID`, así que el consumidor
 * debe volver a pedir su lista para no perder cambios ocurridos mientras estaba desconectado.
 */
export function useBillingEvents(
  onUpdate: (evt: BillingStatusEvent) => void,
  enabled = true,
  onReconnect?: () => void,
) {
  const { token } = useAuth()
  const { activeBranchId, resetEpoch } = useBranch()
  const handlerRef = useRef(onUpdate)
  handlerRef.current = onUpdate
  const reconnectRef = useRef(onReconnect)
  reconnectRef.current = onReconnect

  const streamRef = useRef<EventStreamHandle | null>(null)
  /** Último token obtenido por el propio stream al renovar: su cambio no debe reabrir el stream otra vez. */
  const ownTokenRef = useRef<string | null>(null)
  const hasToken = Boolean(token)
  /** Token con el que se abrió el stream vigente (evita reabrirlo dos veces en el mismo render). */
  const openedTokenRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !hasToken) return
    const handle = openEventStream({
      url: billingEventsUrl(),
      getHeaders: billingEventsHeaders,
      onMessage: (msg) => {
        if (msg.event !== 'billing.status.updated') return
        try {
          const data = JSON.parse(msg.data) as BillingStatusEvent
          if (data?.sale_id) handlerRef.current(data)
        } catch {
          /* ignore malformed */
        }
      },
      refreshToken: async () => {
        const t = await refreshAccessToken()
        if (t) ownTokenRef.current = t
        return t
      },
      onContextInvalid: (code) => {
        // BRANCH_*: BranchContext relee el contexto (si la sucursal cambia, resetEpoch cambia y este efecto
        // reabre). SESSION_UPDATED: el token ya se renovó; se relee también el contexto.
        window.dispatchEvent(
          code === 'SESSION_UPDATED'
            ? new Event(SESSION_CONTEXT_STALE_EVENT)
            : new CustomEvent(BRANCH_INVALID_EVENT, { detail: { code } }),
        )
      },
      onReconnect: () => reconnectRef.current?.(),
      onStop: (reason) => console.warn('[billing-events] stream detenido:', reason),
    })
    streamRef.current = handle
    openedTokenRef.current = token
    return () => {
      handle.close()
      if (streamRef.current === handle) streamRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el token solo se lee para marcar con cuál se abrió
  }, [enabled, hasToken, activeBranchId, resetEpoch])

  // Token distinto (renovado por axios, cambio de sucursal...): reabrir con el nuevo, salvo que lo haya
  // obtenido el propio stream (ya reabre solo; si no, un 401 persistente haría bucle).
  const prevTokenRef = useRef(token)
  useEffect(() => {
    if (prevTokenRef.current === token) return
    prevTokenRef.current = token
    if (token && (token === ownTokenRef.current || token === openedTokenRef.current)) return
    openedTokenRef.current = token
    streamRef.current?.reconnect()
  }, [token])
}
