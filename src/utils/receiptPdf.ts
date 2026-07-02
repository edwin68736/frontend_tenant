import { jsPDF, GState } from 'jspdf'
import QRCode from 'qrcode'
import type { PrintData } from '@/types/printData'
import { paymentWalletVisible, renderPaymentWalletBlock } from '@/utils/receiptPaymentWallet'
import { getTipoComprobanteLabel, getMedioPagoLabel, isElectronicSunatCode } from '@/constants/sunat'
import { buildReceiptTotalLines, formatReceiptTotalAmount, resolvePrintChangeAmount } from '@/utils/receiptTotals'
import { ticketColumnLayoutMm } from '@/utils/receiptTicketLayout'
import { getPrintIssuerAddress } from '@/utils/printIssuer'
import { trimCompanyAdditionalNotes } from '@/utils/receiptCompanyNotes'
import {
  normalizeTicketPaperWidth,
  ticketMarginMm,
  ticketPageWidthMm,
  ticketTopPaddingMm,
} from '@/utils/receiptTicketPaper'
import { renderTicketPaymentAndSunatQrRow } from '@/utils/receiptTicketFooter'
import { fitReceiptLogoMm, resolveReceiptLogoForPdf } from '@/utils/receiptLogoPdf'
import { rasterPxForMm } from '@/utils/receiptPdfRaster'

const FONT_SIZE = 10
const FONT_SIZE_SM = 8
/** Cuerpo ticket: 10pt para impresión nítida desde visor PDF del navegador. */
const FONT_SIZE_TICKET_BODY = 10
const FONT_SIZE_TITLE = 13
const MARGIN = 15
/** Alto de página ticket (mm); rollo largo para ítems con descripción multilínea */
const TICKET_PAGE_HEIGHT = 520
const A4_WIDTH = 210
const A4_HEIGHT = 297

function formatDocNumber(data: PrintData): string {
  const n = String(data.number ?? '').trim()
  if (n.includes('-')) return n
  const s = String(data.series ?? '').trim()
  if (s && n) return `${s}-${n}`
  return n || s
}

function isNonElectronicDoc(code?: string): boolean {
  const c = String(code ?? '').trim()
  return c === '00' || c === 'QT'
}

async function qrDataUrlForPrint(sizeMm: number, payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: rasterPxForMm(sizeMm),
    margin: 0,
    errorCorrectionLevel: 'M',
  })
}

function formatMoney(n: number, currency = 'PEN'): string {
  const sym = currency === 'USD' ? '$' : 'S/'
  return `${sym} ${n.toFixed(2)}`
}

function renderFiscalHeaderLines(
  data: PrintData,
  emitLine: (text: string, size?: number) => void,
) {
  const f = data.fiscal
  if (!f) return
  if (f.purchase_order_number) {
    emitLine(`O/C: ${f.purchase_order_number}`, FONT_SIZE_SM)
  }
  if (f.guias?.length) {
    for (const g of f.guias) {
      const label = g.kind === 'guia_transportista' ? 'Guía transp.' : 'Guía rem.'
      emitLine(`${label}: ${g.number}`, FONT_SIZE_SM)
    }
  }
  if (f.fiscal_observations) {
    emitLine(`Obs.: ${f.fiscal_observations}`, FONT_SIZE_SM)
  }
  if (data.seller_name) {
    emitLine(`Vendedor: ${data.seller_name}`, FONT_SIZE_SM)
  }
}

function renderFiscalTotals(
  data: PrintData,
  emitAmountRow: (label: string, amount: string, opts?: { bold?: boolean }) => void,
) {
  const f = data.fiscal
  if (!f) return
  if (f.retention_applied) {
    emitAmountRow('RET. IGV (3%):', formatMoney(f.igv_retention_amount ?? 0, data.currency))
    emitAmountRow('NETO A COBRAR:', formatMoney(f.net_collectible ?? data.total, data.currency), {
      bold: true,
    })
  }
  if (f.has_detraccion) {
    const pct = f.detraccion_rate_percent ?? 0
    emitAmountRow(`DETRACCIÓN (${pct}%):`, formatMoney(f.detraccion_amount ?? 0, 'PEN'))
    if (f.detraccion_bank_account) {
      emitAmountRow('CTA. BN:', f.detraccion_bank_account)
    }
    emitAmountRow('NETO A COBRAR:', formatMoney(f.detraccion_net_payable ?? data.total, data.currency), {
      bold: true,
    })
  }
}

