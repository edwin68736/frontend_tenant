import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import api from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'

/** Vista de un módulo del catálogo (solo implementados; los no implementados no llegan). */
export type ModuleView = {
  key: string
  name: string
  description: string
  icon: string
  category: string
  /** true = el tenant lo tiene en su plan; false = bloqueado (mostrar upsell). */
  enabled: boolean
}

export type PlanLimit = { used: number; max: number; unlimited: boolean }

export type PlanLimits = {
  users: PlanLimit
  branches: PlanLimit
  products: PlanLimit
  documents: PlanLimit
}

const emptyLimit: PlanLimit = { used: 0, max: 0, unlimited: true }
const emptyLimits: PlanLimits = {
  users: emptyLimit,
  branches: emptyLimit,
  products: emptyLimit,
  documents: emptyLimit,
}

type ModulesContextValue = {
  catalog: ModuleView[]
  limits: PlanLimits
  loading: boolean
  /** El módulo existe en el catálogo (está implementado). */
  moduleExists: (key: string) => boolean
  /** Metadata del módulo para armar el mensaje de upsell. */
  getModule: (key: string) => ModuleView | undefined
  refresh: () => Promise<void>
}

const ModulesContext = createContext<ModulesContextValue | undefined>(undefined)

/**
 * Catálogo de módulos IMPLEMENTADOS del sistema con su estado (enabled/bloqueado) para este
 * tenant, más las cuotas del plan. Fuente: GET /api/session/modules (backend). Enriquece el
 * upsell (nombres/descripciones) y le dice al Sidebar qué módulos bloqueados debe mostrar.
 *
 * El GATE de acceso sigue siendo `hasModule` del AuthContext (JWT); este contexto solo aporta
 * catálogo y límites.
 */
export function ModulesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [catalog, setCatalog] = useState<ModuleView[]>([])
  const [limits, setLimits] = useState<PlanLimits>(emptyLimits)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<{ modules: ModuleView[]; limits: PlanLimits }>(
        '/api/session/modules',
      )
      setCatalog(Array.isArray(data.modules) ? data.modules : [])
      setLimits({ ...emptyLimits, ...(data.limits ?? {}) })
    } catch {
      setCatalog([])
      setLimits(emptyLimits)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      setLoading(true)
      void refresh()
    } else {
      setCatalog([])
      setLimits(emptyLimits)
      setLoading(false)
    }
  }, [isAuthenticated, refresh])

  const moduleExists = useCallback(
    (key: string) => catalog.some((m) => m.key === key),
    [catalog],
  )
  const getModule = useCallback(
    (key: string) => catalog.find((m) => m.key === key),
    [catalog],
  )

  const value = useMemo(
    () => ({ catalog, limits, loading, moduleExists, getModule, refresh }),
    [catalog, limits, loading, moduleExists, getModule, refresh],
  )

  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>
}

export function useModules() {
  const ctx = useContext(ModulesContext)
  if (!ctx) throw new Error('useModules debe usarse dentro de ModulesProvider')
  return ctx
}
