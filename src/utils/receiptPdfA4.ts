import { scaleLogoDimension } from '@/services/printers/logoPrintSize'
import { getCompanyLogoForPrint } from '@/lib/companyConfig/store'
import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import type { PrintData } from '@/types/printData'
import { getTipoDocIdentidadShortLabel, isElectronicSunatCode } from '@/constants/sunat'
import {
  prepaymentDeductionDescription,
  receiptDocTypeTitle,
} from '@/utils/fiscalPrepayment'
import { buildReceiptTotalLines } from '@/utils/receiptTotals'
import {
  receiptItemDisplayDescription,
  receiptItemDisplayTotal,
  receiptItemDisplayUnitPrice,
} from '@/utils/receiptBonificacion'
import { lineGlobalSubtotalDiscount, lineSubtotalDiscount } from '@/utils/receiptDiscount'
import { trimCompanyAdditionalNotes } from '@/utils/receiptCompanyNotes'
import { getCreditNoteReference } from '@/utils/receiptCreditNoteRef'
import { getPrintIssuerAddress } from '@/utils/printIssuer'
import { fitReceiptLogoMm, resolveReceiptLogoForPdf } from '@/utils/receiptLogoPdf'
import { rasterPxForMm } from '@/utils/receiptPdfRaster'
import { paymentWalletVisible, renderPaymentWalletBlock } from '@/utils/receiptPaymentWallet'
import { salePaymentMethodLabelEs } from '@/utils/paymentMethodLabels'
import { formatBankAccountLine, formatWalletAccountLine } from '@/utils/receiptBankAccounts'
import {
  getNotaVentaPrintLayout,
  type NotaVentaPrintLayoutSettings,
} from '@/services/printers/notaVentaPrintLayout'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 12
const CONTENT_W = PAGE_W - 2 * MARGIN
const LINE_H = 4.4
const FONT = 9
const FONT_SM = 8
const FONT_XS = 7
const FONT_LG = 10.5
const FONT_TITLE = 11.5
/** Gris claro (~20%) para barra tipo doc. y cabecera tabla */
const GRAY: [number, number, number] = [214, 214, 214]
const GREEN: [number, number, number] = [0, 128, 0]
/** Ancho fijo de etiquetas cliente (alineación tipo factura referencia) */
const CLIENT_LABEL_W = 46

const FOOTER_BOTTOM_MARGIN = 8

function defaultTukifacWebDisplay(): string {
  return 'www.tukifac.com'
}

function normalizeWebDisplay(raw?: string): string {
  const web = raw?.trim() || defaultTukifacWebDisplay()
  return web.replace(/^https?:\/\//i, '')
}

const FONT_FAMILY = 'times'

/**
 * Dibuja una línea de la cabecera de empresa. Si `justify` es true, reparte el
 * espacio sobrante entre las palabras para alinear a ambos márgenes (justificado).
 * Solo debe justificarse cada línea salvo la última de un párrafo.
 */
function drawCompanyInfoLine(
  doc: jsPDF,
  line: string,
  x: number,
  y: number,
  width: number,
  justify: boolean,
) {
  const words = line.split(/\s+/).filter(Boolean)
  if (!justify || words.length <= 1) {
    doc.text(line, x, y, { maxWidth: width })
    return
  }
  const wordsW = words.reduce((sum, w) => sum + doc.getTextWidth(w), 0)
  const gap = (width - wordsW) / (words.length - 1)
  if (!(gap > 0)) {
    doc.text(line, x, y, { maxWidth: width })
    return
  }
  let cx = x
  for (const w of words) {
    doc.text(w, cx, y)
    cx += doc.getTextWidth(w) + gap
  }
}

function formatDocNumber(data: PrintData): string {
  const n = String(data.number ?? '').trim()
  if (n.includes('-')) return n
  const s = String(data.series ?? '').trim()
  if (s && n) return `${s}-${n}`
  return n || s
}

function formatPlainAmount(n: number): string {
  return n.toFixed(2)
}

function formatDisplayDate(dateStr?: string): string {
  if (!dateStr?.trim()) return '—'
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return dateStr.slice(0, 10)
  const dmy = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  return dateStr.trim()
}

function a4DocTypeTitle(data: PrintData): string {
  return receiptDocTypeTitle(data.sunat_code, data.fiscal)
}

function itemLineDiscount(it: PrintData['items'][0]): number {
  return lineSubtotalDiscount(it) + lineGlobalSubtotalDiscount(it)
}

function resolveDueDate(data: PrintData): string {
  return formatDisplayDate(data.valid_until || data.issue_date)
}

function primaryPaymentLabel(data: PrintData): string {
  if (data.payments.length > 0) {
    return data.payments.map((p) => salePaymentMethodLabelEs(p.method)).join(', ')
  }
  const cond = String(data.payment_condition ?? '').trim()
  return cond || 'Contado'
}

function moneySymbol(currency: string): string {
  return currency === 'USD' ? '$' : 'S/'
}

async function qrDataUrl(payload: string, sizeMm: number): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: rasterPxForMm(sizeMm),
    margin: 0,
    errorCorrectionLevel: 'M',
  })
}

type A4Ctx = {
  doc: jsPDF
  y: number
}

function setFont(doc: jsPDF, size: number, style: 'normal' | 'bold' | 'italic' = 'normal') {
  doc.setFont(FONT_FAMILY, style)
  doc.setFontSize(size)
  doc.setTextColor(0, 0, 0)
}

