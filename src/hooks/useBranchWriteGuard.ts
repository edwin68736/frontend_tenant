import { useCallback } from 'react'
import { toast } from 'sonner'
import { useBranch } from '@/contexts/BranchContext'
import { BRANCH_READ_ONLY_MESSAGE } from '@/lib/branchScope/viewMode'

export type BranchWriteGuard = {
  /** true en modo "Todas las sucursales": la app es de solo lectura. */
  isReadOnlyMode: boolean
  /** Inverso cómodo: `canWrite && <Boton/>`. */
  canWrite: boolean
  /** Texto para `title`/aviso de un control deshabilitado. */
  readOnlyReason: string
  /** Ejecuta `fn` solo si se puede escribir; en modo consulta avisa con un toast y devuelve undefined. */
  guard: <T>(fn: () => T) => T | undefined
}

/**
 * Punto único para decidir si las acciones de escritura (Nuevo/Editar/Eliminar/Anular/Cobrar/Enviar a
 * SUNAT/Abrir caja...) están disponibles. En modo "Todas las sucursales" (consulta consolidada) nada
 * se puede escribir: la UI lo oculta/deshabilita y el interceptor de axios es la última barrera.
 */
export function useBranchWriteGuard(): BranchWriteGuard {
  const { isAllBranches } = useBranch()
  const guard = useCallback(
    <T,>(fn: () => T): T | undefined => {
      if (isAllBranches) {
        toast.error(BRANCH_READ_ONLY_MESSAGE, { id: 'branch-read-only' })
        return undefined
      }
      return fn()
    },
    [isAllBranches],
  )
  return {
    isReadOnlyMode: isAllBranches,
    canWrite: !isAllBranches,
    readOnlyReason: BRANCH_READ_ONLY_MESSAGE,
    guard,
  }
}
