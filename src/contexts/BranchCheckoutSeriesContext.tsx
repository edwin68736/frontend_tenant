import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { companyService, tenantCanEmitFactura, type SunatConfig } from '@/services/company.service'
import {
  filterPosCheckoutSeries,
  hasPosCheckoutSeries,
  type PosSeriesRow,
} from '@/utils/posCheckoutSeries'
import { useAuth } from '@/contexts/AuthContext'
import { useBranch } from '@/contexts/BranchContext'

type CacheEntry = {
  series: PosSeriesRow[]
  ready: boolean
}

type BranchCheckoutSeriesContextValue = {
  checkoutSeries: PosSeriesRow[]
  seriesMetaReady: boolean
  hasCheckoutSeries: boolean
  sunat: SunatConfig | null
  refreshCheckoutSeries: () => Promise<void>
  invalidateCheckoutSeries: (branchId?: number) => void
}

const BranchCheckoutSeriesContext = createContext<BranchCheckoutSeriesContextValue | undefined>(
  undefined,
)

export function BranchCheckoutSeriesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, hasModule } = useAuth()
  const { activeBranchId, resetEpoch } = useBranch()
  const cacheRef = useRef<Map<number, CacheEntry>>(new Map())
  const inflightRef = useRef<Map<number, Promise<void>>>(new Map())
  const [sunatConfig, setSunatConfig] = useState<SunatConfig | null>(null)
  const sunatRef = useRef<SunatConfig | null>(null)
  const [version, setVersion] = useState(0)

  const bump = useCallback(() => setVersion((v) => v + 1), [])

  const billingModule = hasModule('billing')

  const loadForBranch = useCallback(
    async (branchId: number, force = false) => {
      if (!branchId) return
      const cached = cacheRef.current.get(branchId)
      if (!force && cached?.ready) return

      const existing = inflightRef.current.get(branchId)
      if (existing && !force) {
        await existing
        return
      }

      const task = (async () => {
        try {
          let sunat = sunatRef.current
          if (!sunat) {
            sunat = await companyService.getSunat().catch(() => null)
            sunatRef.current = sunat
            setSunatConfig(sunat)
          }
          const raw = await companyService.listSeries({
            branch_id: branchId,
            category: 'venta',
          })
          const filtered = filterPosCheckoutSeries(
            (raw ?? []) as PosSeriesRow[],
            Boolean(sunat?.sunat_enabled),
            billingModule,
            tenantCanEmitFactura(sunat),
          )
          cacheRef.current.set(branchId, { series: filtered, ready: true })
        } catch {
          cacheRef.current.set(branchId, { series: [], ready: true })
        } finally {
          inflightRef.current.delete(branchId)
          bump()
        }
      })()

      inflightRef.current.set(branchId, task)
      await task
    },
    [billingModule, bump],
  )

  useEffect(() => {
    if (!isAuthenticated) {
      cacheRef.current.clear()
      inflightRef.current.clear()
      sunatRef.current = null
      setSunatConfig(null)
      bump()
      return
    }
    if (!activeBranchId) return
    void loadForBranch(activeBranchId)
  }, [isAuthenticated, activeBranchId, resetEpoch, loadForBranch, bump])

  const invalidateCheckoutSeries = useCallback(
    (branchId?: number) => {
      const id = branchId ?? activeBranchId
      if (!id) return
      cacheRef.current.delete(id)
      sunatRef.current = null
      setSunatConfig(null)
      bump()
      if (id === activeBranchId) {
        void loadForBranch(id, true)
      }
    },
    [activeBranchId, loadForBranch, bump],
  )

  const refreshCheckoutSeries = useCallback(async () => {
    if (!activeBranchId) return
    await loadForBranch(activeBranchId, true)
  }, [activeBranchId, loadForBranch])

  const entry = activeBranchId ? cacheRef.current.get(activeBranchId) : undefined
  const checkoutSeries = entry?.series ?? []
  const seriesMetaReady = !activeBranchId || Boolean(entry?.ready)

  const value = useMemo(
    () => ({
      checkoutSeries,
      seriesMetaReady,
      hasCheckoutSeries: hasPosCheckoutSeries(
        checkoutSeries,
        Boolean(sunatConfig?.sunat_enabled),
        billingModule,
        tenantCanEmitFactura(sunatConfig),
      ),
      sunat: sunatConfig,
      refreshCheckoutSeries,
      invalidateCheckoutSeries,
    }),
    [checkoutSeries, seriesMetaReady, billingModule, sunatConfig, refreshCheckoutSeries, invalidateCheckoutSeries, version],
  )

  return (
    <BranchCheckoutSeriesContext.Provider value={value}>{children}</BranchCheckoutSeriesContext.Provider>
  )
}

export function useBranchCheckoutSeries() {
  const ctx = useContext(BranchCheckoutSeriesContext)
  if (!ctx) {
    throw new Error('useBranchCheckoutSeries requiere BranchCheckoutSeriesProvider')
  }
  return ctx
}