function drawDottedRect(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.25)
  doc.setLineDashPattern([0.8, 0.8], 0)
  doc.rect(x, y, w, h)
  doc.setLineDashPattern([], 0)
}

function drawA4Field(
  ctx: A4Ctx,
  label: string,
  value: string,
  x: number,
  opts?: { labelW?: number; valueMaxW?: number },
) {
  const { doc, y } = ctx
  const labelW = opts?.labelW ?? CLIENT_LABEL_W
  setFont(doc, FONT, 'bold')
  doc.text(`${label} :`, x, y)
  setFont(doc, FONT, 'normal')
  const valueX = x + labelW
  const maxW = opts?.valueMaxW ?? CONTENT_W - labelW
  const lines = doc.splitTextToSize(value || '—', maxW)
  doc.text(lines[0] ?? '—', valueX, y)
  for (let i = 1; i < lines.length; i++) {
    ctx.y += LINE_H
    doc.text(lines[i], valueX, ctx.y)
  }
}

async function drawHeader(
  ctx: A4Ctx,
  data: PrintData,
  nvLayout: NotaVentaPrintLayoutSettings | null,
) {
  const { doc } = ctx
  const top = MARGIN
  // Tamaño base = «mediano»; el ajuste local lo escala a pequeño o grande.
  const logoMaxW = scaleLogoDimension(36)
  const logoMaxH = scaleLogoDimension(22)
  const boxW = 62
  const boxX = PAGE_W - MARGIN - boxW
  const showLogo = !nvLayout || nvLayout.showLogo
  const infoX = MARGIN + (showLogo ? logoMaxW + 4 : 0)
  const infoW = boxX - infoX - 4

  // El logo sale de la empresa (cargada al iniciar sesión), no del print_data de la venta.
  // Se resuelve aquí pero se dibuja al final del bloque: para centrarlo verticalmente hay
  // que conocer primero el alto real de la cabecera (datos de empresa vs. recuadro).
  const companyLogo = getCompanyLogoForPrint()
  let pendingLogo: { logo: Awaited<ReturnType<typeof resolveReceiptLogoForPdf>>; w: number; h: number } | null =
    null
  if (showLogo && companyLogo) {
    try {
      const logo = await resolveReceiptLogoForPdf(companyLogo)
      if (logo) {
        const { w, h } = fitReceiptLogoMm(logo.naturalW, logo.naturalH, logoMaxW, logoMaxH)
        pendingLogo = { logo, w, h }
      }
    } catch {
      /* sin logo */
    }
  }

  const companyName = (data.company.business_name || data.company.trade_name || '—').toUpperCase()
  setFont(doc, FONT_TITLE, 'bold')
  let cy = top + 3
  {
    const nameLines: string[] = doc.splitTextToSize(companyName, infoW)
    nameLines.forEach((line, i) => {
      drawCompanyInfoLine(doc, line, infoX, cy, infoW, i < nameLines.length - 1)
      cy += LINE_H + 0.2
    })
  }

  setFont(doc, FONT_SM, 'normal')
  const pushInfoLine = (text: string, uppercase = false) => {
    const raw = uppercase ? text.toUpperCase() : text
    const lines: string[] = doc.splitTextToSize(raw, infoW)
    lines.forEach((wl, i) => {
      drawCompanyInfoLine(doc, wl, infoX, cy, infoW, i < lines.length - 1)
      cy += LINE_H - 0.15
    })
  }

  pushInfoLine(`RUC ${data.company.ruc}`)
  const addr = getPrintIssuerAddress(data)
  if (addr) pushInfoLine(addr)
  const showContact = !nvLayout || nvLayout.showEmailAndPhone
  if (showContact) pushInfoLine(`Central telefónica: ${data.company.phone?.trim() || ''}`)
  if (showContact) pushInfoLine(`Email: ${data.company.email?.trim() || ''}`)

  const notes = trimCompanyAdditionalNotes(data.company.additional_notes)
  if (notes) {
    cy += 0.5
    setFont(doc, FONT_XS, 'normal')
    for (const part of notes.split(/\n/)) {
      const t = part.trim()
      if (t) pushInfoLine(t, true)
    }
  }

  const boxH = 36
  const showDocBox = !nvLayout || nvLayout.showDocTypeAndNumber
  if (showDocBox) {
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.25)
    doc.rect(boxX, top, boxW, boxH)

    setFont(doc, FONT, 'bold')
    doc.text(`RUC:  ${data.company.ruc}`, boxX + boxW / 2, top + 5.5, { align: 'center' })

    const barY = top + 9
    const barH = 9
    doc.setFillColor(...GRAY)
    doc.rect(boxX, barY, boxW, barH, 'F')
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.2)
    doc.line(boxX, barY, boxX + boxW, barY)
    doc.line(boxX, barY + barH, boxX + boxW, barY + barH)
    setFont(doc, FONT, 'bold')
    doc.text(a4DocTypeTitle(data), boxX + boxW / 2, barY + 6, { align: 'center' })

    setFont(doc, FONT_LG, 'bold')
    doc.text(formatDocNumber(data), boxX + boxW / 2, top + 30, { align: 'center' })
  }

  // Logo centrado en su columna: horizontal respecto al ancho reservado y vertical
  // respecto al alto real de la cabecera (lo más alto entre datos de empresa y recuadro).
  if (pendingLogo?.logo) {
    const sectionH = Math.max(cy - top, showDocBox ? boxH : 0)
    const logoX = MARGIN + Math.max(0, (logoMaxW - pendingLogo.w) / 2)
    const logoY = top + Math.max(0, (sectionH - pendingLogo.h) / 2)
    doc.addImage(
      pendingLogo.logo.dataUrl,
      pendingLogo.logo.format,
      logoX,
      logoY,
      pendingLogo.w,
      pendingLogo.h,
      undefined,
      'NONE',
    )
  }

  ctx.y = Math.max(cy, showDocBox ? top + boxH : top) + 8
}

