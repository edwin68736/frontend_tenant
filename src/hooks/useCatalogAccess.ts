import { useAuth } from '@/contexts/AuthContext'
import { useBranchWriteGuard } from '@/hooks/useBranchWriteGuard'
import { computeCatalogAccess, type CatalogAccess } from '@/lib/catalogAccess'

/** Permisos efectivos del catálogo (global vs. por sucursal) combinados con el modo de solo lectura. */
export function useCatalogAccess(): CatalogAccess {
  const { hasPermission } = useAuth()
  const { canWrite } = useBranchWriteGuard()
  return computeCatalogAccess(hasPermission, canWrite)
}
