import type { jsPDF } from 'jspdf'
import type { PrintData } from '@/types/printData'
import { isGuiaSunatCode } from '@/constants/sunat'
import { renderDespatchA4 } from './despatch'
import { getCompanyConfigCache } from '@/lib/companyConfig/store'
import { getA4Design } from './registry'

export { A4_DESIGNS, DEFAULT_A4_DESIGN, getA4Design } from './registry'
export type { A4Design } from './registry'

/**
 * Diseño de este comprobante: el que trae el print_data (lo manda el backend desde la config del tenant) o,
 * si no lo trae (vista previa armada en el navegador, backend anterior), el de la config cacheada del tenant.
 * Vacío o desconocido = diseño por defecto.
 */
export function resolveA4Design(data: PrintData) {
  return getA4Design(data.company?.pdf_a4_design?.trim() || getCompanyConfigCache()?.pdf_a4_design)
}

/**
 * Punto único de entrada del PDF A4 de comprobantes. La guía de remisión tiene una sola plantilla
 * para todos los diseños; el resto se dibuja con el diseño elegido en `data.company.pdf_a4_design`
 * (vacío o desconocido = diseño por defecto).
 */
export async function renderReceiptA4(doc: jsPDF, data: PrintData): Promise<void> {
  if (isGuiaSunatCode(data.sunat_code) && data.despatch) {
    await renderDespatchA4(doc, data)
    return
  }
  await resolveA4Design(data).render(doc, data)
}