function drawCustomerBlock(
  ctx: A4Ctx,
  data: PrintData,
  nvLayout: NotaVentaPrintLayoutSettings | null,
) {
  const { doc } = ctx
  const leftX = MARGIN
  const due = resolveDueDate(data)

  drawA4Field(ctx, 'FECHA DE EMISIÓN', formatDisplayDate(data.issue_date), leftX)
  ctx.y += LINE_H

  const showClient = !nvLayout || nvLayout.showClientData
  if (showClient) {
    if (data.client) {
      drawA4Field(ctx, 'CLIENTE', data.client.business_name, leftX)
      ctx.y += LINE_H
      const docLabel = getTipoDocIdentidadShortLabel(data.client.doc_type).toUpperCase()
      drawA4Field(ctx, docLabel, data.client.doc_number || '—', leftX, { valueMaxW: CONTENT_W * 0.45 })
      setFont(doc, FONT, 'normal')
      // Alinear al borde derecho del contenido (mismo ancho que caja RUC y tabla).
      doc.text(`Fecha Vencimiento: ${due}`, PAGE_W - MARGIN, ctx.y, { align: 'right' })
      ctx.y += LINE_H
      drawA4Field(ctx, 'DIRECCIÓN', data.client.address?.trim() || '—', leftX)
      ctx.y += LINE_H
    } else {
      drawA4Field(ctx, 'CLIENTE', 'CLIENTE VARIOS', leftX)
      ctx.y += LINE_H
    }
  }

  // Nota de crédito/débito: SUNAT exige el tipo de nota y el comprobante que modifica.
  const creditNoteRef = getCreditNoteReference(data)
  if (creditNoteRef) {
    if (creditNoteRef.noteTypeLabel) {
      drawA4Field(ctx, 'TIPO DE NOTA', creditNoteRef.noteTypeLabel, leftX)
      ctx.y += LINE_H
    }
    drawA4Field(ctx, 'TIPO DOC. REF.', creditNoteRef.docTypeLabel, leftX)
    ctx.y += LINE_H
    drawA4Field(ctx, 'DOCUMENTO REF.', creditNoteRef.docNumber, leftX)
    ctx.y += LINE_H
    if (creditNoteRef.reason) {
      drawA4Field(ctx, 'MOTIVO', creditNoteRef.reason, leftX)
      ctx.y += LINE_H
    }
  }

  if (data.fiscal?.purchase_order_number) {
    drawA4Field(ctx, 'O/C', data.fiscal.purchase_order_number, leftX)
    ctx.y += LINE_H
  }
  if (data.fiscal?.guias?.length) {
    for (const g of data.fiscal.guias) {
      const label = g.kind === 'guia_transportista' ? 'GUÍA TRANSP.' : 'GUÍA REM.'
      drawA4Field(ctx, label, g.number, leftX)
      ctx.y += LINE_H
    }
  }
  if (data.fiscal?.fiscal_observations) {
    drawA4Field(ctx, 'OBS.', data.fiscal.fiscal_observations, leftX)
    ctx.y += LINE_H
  }
  if (data.fiscal?.prepayment_deductions?.length) {
    for (const p of data.fiscal.prepayment_deductions) {
      drawA4Field(ctx, 'ANTICIPO', p.document_number, leftX)
      ctx.y += LINE_H
    }
  }

  ctx.y += 4
}

type TableCol = { label: string; w: number; align?: 'left' | 'right' | 'center' }

