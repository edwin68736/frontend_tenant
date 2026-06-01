import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import type { PrintData } from '@/types/printData'
import { paymentWalletVisible, renderPaymentWalletBlock } from '@/utils/receiptPaymentWallet'
import { getTipoComprobanteLabel, getMedioPagoLabel } from '@/constants/sunat'
import { ticketColumnLayoutMm } from '@/utils/receiptTicketLayout'
import { getPrintIssuerAddress } from '@/utils/printIssuer'

const FONT_SIZE = 10
const FONT_SIZE_SM = 8
const FONT_SIZE_TITLE = 12
const MARGIN = 15
const TICKET_WIDTH = 80 // mm
/** Alto de página ticket (mm); rollo largo para ítems con descripción multilínea */
const TICKET_PAGE_HEIGHT = 480
const A4_WIDTH = 210
const A4_HEIGHT = 297

function formatMoney(n: number, currency = 'PEN'): string {
  const sym = currency === 'USD' ? '$' : 'S/'
  return `${sym} ${n.toFixed(2)}`
}

export async function generateReceiptPdf(
  data: PrintData,
  format: 'a4' | 'ticket' = 'a4'
): Promise<jsPDF> {
  const isTicket = format === 'ticket'
  const pageW = isTicket ? TICKET_WIDTH : A4_WIDTH
  const margin = isTicket ? 5 : MARGIN
  const doc = new jsPDF({
    orientation: isTicket ? 'portrait' : 'portrait',
    unit: 'mm',
    format: isTicket ? [TICKET_WIDTH, TICKET_PAGE_HEIGHT] : 'a4',
  })

  let y = margin
  const lineH = 5
  const colW = (pageW - 2 * margin) / 2

  const addLine = (text: string, opts?: { size?: number; align?: 'left' | 'center' | 'right' }) => {
    const size = opts?.size ?? FONT_SIZE
    doc.setFontSize(size)
    const align = opts?.align ?? 'left'
    if (align === 'center') {
      doc.text(text, pageW / 2, y, { align: 'center' })
    } else if (align === 'right') {
      doc.text(text, pageW - margin, y, { align: 'right' })
    } else {
      doc.text(text, margin, y)
    }
    y += lineH
  }

  const addSpace = (h = 3) => {
    y += h
  }

  if (isTicket) {
    // === FORMATO TICKET (80mm) ===
    const innerW = pageW - 2 * margin
    const ticketLineH = 4.2
    /** Courier: columnas en mm para usar todo el ancho útil del rollo */
    const ticketMonoSize = 7
    const lay = ticketColumnLayoutMm({ pageW, margin })

    const addTicketWrapped = (text: string, size = FONT_SIZE_SM) => {
      doc.setFontSize(size)
      const lines = doc.splitTextToSize(text, innerW)
      for (const line of lines) {
        doc.text(line, margin, y)
        y += ticketLineH
      }
    }

    const addTicketLineCenter = (text: string, size?: number) => {
      doc.setFontSize(size ?? FONT_SIZE)
      doc.text(text, pageW / 2, y, { align: 'center' })
      y += ticketLineH + (size && size >= FONT_SIZE_TITLE ? 0.8 : 0)
    }

    /** Texto centrado con salto de línea (razón social larga, etc.) */
    const addTicketWrappedCenter = (text: string, size: number) => {
      doc.setFontSize(size)
      const lines = doc.splitTextToSize(text, innerW)
      for (const line of lines) {
        doc.text(line, pageW / 2, y, { align: 'center' })
        y += ticketLineH
      }
    }

    // Logo (más visible que en layout solo texto)
    if (data.company.logo_url) {
      try {
        const logoW = Math.min(32, innerW)
        const logoH = 11
        const fmt = /image\/jpe?g/i.test(data.company.logo_url) ? 'JPEG' : 'PNG'
        doc.addImage(data.company.logo_url, fmt, (pageW - logoW) / 2, y, logoW, logoH)
        y += logoH + 3
      } catch {
        // continuar sin logo
      }
    }

    // Encabezado empresa (nombre largo → varias líneas centradas)
    addTicketWrappedCenter(data.company.business_name, FONT_SIZE_TITLE)
    if (data.company.trade_name) {
      addTicketWrappedCenter(data.company.trade_name, FONT_SIZE)
    }
    addTicketLineCenter(`RUC ${data.company.ruc}`, FONT_SIZE_SM)
    const issuerAddressTicket = getPrintIssuerAddress(data)
    if (issuerAddressTicket) {
      doc.setFontSize(FONT_SIZE_SM)
      const addrLines = doc.splitTextToSize(issuerAddressTicket, innerW)
      for (const line of addrLines) {
        doc.text(line, pageW / 2, y, { align: 'center' })
        y += ticketLineH
      }
    }
    if (data.company.phone) addTicketWrapped(`Telf: ${data.company.phone}`, FONT_SIZE_SM)
    if (data.company.email) addTicketWrapped(`Email: ${data.company.email}`, FONT_SIZE_SM)
    if (data.company.website) addTicketWrapped(`Web: ${data.company.website}`, FONT_SIZE_SM)
    addSpace(2)

    // Título comprobante
    addTicketLineCenter(`R.U.C. ${data.company.ruc}`, FONT_SIZE_SM)
    addTicketLineCenter(getTipoComprobanteLabel(data.sunat_code), FONT_SIZE)
    doc.setFontSize(FONT_SIZE_TITLE)
    doc.text(`${data.series}-${data.number}`, pageW / 2, y, { align: 'center' })
    y += ticketLineH + 2
    addSpace(2)

    // Datos cabecera
    addTicketWrapped(`Fecha Emisión: ${data.issue_date}`, FONT_SIZE_SM)
    if (data.issue_time) addTicketWrapped(`Hora Emisión: ${data.issue_time}`, FONT_SIZE_SM)
    if (data.client) {
      addTicketWrapped(
        `Cliente: ${data.client.business_name}`,
        FONT_SIZE_SM,
      )
      addTicketWrapped(
        `Doc.: ${data.client.doc_number || (data.client.doc_type === '6' ? 'RUC' : data.client.doc_type)}`,
        FONT_SIZE_SM,
      )
      if (data.client.address) {
        addTicketWrapped(`Dirección: ${data.client.address}`, FONT_SIZE_SM)
      }
    }
    addTicketWrapped(`Tipo Moneda: ${data.currency === 'USD' ? 'DÓLARES' : 'SOLES'}`, FONT_SIZE_SM)
    addSpace(2)

    // Detalle POS: Courier + columnas en mm (ancho real del rollo; P.UNIT/TOTAL al borde derecho)
    doc.setFont('courier', 'normal')
    doc.setFontSize(ticketMonoSize)

    const emitTicketDashRow = () => {
      doc.setFont('courier', 'normal')
      doc.setFontSize(ticketMonoSize)
      const dash = doc.splitTextToSize('-'.repeat(200), lay.innerW)[0] ?? '-'
      doc.text(dash, margin, y)
      y += ticketLineH
    }

    const emitTicketHeaderRow = () => {
      doc.setFont('courier', 'normal')
      doc.setFontSize(ticketMonoSize)
      doc.text('CANT', lay.xQty, y, { maxWidth: lay.wQty })
      doc.text('UNID', lay.xUnit, y, { maxWidth: lay.wUnit })
      doc.text('DESC.', lay.xDesc, y, { maxWidth: lay.wDescFirst })
      doc.text('P.UNIT', lay.xEndPUnit, y, { align: 'right', maxWidth: lay.wMoney })
      doc.text('TOTAL', lay.xEndTotal, y, { align: 'right', maxWidth: lay.wMoney })
      y += ticketLineH
    }

    const emitTicketAmountRow = (label: string, amount: string, opts?: { bold?: boolean }) => {
      doc.setFont('courier', opts?.bold ? 'bold' : 'normal')
      doc.setFontSize(ticketMonoSize)
      const labelMaxW = Math.max(10, lay.xEndPUnit - margin - lay.gap - 1)
      const labelLines = doc.splitTextToSize(label, labelMaxW)
      for (let i = 0; i < labelLines.length; i++) {
        doc.text(labelLines[i], margin, y, { maxWidth: labelMaxW })
        if (i === labelLines.length - 1) {
          doc.text(amount, lay.xEndTotal, y, { align: 'right', maxWidth: lay.wMoney })
        }
        y += ticketLineH
      }
    }

    emitTicketHeaderRow()
    emitTicketDashRow()

    for (const it of data.items) {
      const desc = (it.description || '').trim() || '—'
      const pu = formatMoney(it.unit_price, data.currency)
      const tot = formatMoney(it.total, data.currency)
      const descLines = doc.splitTextToSize(desc, lay.wDescFirst)
      const firstDesc = descLines[0] ?? '—'

      doc.setFont('courier', 'normal')
      doc.setFontSize(ticketMonoSize)
      doc.text(String(it.quantity), lay.xQty, y, { maxWidth: lay.wQty })
      doc.text((it.unit || '').slice(0, 10), lay.xUnit, y, { maxWidth: lay.wUnit })
      doc.text(firstDesc, lay.xDesc, y, { maxWidth: lay.wDescFirst })
      doc.text(pu, lay.xEndPUnit, y, { align: 'right', maxWidth: lay.wMoney })
      doc.text(tot, lay.xEndTotal, y, { align: 'right', maxWidth: lay.wMoney })
      y += ticketLineH

      for (let i = 1; i < descLines.length; i++) {
        doc.setFont('courier', 'normal')
        doc.setFontSize(ticketMonoSize)
        doc.text(descLines[i], lay.xDesc, y, { maxWidth: lay.wDescCont })
        y += ticketLineH
      }
      y += 0.5
    }

    emitTicketDashRow()

    const aff = data.totals_by_affectation || {}
    const gravado = aff['10']
    const exonerado = aff['20']
    const inafecto = aff['30']
    if (gravado) {
      emitTicketAmountRow('Op. Gravadas:', formatMoney(gravado.total, data.currency))
    }
    if (exonerado) {
      emitTicketAmountRow('Op. Exoneradas:', formatMoney(exonerado.total, data.currency))
    }
    if (inafecto) {
      emitTicketAmountRow('Op. Inafectas:', formatMoney(inafecto.total, data.currency))
    }
    emitTicketAmountRow('IGV:', formatMoney(data.tax_amount, data.currency))
    emitTicketAmountRow('TOTAL A PAGAR:', formatMoney(data.total, data.currency), { bold: true })
    doc.setFont('helvetica', 'normal')
    addSpace(2)

    // Leyenda (monto en letras)
    if (data.legend_text) {
      addTicketWrapped(`Son: ${data.legend_text}`, FONT_SIZE_SM)
      addSpace(2)
    }

    if (paymentWalletVisible(data, 'ticket')) {
      y = await renderPaymentWalletBlock(doc, data, 'ticket', y, pageW, margin)
      addSpace(2)
    }

    // QR + hash + pagos
    if (data.qr_data) {
      try {
        const qrDataUrl = await QRCode.toDataURL(data.qr_data, { width: 40, margin: 1 })
        const qrSize = 25
        doc.addImage(qrDataUrl, 'PNG', (pageW - qrSize) / 2, y, qrSize, qrSize)
        y += qrSize + 5
      } catch {
        // ignorar si falla el QR
      }
    }
    if (data.sunat_hash) {
      addTicketWrapped('CÓDIGO HASH:', FONT_SIZE_SM)
      addTicketWrapped(data.sunat_hash, FONT_SIZE_SM)
    }
    if (data.payments.length > 0) {
      addTicketWrapped('CONDICIÓN DE PAGO:', FONT_SIZE_SM)
      for (const p of data.payments) {
        addTicketWrapped(
          `${getMedioPagoLabel(p.method) || p.method}: ${formatMoney(p.amount, data.currency)}`,
          FONT_SIZE_SM,
        )
      }
    }
    addSpace(4)
    if (data.sunat_code !== '00') {
      doc.setFontSize(FONT_SIZE_SM)
      const footLines = doc.splitTextToSize(
        'Representación impresa del comprobante electrónico',
        innerW,
      )
      for (const fl of footLines) {
        doc.text(fl, pageW / 2, y, { align: 'center' })
        y += ticketLineH
      }
    }
    return doc
  }

  // === FORMATO A4 ===

  // Logo + bloque derecho (tipo comprobante) similar a ejemplo:
  // Logo arriba izquierda, cuadro a la derecha con "BOLETA DE VENTA ELECTRÓNICA", RUC y serie-número.
  const startY = y
  const logoSize = 25
  if (data.company.logo_url) {
    try {
      // jsPDF v3 soporta data URLs; asumimos que logo_url es data URL o URL absoluta ya cargable por el navegador.
      doc.addImage(data.company.logo_url, 'PNG', margin, startY, logoSize, logoSize)
    } catch {
      // si falla el logo, seguimos sin interrumpir
    }
  }
  // Cuadro derecho del comprobante
  const boxX = A4_WIDTH / 2
  const boxW = A4_WIDTH / 2 - margin
  const boxH = 30
  doc.setLineWidth(0.3)
  doc.rect(boxX, startY, boxW, boxH)
  y = startY + 8
  doc.setFontSize(FONT_SIZE_TITLE)
  doc.text(getTipoComprobanteLabel(data.sunat_code), boxX + boxW / 2, y, { align: 'center' })
  y += lineH + 1
  doc.setFontSize(FONT_SIZE)
  doc.text(`R.U.C.: ${data.company.ruc}`, boxX + boxW / 2, y, { align: 'center' })
  y += lineH + 1
  doc.text(`${data.series}-${data.number}`, boxX + boxW / 2, y, { align: 'center' })
  y = startY + boxH + 6

  // Bloque con datos de empresa/cliente debajo del logo/cuadro (como en imagen)
  doc.setLineWidth(0.3)
  const infoBoxY = y
  const infoBoxH = 20
  doc.rect(margin, infoBoxY, A4_WIDTH - 2 * margin, infoBoxH)
  y += 6
  doc.setFontSize(FONT_SIZE)
  doc.text(data.company.trade_name || data.company.business_name, margin + 2, y)
  y += lineH
  const issuerAddressA4 = getPrintIssuerAddress(data)
  if (issuerAddressA4) {
    doc.setFontSize(FONT_SIZE_SM)
    doc.text(`Dirección: ${issuerAddressA4}`, margin + 2, y)
    y += lineH
  }
  y = infoBoxY + infoBoxH + 4

  // Segunda fila: datos de cliente y moneda
  doc.setLineWidth(0.3)
  const clientBoxH = 18
  doc.rect(margin, y, A4_WIDTH - 2 * margin, clientBoxH)
  y += 5
  doc.setFontSize(FONT_SIZE_SM)
  if (data.client) {
    doc.text(`Razón Social: ${data.client.business_name}`, margin + 2, y)
    doc.text(
      `ND: ${data.client.doc_number || ''}`,
      A4_WIDTH - margin - 60,
      y
    )
    y += lineH
    if (data.client.address) {
      doc.text(`Dirección: ${data.client.address}`, margin + 2, y)
    }
  }
  y += lineH
  doc.text(`Fecha Emisión: ${data.issue_date}`, margin + 2, y)
  doc.text(
    `Tipo Moneda: ${data.currency === 'USD' ? 'DÓLARES' : 'SOLES'}`,
    A4_WIDTH - margin - 60,
    y
  )
  y = infoBoxY + infoBoxH + clientBoxH + 10

  // Detalle (A4): encabezado de columnas + filas alineadas
  addLine('DETALLE', { size: FONT_SIZE_SM })
  y += 2.5
  doc.setLineWidth(0.2)
  doc.setDrawColor(0)
  doc.line(margin, y, A4_WIDTH - margin, y)
  y += 5

  const a4Inner = A4_WIDTH - 2 * margin
  const col = {
    wCode: 16,
    wDesc: 90,
    wQty: 12,
    wUnit: 15,
    wPUnit: 22,
    wTotal: 25,
  }
  const colSum =
    col.wCode + col.wDesc + col.wQty + col.wUnit + col.wPUnit + col.wTotal
  if (Math.abs(colSum - a4Inner) > 0.5) {
    col.wDesc = Math.max(40, a4Inner - (col.wCode + col.wQty + col.wUnit + col.wPUnit + col.wTotal))
  }
  const xCode = margin
  const xDesc = xCode + col.wCode
  const xQty = xDesc + col.wDesc
  const xUnit = xQty + col.wQty
  const xPUnit = xUnit + col.wUnit
  const xTotalCol = xPUnit + col.wPUnit

  doc.setFontSize(FONT_SIZE_SM)
  doc.setFont('helvetica', 'bold')
  doc.text('COD.', xCode, y)
  doc.text('DESCRIPCIÓN', xDesc, y)
  doc.text('CANT.', xQty + col.wQty, y, { align: 'right' })
  doc.text('UNID.', xUnit, y)
  doc.text('P. UNIT', xPUnit + col.wPUnit, y, { align: 'right' })
  doc.text('TOTAL', xTotalCol + col.wTotal, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  y += lineH + 1.5
  doc.line(margin, y, A4_WIDTH - margin, y)
  y += 5

  for (const it of data.items) {
    doc.setFontSize(FONT_SIZE_SM)
    const descLines = doc.splitTextToSize((it.description || '').trim() || '—', col.wDesc)
    const codeStr = (it.code || '—').trim().slice(0, 16) || '—'

    doc.text(codeStr, xCode, y, { maxWidth: col.wCode })
    doc.text(descLines[0] ?? '—', xDesc, y, { maxWidth: col.wDesc })
    doc.text(String(it.quantity), xQty + col.wQty, y, { align: 'right' })
    doc.text((it.unit || '—').slice(0, 10), xUnit, y, { maxWidth: col.wUnit })
    doc.text(formatMoney(it.unit_price, data.currency), xPUnit + col.wPUnit, y, { align: 'right' })
    doc.text(formatMoney(it.total, data.currency), xTotalCol + col.wTotal, y, { align: 'right' })
    y += lineH
    for (let i = 1; i < descLines.length; i++) {
      doc.text(descLines[i], xDesc, y, { maxWidth: col.wDesc })
      y += lineH
    }
    addSpace(0.5)
  }
  y += 1.5
  doc.line(margin, y, A4_WIDTH - margin, y)
  y += 4

  // Totales
  addLine(`Subtotal: ${formatMoney(data.subtotal, data.currency)}`, { align: 'right' })
  addLine(`IGV: ${formatMoney(data.tax_amount, data.currency)}`, { align: 'right' })
  addLine(`TOTAL: ${formatMoney(data.total, data.currency)}`, { size: FONT_SIZE_TITLE, align: 'right' })
  addSpace(2)

  // Leyenda (monto en letras)
  if (data.legend_text) {
    addLine(data.legend_text, { size: FONT_SIZE_SM })
    addSpace(2)
  }

  // Pagos
  if (data.payments.length > 0) {
    addLine('PAGOS:', { size: FONT_SIZE_SM })
    for (const p of data.payments) {
      addLine(`${getMedioPagoLabel(p.method) || p.method}: ${formatMoney(p.amount, data.currency)}`)
    }
    addSpace(2)
  }

  if (paymentWalletVisible(data, 'a4')) {
    y = await renderPaymentWalletBlock(doc, data, 'a4', y, pageW, margin)
    addSpace(2)
  }

  // QR
  if (data.qr_data) {
    try {
      const qrDataUrl = await QRCode.toDataURL(data.qr_data, { width: 40, margin: 1 })
      const qrSize = 35
      doc.addImage(qrDataUrl, 'PNG', (pageW - qrSize) / 2, y, qrSize, qrSize)
      y += qrSize + 5
    } catch {
      // ignorar si falla el QR
    }
  }

  if (data.sunat_code !== '00') {
    addLine('Representación impresa del comprobante electrónico', {
      size: FONT_SIZE_SM,
      align: 'center',
    })
    addLine('Consulte su comprobante en sunat.gob.pe', {
      size: FONT_SIZE_SM,
      align: 'center',
    })
  }

  return doc
}

export async function downloadReceiptPdf(data: PrintData, format: 'a4' | 'ticket' = 'a4'): Promise<void> {
  const doc = await generateReceiptPdf(data, format)
  const name = `comprobante-${data.series}-${data.number}.pdf`
  doc.save(name)
}

export async function openReceiptPdfInNewTab(data: PrintData, format: 'a4' | 'ticket' = 'a4'): Promise<void> {
  const doc = await generateReceiptPdf(data, format)
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
