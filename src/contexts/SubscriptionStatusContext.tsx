import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { subscriptionService, type BillingHub } from '@/services/subscription.service'

type Ctx = {
  hub: BillingHub | null
  loading: boolean
  refresh: () => Promise<void>
  setHub: (hub: BillingHub | null) => void
}

const SubscriptionStatusContext = createContext<Ctx | null>(null)

export function SubscriptionStatusProvider({ children }: { children: ReactNode }) {
  const [hub, setHub] = useState<BillingHub | null>(null)
  const [loading, setLoading] = useState(true)

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

  return (
    <SubscriptionStatusContext.Provider value={{ hub, loading, refresh, setHub }}>
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