function drawItemsTable(ctx: A4Ctx, data: PrintData): number {
  const { doc } = ctx
  const tableTop = ctx.y
  const tableX = MARGIN
  const minBodyRows = 14
  const rowH = LINE_H + 0.6

  const cols: TableCol[] = [
    { label: 'CANT.', w: 11, align: 'center' },
    { label: 'UNIDAD', w: 15, align: 'center' },
    { label: 'CÓDIGO', w: 27, align: 'left' },
    { label: 'DESCRIPCIÓN', w: 72, align: 'left' },
    { label: 'P.UNIT', w: 19, align: 'right' },
    { label: 'DTO.', w: 15, align: 'right' },
    { label: 'TOTAL', w: 21, align: 'right' },
  ]
  const colSum = cols.reduce((s, c) => s + c.w, 0)
  if (Math.abs(colSum - CONTENT_W) > 0.5) {
    cols[3].w += CONTENT_W - colSum
  }

  const colX: number[] = []
  let cx = tableX
  for (const c of cols) {
    colX.push(cx)
    cx += c.w
  }

  const headerH = rowH + 0.8
  doc.setFillColor(...GRAY)
  doc.rect(tableX, tableTop, CONTENT_W, headerH, 'F')
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.2)
  doc.rect(tableX, tableTop, CONTENT_W, headerH)

  setFont(doc, FONT_SM, 'bold')
  const hy = tableTop + rowH
  cols.forEach((c, i) => {
    const tx =
      c.align === 'right' ? colX[i] + c.w - 1.5 : c.align === 'center' ? colX[i] + c.w / 2 : colX[i] + 1.5
    doc.text(c.label, tx, hy, { align: c.align ?? 'left', maxWidth: c.w - 2 })
    if (i > 0) doc.line(colX[i], tableTop, colX[i], tableTop + headerH)
  })
  doc.line(tableX + CONTENT_W, tableTop, tableX + CONTENT_W, tableTop + headerH)

  let rowY = tableTop + headerH
  const bodyBottom = rowY + rowH * minBodyRows

  const drawVerticalGrid = (y0: number, y1: number) => {
    doc.line(tableX, y0, tableX, y1)
    for (let i = 1; i < cols.length; i++) doc.line(colX[i], y0, colX[i], y1)
    doc.line(tableX + CONTENT_W, y0, tableX + CONTENT_W, y1)
  }

  const renderItemRow = (it: PrintData['items'][0]) => {
    let desc = receiptItemDisplayDescription(it)
    if (data.fiscal?.has_prepayment_emit) {
      desc = `${desc}\n*** Pago Anticipado ***`
    }
    const descLines = doc.splitTextToSize(desc, cols[3].w - 3)
    const h = rowH * Math.max(1, descLines.length)
    setFont(doc, FONT_SM, 'normal')
    const midY = rowY + rowH - 0.5
    doc.text(String(it.quantity), colX[0] + cols[0].w / 2, midY, { align: 'center' })
    doc.text((it.unit || 'NIU').slice(0, 8), colX[1] + cols[1].w / 2, midY, { align: 'center' })
    doc.text((it.code || '—').slice(0, 14), colX[2] + 1.5, midY, { maxWidth: cols[2].w - 2 })
    for (let i = 0; i < descLines.length; i++) {
      doc.text(descLines[i], colX[3] + 1.5, rowY + rowH - 0.5 + i * rowH, { maxWidth: cols[3].w - 3 })
    }
    const pu = receiptItemDisplayUnitPrice(it, formatPlainAmount)
    const tot = receiptItemDisplayTotal(it, formatPlainAmount)
    doc.text(pu, colX[4] + cols[4].w - 1.5, midY, { align: 'right' })
    doc.text(formatPlainAmount(itemLineDiscount(it)), colX[5] + cols[5].w - 1.5, midY, { align: 'right' })
    doc.text(tot, colX[6] + cols[6].w - 1.5, midY, { align: 'right' })
    rowY += h
  }

  for (const it of data.items) renderItemRow(it)

  const prepDeductions = data.fiscal?.prepayment_deductions ?? []
  for (const p of prepDeductions) {
    const desc = prepaymentDeductionDescription(p.related_doc_type, p.document_number)
    const descLines = doc.splitTextToSize(desc, cols[3].w - 3)
    const h = rowH * Math.max(1, descLines.length)
    setFont(doc, FONT_SM, 'normal')
    const midY = rowY + rowH - 0.5
    doc.text('1', colX[0] + cols[0].w / 2, midY, { align: 'center' })
    doc.text('NIU', colX[1] + cols[1].w / 2, midY, { align: 'center' })
    doc.text('—', colX[2] + 1.5, midY)
    for (let i = 0; i < descLines.length; i++) {
      doc.text(descLines[i], colX[3] + 1.5, rowY + rowH - 0.5 + i * rowH, { maxWidth: cols[3].w - 3 })
    }
    const neg = formatPlainAmount(-Math.abs(p.total))
    doc.text(neg, colX[4] + cols[4].w - 1.5, midY, { align: 'right' })
    doc.text('0.00', colX[5] + cols[5].w - 1.5, midY, { align: 'right' })
    doc.text(neg, colX[6] + cols[6].w - 1.5, midY, { align: 'right' })
    rowY += h
  }

  const filledRows = data.items.length + prepDeductions.length
  const emptyRows = Math.max(0, minBodyRows - filledRows)
  rowY += emptyRows * rowH

  doc.line(tableX, tableTop + headerH, tableX + CONTENT_W, tableTop + headerH)
  drawVerticalGrid(tableTop, bodyBottom)
  doc.line(tableX, bodyBottom, tableX + CONTENT_W, bodyBottom)

  ctx.y = bodyBottom + 5
  return bodyBottom
}

function drawTotalsRight(ctx: A4Ctx, data: PrintData, startY: number): number {
  const { doc } = ctx
  let y = startY
  const sym = moneySymbol(data.currency)
  const labelX = PAGE_W - MARGIN - 58
  const amountX = PAGE_W - MARGIN

  const drawRow = (label: string, amount: string, bold = false) => {
    setFont(doc, FONT, bold ? 'bold' : 'normal')
    doc.text(label, labelX, y, { maxWidth: 42 })
    doc.text(amount, amountX, y, { align: 'right' })
    y += LINE_H + 0.4
  }

  for (const row of buildReceiptTotalLines(data)) {
    const lbl = row.label.toUpperCase().replace(/:$/, '')
    const amountOnly = row.negative
      ? `- ${Math.abs(row.amount).toFixed(2)}`
      : Math.abs(row.amount).toFixed(2)
    drawRow(`${lbl}: ${sym}`, amountOnly, row.bold)
  }

  const f = data.fiscal
  if (f?.retention_applied) {
    drawRow('RET. IGV (3%):', formatPlainAmount(f.igv_retention_amount ?? 0))
    drawRow(`NETO A COBRAR: ${sym}`, formatPlainAmount(f.net_collectible ?? data.total), true)
  }
  if (f?.has_detraccion) {
    const pct = f.detraccion_rate_percent ?? 0
    drawRow(`DETRACCIÓN (${pct}%):`, formatPlainAmount(f.detraccion_amount ?? 0))
    if (f.detraccion_bank_account) {
      setFont(doc, FONT_XS)
      doc.text(`CTA. BN: ${f.detraccion_bank_account}`, labelX, y, { maxWidth: 58 })
      y += LINE_H
    }
    drawRow(`NETO A COBRAR: ${sym}`, formatPlainAmount(f.detraccion_net_payable ?? data.total), true)
  }
  if (f?.has_prepayment_emit) {
    drawRow('ANTICIPO:', f.prepayment_label ?? 'COMPROBANTE DE ANTICIPO', true)
  }

  return y + 2
}

