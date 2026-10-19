import type { jsPDF } from 'jspdf'
import type { PrintData } from '@/types/printData'
import { isGuiaSunatCode } from '@/constants/sunat'
import { renderDespatchA4 } from './despatch'
import { getA4Design } from './registry'

export { A4_DESIGNS, DEFAULT_A4_DESIGN, getA4Design } from './registry'
export type { A4Design } from './registry'

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
  await getA4Design(data.company?.pdf_a4_design).render(doc, data)
}
