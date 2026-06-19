import { useEffect, useRef } from 'react'
import { getApiPrefixUrl, getTenantSlug, shouldUseDevApiProxy } from '@/config/apiBaseUrl'

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

/** Suscripción SSE — actualiza filas sin polling masivo. */
export function useBillingEvents(
  onUpdate: (evt: BillingStatusEvent) => void,
  enabled = true,
) {
  const handlerRef = useRef(onUpdate)
  handlerRef.current = onUpdate

  useEffect(() => {
    if (!enabled) return
    const token = localStorage.getItem('token')
    if (!token) return

    const apiBase = shouldUseDevApiProxy() ? '/api' : getApiPrefixUrl()
    const slug = getTenantSlug()
    const qs = new URLSearchParams({ access_token: token })
    if (slug) qs.set('tenant_slug', slug)
    const url = `${apiBase}/billing/events?${qs.toString()}`
    const es = new EventSource(url)

    const onMessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as BillingStatusEvent
        if (data?.sale_id) handlerRef.current(data)
      } catch {
        /* ignore malformed */
      }
    }

    es.addEventListener('billing.status.updated', onMessage)
    return () => {
      es.removeEventListener('billing.status.updated', onMessage)
      es.close()
    }
  }, [enabled])
}