function drawAmountInWords(ctx: A4Ctx, data: PrintData, startY: number): number {
  if (!data.legend_text?.trim()) return startY
  const { doc } = ctx
  setFont(doc, FONT, 'bold')
  const text = `SON: ${data.legend_text.trim().toUpperCase()}`
  const lines = doc.splitTextToSize(text, CONTENT_W * 0.55)
  let y = startY
  for (const line of lines) {
    doc.text(line, MARGIN, y, { maxWidth: CONTENT_W * 0.55 })
    y += LINE_H
  }
  return y + 1
}

type ElectronicRowResult = {
  /** Y para continuar el contenido de la columna izquierda (cuentas bancarias, etc.). */
  leftY: number
  /** Fondo del QR SUNAT (para enganchar debajo el QR de billetera Yape/Plin), o null si no hubo QR. */
  qrBottomY: number | null
  /** Página donde quedó dibujado el QR SUNAT. */
  qrPage: number
}

async function drawElectronicPaymentAndQrRow(
  ctx: A4Ctx,
  data: PrintData,
  startYs: { boxStartY: number; qrStartY: number },
): Promise<ElectronicRowResult> {
  const { doc } = ctx
  const { boxStartY, qrStartY } = startYs
  const leftW = CONTENT_W * 0.5
  const leftX = MARGIN
  const pad = 3

  type PayLine = { text: string; bold?: boolean; bullet?: boolean }
  const payLines: PayLine[] = []
  const cond = String(data.payment_condition ?? '').trim() || (data.payments.length > 0 ? 'Contado' : 'Contado')
  payLines.push({ text: `CONDICIÓN DE PAGO: ${cond}`, bold: true })
  payLines.push({ text: 'PAGOS:', bold: true })
  if (data.payments.length > 0) {
    for (const p of data.payments) {
      payLines.push({ text: salePaymentMethodLabelEs(p.method), bullet: true })
    }
  } else {
    payLines.push({ text: primaryPaymentLabel(data), bullet: true })
  }

  const boxH = pad * 2 + payLines.length * (LINE_H + 0.2) + 1
  doc.setLineWidth(0.25)
  doc.setDrawColor(0, 0, 0)
  doc.rect(leftX, boxStartY, leftW, boxH)

  let ly = boxStartY + pad + LINE_H - 0.3
  for (const line of payLines) {
    setFont(doc, FONT, line.bold ? 'bold' : 'normal')
    if (line.bullet) {
      doc.text('•', leftX + pad, ly)
      doc.text(line.text, leftX + pad + 3.5, ly, { maxWidth: leftW - pad * 2 - 4 })
    } else {
      doc.text(line.text, leftX + pad, ly, { maxWidth: leftW - pad * 2 })
    }
    ly += LINE_H + 0.2
  }

  const qrSize = 42
  const qrX = PAGE_W - MARGIN - qrSize
  let qrBottomY: number | null = null
  const qrPage = doc.getNumberOfPages()

  if (data.qr_data) {
    try {
      const qrUrl = await qrDataUrl(data.qr_data, qrSize)
      doc.addImage(qrUrl, 'PNG', qrX, qrStartY, qrSize, qrSize, undefined, 'NONE')
      qrBottomY = qrStartY + qrSize

      if (data.sunat_hash?.trim()) {
        setFont(doc, FONT_XS, 'normal')
        const hashLines = doc.splitTextToSize(`Código Hash: ${data.sunat_hash.trim()}`, qrSize + 6)
        let hy = qrStartY + qrSize + 2.5
        for (const hl of hashLines) {
          doc.text(hl, qrX + qrSize / 2, hy, { align: 'center', maxWidth: qrSize + 6 })
          hy += LINE_H - 0.3
        }
        qrBottomY = hy - (LINE_H - 0.3)
      }
    } catch {
      /* sin QR */
    }
  }

  // El contenido que sigue (cuentas bancarias, vendedor, términos) va en la columna
  // izquierda igual que la caja de pago, y no se cruza en X con el QR (columna derecha):
  // depende solo de dónde termina la caja, no de la altura del QR (42mm) — antes esperaba
  // el QR completo aunque la caja fuera mucho más corta, dejando un hueco grande sin usar.
  return { leftY: boxStartY + boxH + 5, qrBottomY, qrPage }
}

function drawPaymentMethodBox(ctx: A4Ctx, data: PrintData, startY: number): number {
  const { doc } = ctx
  let y = startY
  const method = primaryPaymentLabel(data)
  const padX = 3
  const padY = 2.5
  setFont(doc, FONT, 'bold')
  const labelPart = 'MÉTODO DE PAGO:'
  const labelW = doc.getTextWidth(`${labelPart} `)
  setFont(doc, FONT, 'normal')
  const methodW = doc.getTextWidth(` ${method}`)
  const boxW = labelW + methodW + padX * 2
  const boxH = LINE_H + padY * 2
  const boxX = MARGIN
  const boxY = y - LINE_H + 1

  drawDottedRect(doc, boxX, boxY, boxW, boxH)
  setFont(doc, FONT, 'bold')
  doc.text(labelPart, boxX + padX, y)
  setFont(doc, FONT, 'normal')
  doc.text(` ${method}`, boxX + padX + labelW, y)

  return boxY + boxH + 5
}