function renderFiscalFooter(
  data: PrintData,
  addWrapped: (text: string, size?: number) => void,
  addSpace: (h?: number) => void,
) {
  const f = data.fiscal
  if (!f?.show_terms_conditions || !f.terms_text?.trim()) return
  addSpace(2)
  addWrapped('Términos y condiciones:', FONT_SIZE_SM)
  addWrapped(f.terms_text.trim(), FONT_SIZE_SM)
}

export type ReceiptPdfOptions = {
  paperWidthMm?: 58 | 80
  /** Marca de agua diagonal "Previsualizacion" (solo vista previa, no comprobante guardado). */
  preview?: boolean
}

function applyPreviewWatermark(doc: jsPDF, pageW: number, contentHeightMm?: number) {
  const pageCount = doc.getNumberOfPages()
  const isTicket = pageW <= 80
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    const pageH = doc.internal.pageSize.getHeight()
    const centerY =
      contentHeightMm != null && contentHeightMm > 0
        ? Math.min(contentHeightMm / 2, pageH / 2)
        : pageH / 2
    doc.saveGraphicsState()
    doc.setGState(new GState({ opacity: 0.22 }))
    doc.setTextColor(220, 38, 38)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(isTicket ? 18 : 48)
    doc.text('Previsualizacion', pageW / 2, centerY, {
      align: 'center',
      baseline: 'middle',
      angle: 45,
    })
    doc.restoreGraphicsState()
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'normal')
  }
}

