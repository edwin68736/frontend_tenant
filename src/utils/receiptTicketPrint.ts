import { toast } from 'sonner'
import type { PrintData } from '@/types/printData'
import { isTauriDesktop, isCapacitorAndroid } from '@/lib/platform/detect'
import { getConfiguredPrinter, isNativePrintAvailable, printDocumentAuto } from '@/services/printers.service'
import { printReceiptPdf, type ReceiptPdfOptions } from '@/utils/receiptPdf'

/**
 * Impresión de un comprobante en formato ticket, con el orden de preferencia de toda la app:
 *  1. Directo a la ticketera: app de escritorio, Android, o navegador con el Servidor de impresión
 *     vinculado (ESC/POS: fuente propia de la impresora, nítido, sin diálogo).
 *  2. Respaldo: impresión del navegador (PDF vectorial al ancho del rollo), para equipos sin el
 *     servidor instalado o cuando este no responde.
 * Devuelve un mensaje de éxito si fue directa; undefined si se abrió el diálogo del navegador.
 */
export async function printTicketPreferDirect(
  data: PrintData,
  options?: ReceiptPdfOptions,
): Promise<string | undefined> {
  const hasDirect = isNativePrintAvailable() && Boolean(getConfiguredPrinter('documentos'))
  if (!hasDirect) {
    await printReceiptPdf(data, 'ticket', options)
    return undefined
  }
  try {
    return (await printDocumentAuto(data)) || 'Comprobante enviado a la impresora'
  } catch (e) {
    // En app nativa un fallo es de la impresora y se informa tal cual; en navegador (servidor
    // apagado, impresora no elegida, vinculación vencida…) se cae a la impresión del navegador.
    if (isTauriDesktop() || isCapacitorAndroid()) throw e
    toast.warning(`${(e as Error)?.message ?? 'Servidor de impresión no disponible'} Se usará la impresión del navegador.`)
    await printReceiptPdf(data, 'ticket', options)
    return undefined
  }
}
