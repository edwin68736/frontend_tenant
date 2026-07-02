import { salesService } from '@/services/sales.service'
import { generateReceiptPdf, downloadReceiptPdf } from '@/utils/receiptPdf'

export async function createLocalReceiptPdfObjectUrl(
  saleId: number,
  format: 'a4' | 'ticket' = 'a4',
): Promise<string> {
  const d = await salesService.get(saleId)
  if (!d.print_data) throw new Error('No hay datos para generar el PDF')
  const doc = await generateReceiptPdf(d.print_data, format)
  return URL.createObjectURL(doc.output('blob'))
}

export async function downloadLocalReceiptPdf(
  saleId: number,
  format: 'a4' | 'ticket' = 'a4',
): Promise<void> {
  const d = await salesService.get(saleId)
  if (!d.print_data) throw new Error('No hay datos para generar el PDF')
  await downloadReceiptPdf(d.print_data, format)
}