function installmentStatusLabel(status?: string): string {
  switch (status) {
    case 'paid':
      return 'Pagada'
    case 'partial':
      return 'Parcial'
    case 'overdue':
      return 'Vencida'
    default:
      return 'Pendiente'
  }
}

/**
 * Cuotas de una venta a crédito, justo debajo de la condición/método de pago (misma columna
 * izquierda, no se cruza con el QR SUNAT que va a la derecha). Se muestra siempre que haya
 * cuotas, independiente de `showPaymentCondition` (Nota de Venta): es información propia de
 * la venta, no una preferencia de qué tan detallado se ve el método de pago.
 */
function drawCreditInstallmentsTable(ctx: A4Ctx, data: PrintData, startY: number): number {
  const rows = data.credit_installments ?? []
  if (rows.length === 0) return startY
  const { doc } = ctx
  const tableX = MARGIN

  const cols: TableCol[] = [
    { label: 'N°', w: 12, align: 'center' },
    { label: 'VENCIMIENTO', w: 32, align: 'center' },
    { label: 'MONTO', w: 30, align: 'right' },
    { label: 'ESTADO', w: 26, align: 'center' },
  ]
  const tableW = cols.reduce((s, c) => s + c.w, 0)
  const colX: number[] = []
  let cx = tableX
  for (const c of cols) {
    colX.push(cx)
    cx += c.w
  }
  const rowH = LINE_H + 0.6

  let y = startY
  setFont(doc, FONT, 'bold')
  doc.text('CUOTAS:', tableX, y)
  y += LINE_H + 1

  const tableTop = y
  const headerH = rowH + 0.6
  doc.setFillColor(...GRAY)
  doc.rect(tableX, tableTop, tableW, headerH, 'F')
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.2)
  doc.rect(tableX, tableTop, tableW, headerH)

  setFont(doc, FONT_XS, 'bold')
  const hy = tableTop + rowH
  cols.forEach((c, i) => {
    const tx = c.align === 'right' ? colX[i] + c.w - 1.5 : c.align === 'center' ? colX[i] + c.w / 2 : colX[i] + 1.5
    doc.text(c.label, tx, hy, { align: c.align ?? 'left', maxWidth: c.w - 2 })
    if (i > 0) doc.line(colX[i], tableTop, colX[i], tableTop + headerH)
  })
  doc.line(tableX + tableW, tableTop, tableX + tableW, tableTop + headerH)

  let rowY = tableTop + headerH
  setFont(doc, FONT_XS, 'normal')
  for (const inst of rows) {
    const midY = rowY + rowH - 0.5
    doc.text(String(inst.installment_no), colX[0] + cols[0].w / 2, midY, { align: 'center' })
    doc.text(formatDisplayDate(inst.due_date), colX[1] + cols[1].w / 2, midY, { align: 'center' })
    doc.text(
      `${moneySymbol(inst.currency || data.currency)} ${formatPlainAmount(inst.amount)}`,
      colX[2] + cols[2].w - 1.5,
      midY,
      { align: 'right' },
    )
    doc.text(installmentStatusLabel(inst.status), colX[3] + cols[3].w / 2, midY, { align: 'center' })
    rowY += rowH
  }
  const bodyBottom = rowY

  for (let i = 1; i < cols.length; i++) doc.line(colX[i], tableTop + headerH, colX[i], bodyBottom)
  doc.line(tableX, tableTop + headerH, tableX, bodyBottom)
  doc.line(tableX + tableW, tableTop + headerH, tableX + tableW, bodyBottom)
  doc.line(tableX, bodyBottom, tableX + tableW, bodyBottom)

  return bodyBottom + 4
}

function drawBankAccounts(ctx: A4Ctx, data: PrintData, startY: number): number {
  const { doc } = ctx
  const banks = data.bank_accounts ?? []
  const wallet = data.payment_wallet
  const lines: string[] = []
  for (const b of banks) {
    const line = formatBankAccountLine(b)
    if (line) lines.push(line)
  }
  if (wallet?.provider && wallet.phone && !paymentWalletVisible(data, 'a4')) {
    const wLine = formatWalletAccountLine(wallet.provider, wallet.phone)
    if (wLine) lines.push(wLine)
  }
  if (lines.length === 0) return startY

  let y = startY
  setFont(doc, FONT, 'bold')
  doc.text('CUENTAS BANCARIAS:', MARGIN, y)
  y += LINE_H + 1

  setFont(doc, FONT_SM, 'normal')
  doc.setTextColor(0, 0, 0)
  for (const line of lines) {
    doc.text(line, MARGIN, y, { maxWidth: CONTENT_W * 0.72 })
    y += LINE_H
  }

  return y + 2
}

function drawSeller(ctx: A4Ctx, data: PrintData, startY: number): number {
  if (!data.seller_name?.trim()) return startY
  const { doc } = ctx
  let y = startY
  setFont(doc, FONT, 'bold')
  doc.text('Vendedor:', MARGIN, y)
  y += LINE_H
  setFont(doc, FONT, 'normal')
  doc.text(data.seller_name.trim(), MARGIN, y)
  return y + LINE_H + 3
}

