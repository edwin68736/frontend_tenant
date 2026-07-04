import type { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import type { PrintData } from '@/types/printData'
import { formatMoney, formatMoneyTicket } from '@/utils/format'
import { salePaymentMethodLabelEs } from '@/utils/paymentMethodLabels'
import { bankAccountPrintLines } from '@/utils/receiptBankAccounts'
import { resolvePrintChangeAmount } from '@/utils/receiptTotals'
import { rasterPxForMm } from '@/utils/receiptPdfRaster'

/** Mismo cuerpo que detalle/fecha en ticket PDF. */
const FONT_SIZE_TICKET_BODY = 10

export type PaymentConditionLineOpts = {
  /** Ancho de columna ESC/POS: mantiene método + monto en la misma línea. */
  cols?: number
  /** Montos compactos S/12.34 (ticketera). Por defecto true. */
  ticketMoney?: boolean
}

/** Línea método + monto sin partir el símbolo de moneda. */
export function formatPaymentDetailLine(
  label: string,
  amount: string,
  suffix: string,
  cols: number,
): string {
  const tail = `${amount}${suffix}`
  const spaced = `${label}: ${tail}`
  if (spaced.length <= cols) return spaced
  const tight = `${label}:${tail}`
  if (tight.length <= cols) return tight
  const room = cols - tail.length - 1
  if (room >= 3) {
    const short = label.length > room ? `${label.slice(0, Math.max(1, room - 2))}..` : label
    return `${short} ${tail}`.slice(0, cols)
  }
  return tight.slice(0, cols)
}

export function paymentConditionLeftLines(data: PrintData, opts?: PaymentConditionLineOpts): string[] {
  const moneyFmt = opts?.ticketMoney !== false ? formatMoneyTicket : formatMoney
  const cols = opts?.cols
  const lines: string[] = []

  const cond = String(data.payment_condition ?? '').trim()
  const condValue = cond || (data.payments.length > 0 ? 'Contado' : '')
  if (condValue) {
    lines.push(`Condicion de pago: ${condValue}`)
  } else {
    lines.push('Condicion de pago:')
  }

  if (data.payments.length > 0) {
    lines.push('Pagos detallados:')
    for (const p of data.payments) {
      const ref = p.reference?.trim() ? ` Ref:${p.reference}` : ''
      const label = salePaymentMethodLabelEs(p.method)
      const amt = moneyFmt(p.amount, data.currency)
      lines.push(
        cols != null
          ? formatPaymentDetailLine(label, amt, ref, cols)
          : `${label}: ${amt}${ref}`,
      )
    }
    const change = resolvePrintChangeAmount(data)
    if (change > 0.009) {
      const amt = moneyFmt(change, data.currency)
      lines.push(cols != null ? formatPaymentDetailLine('Vuelto', amt, '', cols) : `Vuelto: ${amt}`)
    }
  }
  return lines
}

export function bankAccountTextLines(data: PrintData): string[] {
  const rows = bankAccountPrintLines(data)
  if (rows.length === 0) return []
  return ['INFORMACION BANCARIA', ...rows]
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
        width: rasterPxForMm(qrSize),
        margin: 0,
        errorCorrectionLevel: 'M',
      })
      doc.addImage(qrDataUrl, 'PNG', rightX + (rightW - qrSize) / 2, rowY, qrSize, qrSize, undefined, 'NONE')
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