export async function generateReceiptPdf(
  data: PrintData,
  format: 'a4' | 'ticket' = 'a4',
  options?: ReceiptPdfOptions,
): Promise<jsPDF> {
  const isTicket = format === 'ticket'
  const paperMm = normalizeTicketPaperWidth(options?.paperWidthMm)
  const pageW = isTicket ? ticketPageWidthMm(paperMm) : A4_WIDTH
  const margin = isTicket ? ticketMarginMm(paperMm) : MARGIN
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: isTicket ? [pageW, TICKET_PAGE_HEIGHT] : 'a4',
    compress: false,
  })

  let y = margin + (isTicket ? ticketTopPaddingMm(paperMm) : 0)
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
    const ticketLineH = 4.5
    /** Helvetica 10pt + negro puro: mejor nitidez al imprimir ticket desde PDF. */
    const ticketDetailFontPt = FONT_SIZE_TICKET_BODY
    const lay = ticketColumnLayoutMm({
      pageW,
      margin,
      gapMm: paperMm === 58 ? 0.35 : 0.5,
      wMoneyMm: paperMm === 58 ? 14 : 15,
    })

    const setTicketDetailFont = (bold = false) => {
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setFontSize(ticketDetailFontPt)
    }

    const addTicketWrapped = (text: string, size = FONT_SIZE_TICKET_BODY) => {
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(size)
      const lines = doc.splitTextToSize(text, innerW)
      for (const line of lines) {
        doc.text(line, margin, y)
        y += ticketLineH
      }
    }

    const addTicketLineCenter = (text: string, size?: number) => {
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(size ?? FONT_SIZE)
      doc.text(text, pageW / 2, y, { align: 'center' })
      y += ticketLineH + (size && size >= FONT_SIZE_TITLE ? 0.8 : 0)
    }

    /** Texto centrado con salto de línea (razón social larga, etc.) */
    const addTicketWrappedCenter = (text: string, size: number) => {
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(size)
      const lines = doc.splitTextToSize(text, innerW)
      for (const line of lines) {
        doc.text(line, pageW / 2, y, { align: 'center' })
        y += ticketLineH
      }
    }

    // Logo (alta resolución para impresión)
    addSpace(3)
    if (data.company.logo_url) {
      try {
        const logo = await resolveReceiptLogoForPdf(data.company.logo_url)
        if (logo) {
          const maxW = Math.min(paperMm === 58 ? 28 : 32, innerW)
          const maxH = paperMm === 58 ? 10 : 12
          const { w, h } = fitReceiptLogoMm(logo.naturalW, logo.naturalH, maxW, maxH)
          doc.addImage(logo.dataUrl, logo.format, (pageW - w) / 2, y, w, h, undefined, 'NONE')
          y += h + 5
        }
      } catch {
        // continuar sin logo
      }
    }

    // Encabezado empresa (nombre largo → varias líneas centradas)
    addTicketWrappedCenter(data.company.business_name, FONT_SIZE_TITLE)
    if (data.company.trade_name) {
      addTicketWrappedCenter(data.company.trade_name, FONT_SIZE)
    }
    addTicketLineCenter(`RUC ${data.company.ruc}`, FONT_SIZE_TICKET_BODY)
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
    const extraNotes = trimCompanyAdditionalNotes(data.company.additional_notes)
    if (extraNotes) {
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(FONT_SIZE_SM)
      const noteLines = doc.splitTextToSize(extraNotes, innerW)
      for (const line of noteLines) {
        doc.text(line, pageW / 2, y, { align: 'center' })
        y += ticketLineH
      }
    }
    if (data.company.website) addTicketWrapped(`Web: ${data.company.website}`, FONT_SIZE_SM)
    addSpace(2)

    // Título comprobante
    addTicketLineCenter(`R.U.C. ${data.company.ruc}`, FONT_SIZE_SM)
    addTicketLineCenter(getTipoComprobanteLabel(data.sunat_code), FONT_SIZE)
    doc.setFontSize(FONT_SIZE_TITLE)
    doc.text(formatDocNumber(data), pageW / 2, y, { align: 'center' })
    y += ticketLineH + 2
    addSpace(2)

    // Datos cabecera
    addTicketWrapped(`Fecha Emisión: ${data.issue_date}`, FONT_SIZE_SM)
    if (data.issue_time) addTicketWrapped(`Hora Emisión: ${data.issue_time}`, FONT_SIZE_SM)
    if (data.valid_until) addTicketWrapped(`Válida hasta: ${data.valid_until}`, FONT_SIZE_SM)
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
    renderFiscalHeaderLines(data, (text, size) => addTicketWrapped(text, size ?? FONT_SIZE_SM))
    addSpace(2)

    // Detalle: Helvetica 8pt + negro puro (misma legibilidad que cabecera al imprimir)
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'normal')

    const emitTicketDashRow = () => {
      setTicketDetailFont(false)
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.35)
      doc.line(margin, y, pageW - margin, y)
      y += ticketLineH * 0.9
    }

    const emitTicketHeaderRow = () => {
      setTicketDetailFont(true)
      doc.text('CANT', lay.xQty, y, { maxWidth: lay.wQty })
      doc.text('UNID', lay.xUnit, y, { maxWidth: lay.wUnit })
      doc.text('DESC.', lay.xDesc, y, { maxWidth: lay.wDescFirst })
      doc.text('P.UNIT', lay.xEndPUnit, y, { align: 'right', maxWidth: lay.wMoney })
      doc.text('TOTAL', lay.xEndTotal, y, { align: 'right', maxWidth: lay.wMoney })
      y += ticketLineH
    }

    const emitTicketAmountRow = (label: string, amount: string, opts?: { bold?: boolean }) => {
      setTicketDetailFont(Boolean(opts?.bold))
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

      setTicketDetailFont(false)
      doc.text(String(it.quantity), lay.xQty, y, { maxWidth: lay.wQty })
      doc.text((it.unit || '').slice(0, 10), lay.xUnit, y, { maxWidth: lay.wUnit })
      doc.text(firstDesc, lay.xDesc, y, { maxWidth: lay.wDescFirst })
      doc.text(pu, lay.xEndPUnit, y, { align: 'right', maxWidth: lay.wMoney })
      doc.text(tot, lay.xEndTotal, y, { align: 'right', maxWidth: lay.wMoney })
      y += ticketLineH

      for (let i = 1; i < descLines.length; i++) {
        setTicketDetailFont(false)
        doc.text(descLines[i], lay.xDesc, y, { maxWidth: lay.wDescCont })
        y += ticketLineH
      }
      y += 0.5
    }

    emitTicketDashRow()

    for (const row of buildReceiptTotalLines(data)) {
      emitTicketAmountRow(
        row.label,
        formatReceiptTotalAmount(row.amount, data.currency, { negative: row.negative }),
        { bold: row.bold },
      )
    }
    renderFiscalTotals(data, emitTicketAmountRow)
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'normal')
    addSpace(2)

    // Leyenda (monto en letras)
    if (data.legend_text) {
      addTicketWrapped(`Son: ${data.legend_text}`, FONT_SIZE_SM)
      addSpace(2)
    }

    renderFiscalFooter(data, addTicketWrapped, addSpace)

    if (paymentWalletVisible(data, 'ticket')) {
      y = await renderPaymentWalletBlock(doc, data, 'ticket', y, pageW, margin)
      addSpace(2)
    }

    const showSunatQr = isElectronicSunatCode(data.sunat_code) && Boolean(data.qr_data)
    y = await renderTicketPaymentAndSunatQrRow(doc, data, {
      showSunatQr,
      y,
      pageW,
      margin,
      innerW,
      lineH: ticketLineH,
    })
    addSpace(4)

    if (!showSunatQr) {
      if (!isNonElectronicDoc(data.sunat_code)) {
        doc.setFontSize(FONT_SIZE_TICKET_BODY)
        const footLines = doc.splitTextToSize(
          'Representación impresa del comprobante electrónico',
          innerW,
        )
        for (const fl of footLines) {
          doc.text(fl, pageW / 2, y, { align: 'center' })
          y += ticketLineH
        }
      } else if (data.sunat_code === 'QT') {
        addTicketWrapped('Documento comercial — no válido como comprobante de pago SUNAT', FONT_SIZE_TICKET_BODY)
      }
    }

    if (options?.preview) {
      applyPreviewWatermark(doc, pageW, y + margin)
    }
    return doc
  }

  // === FORMATO A4 ===

  // Logo + bloque derecho (tipo comprobante) similar a ejemplo:
  // Logo arriba izquierda, cuadro a la derecha con "BOLETA DE VENTA ELECTRÓNICA", RUC y serie-número.
  const startY = y + 2
  const logoSize = 25
  if (data.company.logo_url) {
    try {
      const logo = await resolveReceiptLogoForPdf(data.company.logo_url)
      if (logo) {
        const { w, h } = fitReceiptLogoMm(logo.naturalW, logo.naturalH, logoSize, logoSize)
        doc.addImage(logo.dataUrl, logo.format, margin, startY, w, h, undefined, 'NONE')
      }
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
  doc.text(formatDocNumber(data), boxX + boxW / 2, y, { align: 'center' })
  y = startY + boxH + 8

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
  y += lineH
  if (data.valid_until) {
    doc.text(`Válida hasta: ${data.valid_until}`, margin + 2, y)
    y += lineH
  }
  if (data.fiscal?.purchase_order_number) {
    doc.text(`O/C: ${data.fiscal.purchase_order_number}`, margin + 2, y)
    y += lineH
  }
  if (data.fiscal?.guias?.length) {
    for (const g of data.fiscal.guias) {
      const label = g.kind === 'guia_transportista' ? 'Guía transp.' : 'Guía rem.'
      doc.text(`${label}: ${g.number}`, margin + 2, y)
      y += lineH
    }
  }
  if (data.fiscal?.fiscal_observations) {
    const obsLines = doc.splitTextToSize(`Obs.: ${data.fiscal.fiscal_observations}`, A4_WIDTH - 2*margin - 4)
    for (const line of obsLines) {
      doc.text(line, margin + 2, y)
      y += lineH
    }
  }
  if (data.seller_name) {
    doc.text(`Vendedor: ${data.seller_name}`, margin + 2, y)
    y += lineH
  }
  y += 6

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

  // Totales (misma secuencia que ticket)
  for (const row of buildReceiptTotalLines(data)) {
    const label = row.label.replace(/:$/, '')
    addLine(
      `${label}: ${formatReceiptTotalAmount(row.amount, data.currency, { negative: row.negative })}`,
      { align: 'right', size: row.bold ? FONT_SIZE_TITLE : FONT_SIZE },
    )
  }
  if (data.fiscal?.retention_applied) {
    addLine(`Ret. IGV (3%): ${formatMoney(data.fiscal.igv_retention_amount ?? 0, data.currency)}`, { align: 'right' })
    addLine(`Neto a cobrar: ${formatMoney(data.fiscal.net_collectible ?? data.total, data.currency)}`, {
      size: FONT_SIZE_TITLE,
      align: 'right',
    })
  }
  if (data.fiscal?.has_detraccion) {
    const pct = data.fiscal.detraccion_rate_percent ?? 0
    addLine(`Detracción (${pct}%): ${formatMoney(data.fiscal.detraccion_amount ?? 0, 'PEN')}`, { align: 'right' })
    if (data.fiscal.detraccion_bank_account) {
      addLine(`Cta. BN: ${data.fiscal.detraccion_bank_account}`, { size: FONT_SIZE_SM, align: 'right' })
    }
    addLine(`Neto a cobrar: ${formatMoney(data.fiscal.detraccion_net_payable ?? data.total, data.currency)}`, {
      size: FONT_SIZE_TITLE,
      align: 'right',
    })
  }
  addSpace(2)

  // Leyenda (monto en letras)
  if (data.legend_text) {
    addLine(data.legend_text, { size: FONT_SIZE_SM })
    addSpace(2)
  }

  renderFiscalFooter(data, (text, size) => addLine(text, { size: size ?? FONT_SIZE_SM }), addSpace)

  if (data.notes?.trim() && data.notes.trim() !== data.fiscal?.fiscal_observations?.trim()) {
    addLine('Observaciones:', { size: FONT_SIZE_SM })
    addLine(data.notes.trim(), { size: FONT_SIZE_SM })
    addSpace(2)
  }

  // Pagos
  if (data.payments.length > 0) {
    addLine('PAGOS:', { size: FONT_SIZE_SM })
    for (const p of data.payments) {
      addLine(`${getMedioPagoLabel(p.method) || p.method}: ${formatMoney(p.amount, data.currency)}`)
    }
    const change = resolvePrintChangeAmount(data)
    if (change > 0.009) {
      addLine(`VUELTO: ${formatMoney(change, data.currency)}`, { size: FONT_SIZE_SM })
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
      const qrSize = 35
      const qrDataUrl = await qrDataUrlForPrint(qrSize, data.qr_data)
      doc.addImage(qrDataUrl, 'PNG', (pageW - qrSize) / 2, y, qrSize, qrSize, undefined, 'NONE')
      y += qrSize + 5
    } catch {
      // ignorar si falla el QR
    }
  }

  if (!isNonElectronicDoc(data.sunat_code)) {
    addLine('Representación impresa del comprobante electrónico', {
      size: FONT_SIZE_SM,
      align: 'center',
    })
    addLine('Consulte su comprobante en sunat.gob.pe', {
      size: FONT_SIZE_SM,
      align: 'center',
    })
  } else if (data.sunat_code === 'QT') {
    addLine('Documento comercial — no válido como comprobante de pago SUNAT', {
      size: FONT_SIZE_SM,
      align: 'center',
    })
  }

  if (options?.preview) {
    applyPreviewWatermark(doc, pageW, Math.min(y + margin, A4_HEIGHT))
  }

  return doc
}

export async function printDataToPdfBlob(
  data: PrintData,
  format: 'a4' | 'ticket' = 'a4',
  options?: ReceiptPdfOptions,
): Promise<Blob> {
  const doc = await generateReceiptPdf(data, format, options)
  return doc.output('blob')
}

export function receiptPdfFileName(data: PrintData, format: 'a4' | 'ticket'): string {
  const prefix = data.sunat_code === 'QT' ? 'cotizacion' : 'comprobante'
  const safe = formatDocNumber(data).replace(/[^\w.-]+/g, '_')
  return `${prefix}-${safe}-${format}.pdf`
}

export async function downloadReceiptPdf(
  data: PrintData,
  format: 'a4' | 'ticket' = 'a4',
  options?: ReceiptPdfOptions,
): Promise<void> {
  const doc = await generateReceiptPdf(data, format, options)
  doc.save(receiptPdfFileName(data, format))
}

export async function openReceiptPdfInNewTab(
  data: PrintData,
  format: 'a4' | 'ticket' = 'a4',
  options?: ReceiptPdfOptions,
): Promise<void> {
  const blob = await printDataToPdfBlob(data, format, options)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Abre el diálogo de impresión del navegador (mejor nitidez que imprimir desde iframe embebido). */
export async function printReceiptPdf(
  data: PrintData,
  format: 'a4' | 'ticket' = 'a4',
  options?: ReceiptPdfOptions,
): Promise<void> {
  const blob = await printDataToPdfBlob(data, format, options)
  const url = URL.createObjectURL(blob)

  await new Promise<void>((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.src = url

    const cleanup = () => {
      window.setTimeout(() => {
        iframe.remove()
        URL.revokeObjectURL(url)
      }, 2_000)
    }

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow
        if (!win) {
          reject(new Error('No se pudo abrir el visor de impresión'))
          cleanup()
          return
        }
        win.focus()
        win.addEventListener('afterprint', () => {
          cleanup()
          resolve()
        }, { once: true })
        win.print()
        window.setTimeout(() => {
          cleanup()
          resolve()
        }, 120_000)
      } catch (e) {
        cleanup()
        reject(e)
      }
    }

    iframe.onerror = () => {
      cleanup()
      reject(new Error('No se pudo cargar el PDF para imprimir'))
    }

    document.body.appendChild(iframe)
  })
}
