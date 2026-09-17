import { salesService } from '@/services/sales.service'
import { generateReceiptPdf, downloadReceiptPdf, receiptPdfFileName } from '@/utils/receiptPdf'
import { enrichPrintDataWithSaleUnitNames } from '@/utils/saleUnitNames'

/** Devuelve el object URL del PDF y su nombre de descarga (serie+número), para que los
 *  visores puedan ofrecer una descarga con nombre correcto en vez del UUID del blob.
 *  Sirve tanto para ventas como para Notas de Crédito/Débito — mismo GET /sales/:id y mismo
 *  print_data (Fase 7G: confirmado que no hay un flujo de impresión separado para notas). */
export async function createLocalReceiptPdfObjectUrl(
  saleId: number,
  format: 'a4' | 'ticket' = 'a4',
): Promise<{ url: string; fileName: string }> {
  const d = await salesService.get(saleId)
  if (!d.print_data) throw new Error('No hay datos para generar el PDF')
  const printData = await enrichPrintDataWithSaleUnitNames(d.print_data)
  const doc = await generateReceiptPdf(printData, format)
  return {
    url: URL.createObjectURL(doc.output('blob')),
    fileName: receiptPdfFileName(printData, format),
  }
}

export async function downloadLocalReceiptPdf(
  saleId: number,
  format: 'a4' | 'ticket' = 'a4',
): Promise<void> {
  const d = await salesService.get(saleId)
  if (!d.print_data) throw new Error('No hay datos para generar el PDF')
  await downloadReceiptPdf(await enrichPrintDataWithSaleUnitNames(d.print_data), format)
}
