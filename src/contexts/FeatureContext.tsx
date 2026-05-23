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

export type TenantFeatures = {
  multi_branch: boolean
  restaurant_recipes: boolean
  advanced_inventory: boolean
}

type FeatureContextValue = {
  schemaVersion: number
  features: TenantFeatures
  hasFeature: (key: keyof TenantFeatures) => boolean
  refresh: () => Promise<void>
}

const defaultFeatures: TenantFeatures = {
  multi_branch: false,
  restaurant_recipes: false,
  advanced_inventory: false,
}

const FeatureContext = createContext<FeatureContextValue | undefined>(undefined)

export function FeatureProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [schemaVersion, setSchemaVersion] = useState(30)
  const [features, setFeatures] = useState<TenantFeatures>(defaultFeatures)

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<{
        schema_version: number
        features: TenantFeatures
      }>('/api/session/capabilities')
      setSchemaVersion(data.schema_version ?? 30)
      setFeatures({ ...defaultFeatures, ...data.features })
    } catch {
      setFeatures(defaultFeatures)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) refresh()
  }, [isAuthenticated, refresh])

  const hasFeature = useCallback(
    (key: keyof TenantFeatures) => !!features[key],
    [features],
  )

  const value = useMemo(
    () => ({ schemaVersion, features, hasFeature, refresh }),
    [schemaVersion, features, hasFeature, refresh],
  )

  return <FeatureContext.Provider value={value}>{children}</FeatureContext.Provider>
}

export function useFeatures() {
  const ctx = useContext(FeatureContext)
  if (!ctx) throw new Error('useFeatures debe usarse dentro de FeatureProvider')
  return ctx
}
