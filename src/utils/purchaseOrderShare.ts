import { toast } from 'sonner'
import { downloadBlob } from '@/utils/downloadBlob'
import { shareBlobFile } from '@/utils/receiptShare'
import { normalizePeruWhatsAppNumber, openExternalUrl } from '@/utils/supportWhatsApp'
import {
  generatePurchaseOrderPdf,
  purchaseOrderFileName,
  type PurchaseOrderPdfInput,
} from '@/utils/purchaseOrderPdf'

/**
 * Envío de la orden de compra al proveedor. WhatsApp y el correo no permiten adjuntar un archivo desde un enlace, así que el
 * flujo es: (1) intentar el selector de compartir del sistema con el PDF adjunto (móvil/Windows); (2) si no existe, descargar
 * el PDF y abrir el chat/correo ya redactado para que el usuario lo adjunte.
 */

const money = (n: number) => Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const sym = (c: string) => (c === 'USD' ? 'US$' : 'S/')

function fmtDate(d?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** Texto del mensaje: saludo, número de orden, total y entrega esperada. */
export function purchaseOrderMessage({ order, supplier }: PurchaseOrderPdfInput, company: string): string {
  const lines = [
    `Hola${supplier.name ? ` ${supplier.name}` : ''},`,
    `Le enviamos la orden de compra ${order.number}${company ? ` de ${company}` : ''} por ${sym(order.currency)} ${money(Number(order.total))}.`,
  ]
  const entrega = fmtDate(order.expected_date)
  if (entrega) lines.push(`Entrega esperada: ${entrega}.`)
  lines.push('Adjuntamos el detalle en PDF. Por favor confirme la recepción. Gracias.')
  return lines.join('\n')
}

async function pdfBlob(input: PurchaseOrderPdfInput): Promise<{ blob: Blob; fileName: string }> {
  const doc = await generatePurchaseOrderPdf(input, 'a4')
  return { blob: doc.output('blob'), fileName: purchaseOrderFileName(input.order, 'a4') }
}

export type PurchaseOrderChannel = 'whatsapp' | 'email'

/** Devuelve true si se inició el envío (compartir, WhatsApp o correo). */
export async function sendPurchaseOrder(input: PurchaseOrderPdfInput, channel: PurchaseOrderChannel, company: string): Promise<boolean> {
  const text = purchaseOrderMessage(input, company)
  const { blob, fileName } = await pdfBlob(input)

  if (channel === 'whatsapp') {
    const wa = normalizePeruWhatsAppNumber(input.supplier.phone)
    if (!wa) {
      toast.error('El proveedor no tiene un teléfono válido. Agréguelo en Contactos.')
      return false
    }
    const shared = await shareBlobFile(blob, fileName, { title: `Orden de compra ${input.order.number}`, text, mimeType: 'application/pdf' })
    if (shared) return true
    await downloadBlob(blob, fileName)
    await openExternalUrl(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`)
    toast.info('PDF descargado: adjúntelo en el chat de WhatsApp')
    return true
  }

  const email = (input.supplier.email ?? '').trim()
  if (!email) {
    toast.error('El proveedor no tiene correo. Agréguelo en Contactos.')
    return false
  }
  await downloadBlob(blob, fileName)
  const subject = `Orden de compra ${input.order.number}${company ? ` - ${company}` : ''}`
  await openExternalUrl(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`)
  toast.info('PDF descargado: adjúntelo en el correo')
  return true
}
