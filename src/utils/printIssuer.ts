import type { PrintData } from '@/types/printData'

/** Dirección del emisor en ticket/PDF: sucursal de la venta; si no hay, empresa. */
export function getPrintIssuerAddress(data: Pick<PrintData, 'company' | 'branch'>): string {
  const branchAddr = data.branch?.address?.trim()
  if (branchAddr) return branchAddr
  return data.company?.address?.trim() ?? ''
}
