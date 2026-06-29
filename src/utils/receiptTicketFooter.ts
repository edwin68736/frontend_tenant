import type { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import type { PrintData } from '@/types/printData'
import { formatMoney } from '@/utils/format'
import { salePaymentMethodLabelEs } from '@/utils/paymentMethodLabels'
import { resolvePrintChangeAmount } from '@/utils/receiptTotals'

/** Mismo cuerpo que detalle/fecha en ticket PDF (receiptPdf FONT_SIZE_SM). */
const FONT_SIZE_TICKET_BODY = 8

export function paymentConditionLeftLines(data: PrintData): string[] {
  const lines: string[] = ['Condicion de pago:']
  const cond = String(data.payment_condition ?? '').trim()
  if (cond) {
    lines.push(cond)
  } else if (data.payments.length > 0) {
    lines.push('Contado')
  }
  if (data.payments.length > 0) {
    lines.push('Pagos detallados:')
    for (const p of data.payments) {
      const ref = p.reference?.trim() ? ` Ref:${p.reference}` : ''
      lines.push(`${salePaymentMethodLabelEs(p.method)}: ${formatMoney(p.amount, data.currency)}${ref}`)
    }
  }
  const change = resolvePrintChangeAmount(data)
  if (change > 0.009) {
    lines.push(`Vuelto: ${formatMoney(change, data.currency)}`)
  }
  return lines
}

export function bankAccountTextLines(data: PrintData): string[] {
  const banks = data.bank_accounts ?? []
  if (banks.length === 0) return []
  const lines: string[] = ['INFORMACION BANCARIA']
  for (const b of banks) {
    const label = [b.bank_name, b.name].filter(Boolean).join(' - ')
    if (label) lines.push(label)
    if (b.account_number) lines.push(`Cta: ${b.account_number} (${b.currency || data.currency})`)
  }
  return lines
}

/** Ticket PDF: columna izquierda condición de pago, derecha QR SUNAT. */
export async function renderTicketPaymentAndSunatQrRow(
  doc: jsPDF,
  data: PrintData,
  opts: {
    showSunatQr: boolean
    y: number
    pageW: number
    margin: number
    innerW: number
    lineH: number
    normalize?: (text: string) => string
  },
): Promise<number> {
  const { showSunatQr, y, pageW, margin, innerW, lineH } = opts
  const norm = opts.normalize ?? ((t: string) => t)
  const gap = 2
  const leftW = innerW * 0.48
  const rightW = innerW - leftW - gap
  const leftX = margin
  const rightX = margin + leftW + gap
  const rowY = y

  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT_SIZE_TICKET_BODY)

  const rawLines = paymentConditionLeftLines(data)
  const wrappedLeft: string[] = []
  for (const raw of rawLines) {
    const parts = doc.splitTextToSize(norm(raw), leftW) as string[]
    wrappedLeft.push(...parts)
  }

  let leftY = rowY
  for (const line of wrappedLeft) {
    doc.text(line, leftX, leftY, { maxWidth: leftW })
    leftY += lineH
  }
  const leftH = Math.max(lineH, leftY - rowY)

  let blockH = leftH
  if (showSunatQr && data.qr_data) {
    try {
      const qrCap = pageW <= 62 ? 38 : 46
      const qrSize = Math.min(rightW - 0.5, qrCap)
      const qrDataUrl = await QRCode.toDataURL(data.qr_data, {
        width: Math.round(qrSize * 4),
        margin: 1,
      })
      doc.addImage(qrDataUrl, 'PNG', rightX + (rightW - qrSize) / 2, rowY, qrSize, qrSize)
      blockH = Math.max(blockH, qrSize)
    } catch {
      /* sin QR */
    }
  }

  let ny = rowY + blockH + 3

  if (showSunatQr && data.sunat_hash) {
    const hashLines = doc.splitTextToSize(norm(`Hash: ${data.sunat_hash}`), innerW) as string[]
    for (const hl of hashLines) {
      doc.text(hl, margin, ny, { maxWidth: innerW })
      ny += lineH
    }
  }
  if (showSunatQr) {
    for (const foot of [
      'Representacion impresa del comprobante electronico',
      'Consulte en sunat.gob.pe',
    ]) {
      const fl = doc.splitTextToSize(norm(foot), innerW) as string[]
      for (const line of fl) {
        doc.text(line, pageW / 2, ny, { align: 'center', maxWidth: innerW })
        ny += lineH
      }
    }
  }

  void data
  return ny
}
