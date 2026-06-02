import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { isNativeShell } from '@/lib/platform/detect'
import {
  getTenantBinding,
  initTenantBindingStore,
  isTenantBound,
  reloadTenantBindingStore,
  subscribeTenantBinding,
} from '@/lib/tenantBinding/store'
import { toStoredTenant, type TenantBinding } from '@/lib/tenantBinding/types'
import type { StoredTenant } from '@/services/public.service'

type TenantBindingContextValue = {
  binding: TenantBinding | null
  stored: StoredTenant | null
  isBound: boolean
  isReady: boolean
  reload: () => Promise<void>
}

const TenantBindingContext = createContext<TenantBindingContextValue | undefined>(undefined)

export function TenantBindingProvider({ children }: { children: ReactNode }) {
  const native = isNativeShell()
  const [isReady, setIsReady] = useState(!native)
  const [tick, setTick] = useState(0)

  const reload = useCallback(async () => {
    if (!native) return
    await reloadTenantBindingStore()
    setTick((t) => t + 1)
    setIsReady(true)
  }, [native])

  useEffect(() => {
    if (!native) return

    let cancelled = false
    const boot = async () => {
      for (let i = 0; i < 40; i++) {
        if (cancelled) return
        const w = window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }
        if (w.__TAURI__ || w.__TAURI_INTERNALS__) break
        await new Promise((r) => setTimeout(r, 25))
      }
      await initTenantBindingStore()
      if (!cancelled) setIsReady(true)
    }
    void boot()
    const unsub = subscribeTenantBinding(() => setTick((t) => t + 1))
    return () => {
      cancelled = true
      unsub()
    }
  }, [native])

  const binding = native ? getTenantBinding() : null
  const value = useMemo<TenantBindingContextValue>(
    () => ({
      binding,
      stored: binding ? toStoredTenant(binding) : null,
      isBound: isTenantBound(),
      isReady,
      reload,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [binding, isReady, tick, reload],
  )

  if (!isReady) {
    return (
      <div className="flex min-h-[100dvh] min-h-screen-safe items-center justify-center bg-gray-100 pt-safe">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
      </div>
    )
  }

  return <TenantBindingContext.Provider value={value}>{children}</TenantBindingContext.Provider>
}

export function useTenantBinding() {
  const ctx = useContext(TenantBindingContext)
  if (!ctx) {
    throw new Error('useTenantBinding debe usarse dentro de TenantBindingProvider')
  }
  return ctx
}
