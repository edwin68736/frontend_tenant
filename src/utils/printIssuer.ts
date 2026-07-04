import type { PrintData } from '@/types/printData'

/** Dirección del emisor en ticket/PDF: datos de empresa (ajustes / edición en venta); si no hay, sucursal. */
export function getPrintIssuerAddress(data: Pick<PrintData, 'company' | 'branch'>): string {
  const companyAddr = data.company?.address?.trim()
  if (companyAddr) return companyAddr
  return data.branch?.address?.trim() ?? ''
}
