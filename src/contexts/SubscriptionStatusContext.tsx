import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { subscriptionService, type BillingHub } from '@/services/subscription.service'
import { SUBSCRIPTION_BLOCKED_EVENT } from '@/services/api'

type Ctx = {
  hub: BillingHub | null
  loading: boolean
  /** true solo con hub confirmado y can_operate=false (nunca por un hub aún no cargado). */
  blocked: boolean
  refresh: () => Promise<void>
  setHub: (hub: BillingHub | null) => void
}

const SubscriptionStatusContext = createContext<Ctx | null>(null)

/** Evita ráfagas de refresh si varias requests devuelven 402 casi al mismo tiempo. */
const REFRESH_COOLDOWN_MS = 2000

export function SubscriptionStatusProvider({ children }: { children: ReactNode }) {
  const [hub, setHub] = useState<BillingHub | null>(null)
  const [loading, setLoading] = useState(true)
  const lastRefreshAtRef = useRef(0)

  const refresh = useCallback(async () => {
    try {
      const data = await subscriptionService.getHub()
      setHub(data)
    } catch {
      setHub(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onBlocked = () => {
      const now = Date.now()
      if (now - lastRefreshAtRef.current < REFRESH_COOLDOWN_MS) return
      lastRefreshAtRef.current = now
      void refresh()
    }
    window.addEventListener(SUBSCRIPTION_BLOCKED_EVENT, onBlocked)
    return () => window.removeEventListener(SUBSCRIPTION_BLOCKED_EVENT, onBlocked)
  }, [refresh])

  const blocked = hub != null && hub.subscription.can_operate === false

  return (
    <SubscriptionStatusContext.Provider value={{ hub, loading, blocked, refresh, setHub }}>
      {children}
    </SubscriptionStatusContext.Provider>
  )
}

export function useSubscriptionStatus() {
  const ctx = useContext(SubscriptionStatusContext)
  if (!ctx) {
    throw new Error('useSubscriptionStatus debe usarse dentro de SubscriptionStatusProvider')
  }
  return ctx
}
