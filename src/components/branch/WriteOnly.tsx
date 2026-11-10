import type { ReactNode } from 'react'
import { useBranchWriteGuard } from '@/hooks/useBranchWriteGuard'

/** Renderiza sus hijos (botones de escritura) solo fuera del modo "Todas las sucursales" (solo lectura). */
export default function WriteOnly({ children }: { children: ReactNode }) {
  const { canWrite } = useBranchWriteGuard()
  return canWrite ? <>{children}</> : null
}