/**
 * Dibuja una línea en `y`, saltando a una página nueva ANTES si no entra completa en lo
 * que queda de la página actual (deja MARGIN de aire abajo). Devuelve el `y` ya avanzado
 * para la siguiente línea. Usa todo el espacio disponible de la página actual antes de
 * saltar — a diferencia de "medir todo el bloque y decidir de una si cabe o no", que
 * dejaba la página 1 a medio llenar cuando el bloque completo no cabía.
 */
function drawLineWithPageBreak(ctx: A4Ctx, y: number, line: string): number {
  const { doc } = ctx
  let cursorY = y
  if (cursorY + LINE_H > PAGE_H - MARGIN) {
    doc.addPage()
    cursorY = MARGIN
  }
  doc.text(line, MARGIN, cursorY)
  return cursorY + LINE_H
}

/** Dibuja legenda ("Son: ..."), términos y condiciones, y observaciones, con salto de
 * página automático línea por línea si el texto (configurable por el negocio, puede ser
 * largo) no entra completo en lo que queda de la página. Nunca se oculta ni se recorta. */
function drawLegendAndNotes(ctx: A4Ctx, data: PrintData, startY: number, skipLegend = false): number {
  const { doc } = ctx
  let y = startY

  if (data.legend_text && !skipLegend) {
    setFont(doc, FONT_SM)
    for (const line of doc.splitTextToSize(`Son: ${data.legend_text}`, CONTENT_W * 0.65)) {
      y = drawLineWithPageBreak(ctx, y, line)
    }
    y += 2
  }
  if (data.fiscal?.show_terms_conditions && data.fiscal.terms_text?.trim()) {
    setFont(doc, FONT_SM, 'bold')
    y = drawLineWithPageBreak(ctx, y, 'Términos y condiciones:')
    setFont(doc, FONT_SM)
    for (const line of doc.splitTextToSize(data.fiscal.terms_text.trim(), CONTENT_W * 0.65)) {
      y = drawLineWithPageBreak(ctx, y, line)
    }
    y += 2
  }
  if (data.notes?.trim() && data.notes.trim() !== data.fiscal?.fiscal_observations?.trim()) {
    setFont(doc, FONT_SM, 'bold')
    y = drawLineWithPageBreak(ctx, y, 'Observaciones:')
    setFont(doc, FONT_SM)
    for (const line of doc.splitTextToSize(data.notes.trim(), CONTENT_W * 0.65)) {
      y = drawLineWithPageBreak(ctx, y, line)
    }
    y += 2
  }
  return y
}

/** Alto del bloque de pie (GRACIAS → Tukifac → URL → notas), sin margen inferior. */
function estimateA4FooterContentHeight(data: PrintData): number {
  let h = LINE_H + 1.2 // GRACIAS
  h += LINE_H + 0.8 // Tukifac!
  h += LINE_H + 0.5 // Comprobante emitido a través de…
  if (isElectronicSunatCode(data.sunat_code)) {
    h += LINE_H - 0.2 + LINE_H
  } else if (data.sunat_code === 'QT') {
    h += LINE_H
  }
  if (data.company.website?.trim()) {
    h += LINE_H * 0.95
  }
  return h
}

async function drawFooter(ctx: A4Ctx, data: PrintData, minY: number, opts?: { bottomAnchor?: boolean }) {
  const { doc } = ctx
  const consultBase = data.company.website?.trim()
  const showElectronic = isElectronicSunatCode(data.sunat_code)
  const showQtNote = data.sunat_code === 'QT'
  // bottomAnchor=false en página de continuación (términos/observaciones largos que ya
  // saltaron de página): forzar el pie al fondo ahí dejaba un hueco enorme entre el fin
  // del texto y el pie. Con false, el pie va justo debajo del contenido.
  const bottomAnchor = opts?.bottomAnchor !== false

  const contentH = estimateA4FooterContentHeight(data)
  const maxStart = PAGE_H - FOOTER_BOTTOM_MARGIN - contentH
  const afterContent = minY + 6
  let y: number
  if (afterContent + contentH > PAGE_H - FOOTER_BOTTOM_MARGIN) {
    // El pie ni siquiera cabe pegado al contenido en esta página: página nueva para él
    // (una hoja en blanco siempre tiene de sobra para ~15-28mm de pie).
    doc.addPage()
    y = MARGIN
  } else if (bottomAnchor && afterContent <= maxStart) {
    y = maxStart // contenido corto en la página normal: pie al fondo (look habitual)
  } else {
    // No corresponde anclar al fondo (página de continuación) o no cabe con margen ideal:
    // pegar el pie justo debajo del contenido. Nunca usar maxStart aquí sin más — retroceder
    // encima de texto ya dibujado (términos, QR, etc.) es lo que causaba el overlap original.
    y = afterContent
  }

  setFont(doc, FONT, 'normal')
  doc.setTextColor(0, 0, 0)
  doc.text('GRACIAS POR SU PREFERENCIA', PAGE_W / 2, y, { align: 'center' })
  y += LINE_H + 1.2

  setFont(doc, FONT_LG, 'bold')
  doc.text('Tukifac!', PAGE_W / 2, y, { align: 'center' })
  y += LINE_H + 0.8

  const webDisplay = normalizeWebDisplay(data.company.website)
  const prefix = 'Comprobante emitido a través de '
  setFont(doc, FONT_SM, 'normal')
  const totalLineW = doc.getTextWidth(prefix + webDisplay)
  const lineStart = PAGE_W / 2 - totalLineW / 2
  doc.setTextColor(0, 0, 0)
  doc.text(prefix, lineStart, y)
  const urlX = lineStart + doc.getTextWidth(prefix)
  doc.setTextColor(...GREEN)
  doc.text(webDisplay, urlX, y)
  doc.setDrawColor(...GREEN)
  doc.setLineWidth(0.15)
  doc.line(urlX, y + 0.6, urlX + doc.getTextWidth(webDisplay), y + 0.6)
  doc.setTextColor(0, 0, 0)
  y += LINE_H

  if (showElectronic) {
    setFont(doc, FONT_XS)
    doc.text('Representación impresa del comprobante electrónico', PAGE_W / 2, y, { align: 'center' })
    y += LINE_H - 0.2
    doc.text('Consulte su comprobante en sunat.gob.pe', PAGE_W / 2, y, { align: 'center' })
    y += LINE_H
  } else if (showQtNote) {
    setFont(doc, FONT_XS)
    doc.text('Documento comercial — no válido como comprobante de pago SUNAT', PAGE_W / 2, y, {
      align: 'center',
      maxWidth: CONTENT_W,
    })
    y += LINE_H
  }

  if (consultBase) {
    setFont(doc, 6.5, 'normal')
    const url = consultBase.startsWith('http')
      ? consultBase.replace(/\/+$/, '')
      : `https://${consultBase.replace(/\/+$/, '')}`
    doc.text(`Para consultar el comprobante ingresar a ${url}/buscar`, PAGE_W / 2, y, {
      align: 'center',
      maxWidth: CONTENT_W - 10,
    })
    y += LINE_H * 0.95
  }

  ctx.y = y
}

