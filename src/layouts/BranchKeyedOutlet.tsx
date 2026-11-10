import { Outlet } from 'react-router-dom'
import { useBranch } from '@/contexts/BranchContext'

/** Clave de remontaje de las páginas: sucursal activa + época de cambio. */
export function branchOutletKey(activeBranchId: number, resetEpoch: number): string {
  return `${activeBranchId}:${resetEpoch}`
}

/**
 * `<Outlet>` que se remonta entero al cambiar de sucursal: se reinician useState, filtros locales,
 * paginación, carritos y modales, y se vuelven a pedir los datos con la sucursal nueva. Es la garantía
 * de que nada de la sucursal anterior sobrevive, sin tener que migrar pantalla por pantalla.
 */
export default function BranchKeyedOutlet() {
  const { activeBranchId, resetEpoch } = useBranch()
  return <Outlet key={branchOutletKey(activeBranchId, resetEpoch)} />
}
