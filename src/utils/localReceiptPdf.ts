import { salesService } from '@/services/sales.service'
import { generateReceiptPdf, downloadReceiptPdf, receiptPdfFileName } from '@/utils/receiptPdf'

/** Devuelve el object URL del PDF y su nombre de descarga (serie+número), para que los
 *  visores puedan ofrecer una descarga con nombre correcto en vez del UUID del blob. */
export async function createLocalReceiptPdfObjectUrl(
  saleId: number,
  format: 'a4' | 'ticket' = 'a4',
): Promise<{ url: string; fileName: string }> {
  const d = await salesService.get(saleId)
  if (!d.print_data) throw new Error('No hay datos para generar el PDF')
  const doc = await generateReceiptPdf(d.print_data, format)
  return {
    url: URL.createObjectURL(doc.output('blob')),
    fileName: receiptPdfFileName(d.print_data, format),
  }
}

export async function downloadLocalReceiptPdf(
  saleId: number,
  format: 'a4' | 'ticket' = 'a4',
): Promise<void> {
  const d = await salesService.get(saleId)
  if (!d.print_data) throw new Error('No hay datos para generar el PDF')
  await downloadReceiptPdf(d.print_data, format)
}