export async function renderReceiptA4(doc: jsPDF, data: PrintData): Promise<void> {
  const ctx: A4Ctx = { doc, y: MARGIN }
  const nvLayout = getNotaVentaPrintLayout(data.sunat_code)
  const showPaymentCondition = !nvLayout || nvLayout.showPaymentCondition

  await drawHeader(ctx, data, nvLayout)
  drawCustomerBlock(ctx, data, nvLayout)
  drawItemsTable(ctx, data)

  const sectionY = ctx.y
  const isElectronic = isElectronicSunatCode(data.sunat_code)
  const rightEndY = drawTotalsRight(ctx, data, sectionY)

  let leftY: number
  let sunatQrBottomY: number | null = null
  let sunatQrPage: number | null = null
  if (showPaymentCondition) {
    if (isElectronic) {
      const legendEndY = drawAmountInWords(ctx, data, sectionY)
      // El QR debe esperar a que termine la columna de totales (misma franja X a la
      // derecha) para no solaparse — posición idéntica a antes, no se toca.
      const qrStartY = Math.max(rightEndY, legendEndY) + 3
      // La caja "CONDICIÓN DE PAGO" va en la columna izquierda (no se cruza con los
      // totales en X): no necesita esperarlos, solo el "SON: ..." que tiene encima.
      const boxStartY = legendEndY + 2
      const row = await drawElectronicPaymentAndQrRow(ctx, data, { boxStartY, qrStartY })
      leftY = row.leftY
      sunatQrBottomY = row.qrBottomY
      sunatQrPage = row.qrPage
    } else {
      leftY = drawPaymentMethodBox(ctx, data, sectionY)
    }
  } else {
    leftY = sectionY
  }
  // Cuotas de venta a crédito, justo debajo de la condición/método de pago.
  leftY = drawCreditInstallmentsTable(ctx, data, leftY)
  // Las cuentas bancarias no dependen de este ajuste: se eligen en Empresa → Comprobantes.
  leftY = drawBankAccounts(ctx, data, leftY)
  leftY = drawSeller(ctx, data, leftY)

  // Términos y condiciones/observaciones pueden ser un texto largo configurado por el
  // negocio: drawLegendAndNotes usa TODO el espacio que quede en esta página y solo salta
  // a una nueva si hace falta (línea por línea, nunca recorta ni oculta el texto).
  const pagesBeforeLegend = doc.getNumberOfPages()
  leftY = drawLegendAndNotes(ctx, data, leftY, isElectronic)
  const pageBroke = doc.getNumberOfPages() > pagesBeforeLegend

  // Si hubo salto de página, rightEndY (totales de la página 1) ya no aplica — el pie va
  // en la página donde terminó el texto, y sin anclar al fondo (evita el hueco enorme
  // entre el fin del texto y el pie en una página de continuación).
  const footerMinY = pageBroke ? leftY : Math.max(leftY, rightEndY)
  await drawFooter(ctx, data, footerMinY, { bottomAnchor: !pageBroke })

  // QR de pago (Yape/Plin): si hay QR del comprobante (boleta/factura), va pegado justo
  // debajo de ese QR, en su misma columna/página — así ambos QR quedan juntos en vez de
  // que el de la billetera aparezca solo al fondo de la página (o en la página de
  // continuación si los términos saltaron de página). Para nota de venta (sin QR SUNAT)
  // se mantiene el pie de página como antes.
  if (paymentWalletVisible(data, 'a4')) {
    if (sunatQrBottomY != null && sunatQrPage != null) {
      const currentPage = doc.getNumberOfPages()
      if (sunatQrPage !== currentPage) doc.setPage(sunatQrPage)
      await renderPaymentWalletBlock(doc, data, 'a4', sunatQrBottomY + 6, PAGE_W, MARGIN, 'right')
      if (sunatQrPage !== currentPage) doc.setPage(currentPage)
    } else {
      const walletBlockH = 42
      await renderPaymentWalletBlock(
        doc,
        data,
        'a4',
        PAGE_H - FOOTER_BOTTOM_MARGIN - walletBlockH,
        PAGE_W,
        MARGIN,
        'right',
      )
    }
  }
}
