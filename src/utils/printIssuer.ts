import type { PrintData } from '@/types/printData'

/**
 * Dirección del emisor en ticket/PDF: la de la sucursal del comprobante si la tiene (igual que el logo);
 * si la sucursal no tiene dirección, la de la empresa (ajustes) como respaldo.
 */
export function getPrintIssuerAddress(data: Pick<PrintData, 'company' | 'branch'>): string {
  const branchAddr = data.branch?.address?.trim()
  if (branchAddr) return branchAddr
  return data.company?.address?.trim() ?? ''
}
