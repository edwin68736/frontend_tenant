import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import type { PrintData, PrintBankAccount } from '@/types/printData'
import { getTipoComprobanteLabel, getTipoDocIdentidadShortLabel, isElectronicSunatCode } from '@/constants/sunat'
import { buildReceiptTotalLines } from '@/utils/receiptTotals'
import { lineGlobalSubtotalDiscount, lineSubtotalDiscount } from '@/utils/receiptDiscount'
import { trimCompanyAdditionalNotes } from '@/utils/receiptCompanyNotes'
import { getPrintIssuerAddress } from '@/utils/printIssuer'
import { fitReceiptLogoMm, resolveReceiptLogoForPdf } from '@/utils/receiptLogoPdf'
import { rasterPxForMm } from '@/utils/receiptPdfRaster'
import { paymentWalletVisible, renderPaymentWalletBlock } from '@/utils/receiptPaymentWallet'
import { salePaymentMethodLabelEs } from '@/utils/paymentMethodLabels'

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

function a4DocTypeTitle(code: string): string {
  const map: Record<string, string> = {
    '00': 'NOTA DE VENTA',
    '01': 'FACTURA ELECTRÓNICA',
    '03': 'BOLETA DE VENTA ELECTRÓNICA',
    '07': 'NOTA DE CRÉDITO',
    '08': 'NOTA DE DÉBITO',
    QT: 'COTIZACIÓN',
  }
  if (map[code]) return map[code]
  return getTipoComprobanteLabel(code).toUpperCase()
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

function currencyLabel(code?: string): string {
  const c = String(code ?? 'PEN').toUpperCase()
  if (c === 'USD') return 'Dólares'
  return 'Soles'
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

async function drawHeader(ctx: A4Ctx, data: PrintData) {
  const { doc } = ctx
  const top = MARGIN
  const logoMaxW = 36
  const logoMaxH = 22
  const boxW = 62
  const boxX = PAGE_W - MARGIN - boxW
  const infoX = MARGIN + logoMaxW + 4
  const infoW = boxX - infoX - 4

  if (data.company.logo_url) {
    try {
      const logo = await resolveReceiptLogoForPdf(data.company.logo_url)
      if (logo) {
        const { w, h } = fitReceiptLogoMm(logo.naturalW, logo.naturalH, logoMaxW, logoMaxH)
        doc.addImage(logo.dataUrl, logo.format, MARGIN, top, w, h, undefined, 'NONE')
      }
    } catch {
      /* sin logo */
    }
  }

  const companyName = (data.company.business_name || data.company.trade_name || '—').toUpperCase()
  setFont(doc, FONT_TITLE, 'bold')
  let cy = top + 3
  for (const line of doc.splitTextToSize(companyName, infoW)) {
    doc.text(line, infoX, cy, { maxWidth: infoW })
    cy += LINE_H + 0.2
  }

  setFont(doc, FONT_SM, 'normal')
  const pushInfoLine = (text: string, uppercase = false) => {
    const raw = uppercase ? text.toUpperCase() : text
    for (const wl of doc.splitTextToSize(raw, infoW)) {
      doc.text(wl, infoX, cy, { maxWidth: infoW })
      cy += LINE_H - 0.15
    }
  }

  pushInfoLine(`RUC ${data.company.ruc}`)
  const addr = getPrintIssuerAddress(data)
  if (addr) pushInfoLine(addr)
  pushInfoLine(`Central telefónica: ${data.company.phone?.trim() || ''}`)
  pushInfoLine(`Email: ${data.company.email?.trim() || ''}`)

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
  drawDottedRect(doc, boxX, top, boxW, boxH)

  setFont(doc, FONT, 'bold')
  doc.text('RUC:', boxX + 4, top + 5.5)
  doc.text(data.company.ruc, boxX + 16, top + 5.5)

  const barY = top + 9
  const barH = 9
  doc.setFillColor(...GRAY)
  doc.rect(boxX, barY, boxW, barH, 'F')
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.2)
  doc.line(boxX, barY, boxX + boxW, barY)
  doc.line(boxX, barY + barH, boxX + boxW, barY + barH)
  setFont(doc, FONT, 'bold')
  doc.text(a4DocTypeTitle(data.sunat_code), boxX + boxW / 2, barY + 6, { align: 'center' })

  setFont(doc, FONT_LG, 'bold')
  doc.text(formatDocNumber(data), boxX + boxW / 2, top + 30, { align: 'center' })

  ctx.y = Math.max(cy, top + boxH) + 8
}

function drawCustomerBlock(ctx: A4Ctx, data: PrintData) {
  const { doc } = ctx
  const leftX = MARGIN
  const due = resolveDueDate(data)

  drawA4Field(ctx, 'FECHA DE EMISIÓN', formatDisplayDate(data.issue_date), leftX)
  ctx.y += LINE_H
  drawA4Field(ctx, 'FECHA DE VENCIMIENTO', due, leftX)
  ctx.y += LINE_H

  if (data.client) {
    drawA4Field(ctx, 'CLIENTE', data.client.business_name, leftX)
    ctx.y += LINE_H
    const docLabel = getTipoDocIdentidadShortLabel(data.client.doc_type).toUpperCase()
    drawA4Field(ctx, docLabel, data.client.doc_number || '—', leftX, { valueMaxW: CONTENT_W * 0.45 })
    setFont(doc, FONT, 'normal')
    doc.text('Fecha Vencimiento:', PAGE_W - MARGIN - 38, ctx.y)
    doc.text(due, PAGE_W - MARGIN - 38 + 28, ctx.y)
    ctx.y += LINE_H
    drawA4Field(ctx, 'DIRECCIÓN', data.client.address?.trim() || '—', leftX)
    ctx.y += LINE_H
  } else {
    drawA4Field(ctx, 'CLIENTE', 'CLIENTE VARIOS', leftX)
    ctx.y += LINE_H
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
    { label: 'CÓDIGO', w: 19, align: 'left' },
    { label: 'DESCRIPCIÓN', w: 72, align: 'left' },
    { label: 'P.UNIT', w: 19, align: 'right' },
    { label: 'DTO.', w: 15, align: 'right' },
    { label: 'TOTAL', w: 29, align: 'right' },
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
    const desc = (it.description || '').trim() || '—'
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
    doc.text(formatPlainAmount(it.unit_price), colX[4] + cols[4].w - 1.5, midY, { align: 'right' })
    doc.text(formatPlainAmount(itemLineDiscount(it)), colX[5] + cols[5].w - 1.5, midY, { align: 'right' })
    doc.text(formatPlainAmount(it.total), colX[6] + cols[6].w - 1.5, midY, { align: 'right' })
    rowY += h
  }

  for (const it of data.items) renderItemRow(it)

  const emptyRows = Math.max(0, minBodyRows - data.items.length)
  rowY += emptyRows * rowH

  doc.line(tableX, tableTop + headerH, tableX + CONTENT_W, tableTop + headerH)
  drawVerticalGrid(tableTop, bodyBottom)
  doc.line(tableX, bodyBottom, tableX + CONTENT_W, bodyBottom)

  doc.setLineDashPattern([1, 1], 0)
  doc.line(tableX, bodyBottom, tableX + CONTENT_W, bodyBottom)
  doc.setLineDashPattern([], 0)

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

async function drawElectronicPaymentAndQrRow(ctx: A4Ctx, data: PrintData, startY: number): Promise<number> {
  const { doc } = ctx
  const rowY = startY
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
  doc.rect(leftX, rowY, leftW, boxH)

  let ly = rowY + pad + LINE_H - 0.3
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

  let blockH = boxH
  const qrSize = 42
  const qrX = PAGE_W - MARGIN - qrSize

  if (data.qr_data) {
    try {
      const qrUrl = await qrDataUrl(data.qr_data, qrSize)
      doc.addImage(qrUrl, 'PNG', qrX, rowY, qrSize, qrSize, undefined, 'NONE')
      blockH = Math.max(blockH, qrSize)

      if (data.sunat_hash?.trim()) {
        setFont(doc, FONT_XS, 'normal')
        const hashLines = doc.splitTextToSize(`Código Hash: ${data.sunat_hash.trim()}`, qrSize + 6)
        let hy = rowY + qrSize + 2.5
        for (const hl of hashLines) {
          doc.text(hl, qrX + qrSize / 2, hy, { align: 'center', maxWidth: qrSize + 6 })
          hy += LINE_H - 0.3
        }
        blockH = Math.max(blockH, hy - rowY)
      }
    } catch {
      /* sin QR */
    }
  }

  return rowY + blockH + 5
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

type BankKind = 'bcp' | 'interbank' | 'yape' | 'plin' | 'other'

function detectBankKind(bankName: string, accountName?: string): BankKind {
  const t = `${bankName} ${accountName ?? ''}`.toLowerCase()
  if (t.includes('bcp') || t.includes('credito del peru') || t.includes('crédito del peru')) return 'bcp'
  if (t.includes('interbank')) return 'interbank'
  if (t.includes('yape')) return 'yape'
  if (t.includes('plin')) return 'plin'
  return 'other'
}

function drawBankBadge(doc: jsPDF, kind: BankKind, x: number, y: number) {
  const badgeW = 10
  const badgeH = 5.5
  const by = y - 4
  if (kind === 'bcp') {
    doc.setFillColor(0, 56, 130)
    doc.rect(x, by, badgeW, badgeH, 'F')
    doc.setTextColor(255, 255, 255)
    setFont(doc, 5.5, 'bold')
    doc.text('BCP', x + badgeW / 2, by + 3.8, { align: 'center' })
  } else if (kind === 'interbank') {
    doc.setFillColor(0, 158, 73)
    doc.rect(x, by, badgeW, badgeH, 'F')
    doc.setTextColor(255, 255, 255)
    setFont(doc, 4.8, 'bold')
    doc.text('IBK', x + badgeW / 2, by + 3.8, { align: 'center' })
  } else if (kind === 'yape') {
    doc.setFillColor(114, 39, 150)
    doc.rect(x, by, badgeW, badgeH, 'F')
    doc.setTextColor(255, 255, 255)
    setFont(doc, 5, 'bold')
    doc.text('YAPE', x + badgeW / 2, by + 3.8, { align: 'center' })
  } else if (kind === 'plin') {
    doc.setFillColor(0, 174, 239)
    doc.rect(x, by, badgeW, badgeH, 'F')
    doc.setTextColor(255, 255, 255)
    setFont(doc, 5, 'bold')
    doc.text('PLIN', x + badgeW / 2, by + 3.8, { align: 'center' })
  } else {
    doc.setFillColor(180, 180, 180)
    doc.rect(x, by, badgeW, badgeH, 'F')
    doc.setTextColor(255, 255, 255)
    setFont(doc, 5, 'bold')
    doc.text('BAN', x + badgeW / 2, by + 3.8, { align: 'center' })
  }
  doc.setTextColor(0, 0, 0)
}

function parseCciFromAccount(b: PrintBankAccount): string | null {
  const raw = `${b.name ?? ''} ${b.account_number ?? ''}`
  const m = raw.match(/CCI[:\s]*(\d[\d\s-]{10,})/i)
  return m ? m[1].replace(/\s+/g, '') : null
}

function accountNumberOnly(b: PrintBankAccount): string {
  const num = String(b.account_number ?? '').trim()
  const cciMatch = num.match(/^(.*?)(?:\s*[,;]?\s*CCI[:\s]*\d+)/i)
  if (cciMatch) return cciMatch[1].trim()
  return num
}

function drawBankAccounts(ctx: A4Ctx, data: PrintData, startY: number): number {
  const { doc } = ctx
  const banks = data.bank_accounts ?? []
  const wallet = data.payment_wallet
  if (banks.length === 0 && !wallet?.phone) return startY

  let y = startY
  setFont(doc, FONT, 'bold')
  doc.text('CUENTAS BANCARIAS:', MARGIN, y)
  y += LINE_H + 2

  const textX = MARGIN + 12
  const textW = CONTENT_W * 0.62

  for (const b of banks) {
    const kind = detectBankKind(b.bank_name, b.name)
    drawBankBadge(doc, kind, MARGIN, y)
    const bankTitle = (b.bank_name || b.name || 'CUENTA').toUpperCase()
    const acct = accountNumberOnly(b)
    setFont(doc, FONT_SM, 'bold')
    const titlePart = `${bankTitle} `
    doc.text(titlePart, textX, y, { maxWidth: textW })
    if (acct) {
      setFont(doc, FONT_SM, 'normal')
      const titleW = doc.getTextWidth(titlePart)
      doc.text(`${currencyLabel(b.currency)} Nº: ${acct}`, textX + titleW, y, { maxWidth: textW - titleW })
    }
    y += LINE_H
    const cci = parseCciFromAccount(b)
    if (cci) {
      setFont(doc, FONT_SM, 'normal')
      doc.text(`CCI: ${cci}`, textX, y, { maxWidth: textW })
      y += LINE_H
    }
    y += 1.5
  }

  if (wallet?.provider && wallet.phone && !paymentWalletVisible(data, 'a4')) {
    const kind = detectBankKind(wallet.provider)
    drawBankBadge(doc, kind, MARGIN, y)
    const label = walletProviderBankLabel(wallet.provider)
    setFont(doc, FONT_SM, 'bold')
    const titlePart = `${label} `
    doc.text(titlePart, textX, y)
    setFont(doc, FONT_SM, 'normal')
    doc.text(`Soles Nº: ${wallet.phone}`, textX + doc.getTextWidth(titlePart), y)
    y += LINE_H + 2
  }

  return y + 2
}

function walletProviderBankLabel(provider: string): string {
  const p = provider.trim().toLowerCase()
  if (p === 'yape') return 'YAPE'
  if (p === 'plin') return 'PLIN'
  return provider.toUpperCase()
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

function drawLegendAndNotes(ctx: A4Ctx, data: PrintData, startY: number, skipLegend = false): number {
  const { doc } = ctx
  let y = startY
  if (data.legend_text && !skipLegend) {
    setFont(doc, FONT_SM)
    for (const line of doc.splitTextToSize(`Son: ${data.legend_text}`, CONTENT_W * 0.65)) {
      doc.text(line, MARGIN, y)
      y += LINE_H
    }
    y += 2
  }
  if (data.fiscal?.show_terms_conditions && data.fiscal.terms_text?.trim()) {
    setFont(doc, FONT_SM, 'bold')
    doc.text('Términos y condiciones:', MARGIN, y)
    y += LINE_H
    setFont(doc, FONT_SM)
    for (const line of doc.splitTextToSize(data.fiscal.terms_text.trim(), CONTENT_W * 0.65)) {
      doc.text(line, MARGIN, y)
      y += LINE_H
    }
    y += 2
  }
  if (data.notes?.trim() && data.notes.trim() !== data.fiscal?.fiscal_observations?.trim()) {
    setFont(doc, FONT_SM, 'bold')
    doc.text('Observaciones:', MARGIN, y)
    y += LINE_H
    setFont(doc, FONT_SM)
    for (const line of doc.splitTextToSize(data.notes.trim(), CONTENT_W * 0.65)) {
      doc.text(line, MARGIN, y)
      y += LINE_H
    }
    y += 2
  }
  return y
}

async function drawFooter(ctx: A4Ctx, data: PrintData, minY: number) {
  const { doc } = ctx
  const consultBase = data.company.website?.trim()
  const showElectronic = isElectronicSunatCode(data.sunat_code)
  const showQtNote = data.sunat_code === 'QT'

  let y = PAGE_H - FOOTER_BOTTOM_MARGIN

  if (consultBase) {
    setFont(doc, 6.5, 'normal')
    const url = consultBase.startsWith('http') ? consultBase.replace(/\/+$/, '') : `https://${consultBase.replace(/\/+$/, '')}`
    doc.text(`Para consultar el comprobante ingresar a ${url}/buscar`, PAGE_W / 2, y, {
      align: 'center',
      maxWidth: CONTENT_W - 10,
    })
    y -= LINE_H * 0.95
  }

  if (showElectronic) {
    setFont(doc, FONT_XS)
    doc.text('Consulte su comprobante en sunat.gob.pe', PAGE_W / 2, y, { align: 'center' })
    y -= LINE_H - 0.2
    doc.text('Representación impresa del comprobante electrónico', PAGE_W / 2, y, { align: 'center' })
    y -= LINE_H
  } else if (showQtNote) {
    setFont(doc, FONT_XS)
    doc.text('Documento comercial — no válido como comprobante de pago SUNAT', PAGE_W / 2, y, {
      align: 'center',
      maxWidth: CONTENT_W,
    })
    y -= LINE_H
  }

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
  y -= LINE_H + 0.8

  setFont(doc, FONT_LG, 'bold')
  doc.text('Tukifac!', PAGE_W / 2, y, { align: 'center' })
  y -= LINE_H + 1.2

  setFont(doc, FONT, 'normal')
  doc.text('GRACIAS POR SU PREFERENCIA', PAGE_W / 2, y, { align: 'center' })

  void minY
  ctx.y = PAGE_H - FOOTER_BOTTOM_MARGIN
}

export async function renderReceiptA4(doc: jsPDF, data: PrintData): Promise<void> {
  const ctx: A4Ctx = { doc, y: MARGIN }

  await drawHeader(ctx, data)
  drawCustomerBlock(ctx, data)
  drawItemsTable(ctx, data)

  const sectionY = ctx.y
  const isElectronic = isElectronicSunatCode(data.sunat_code)
  const rightEndY = drawTotalsRight(ctx, data, sectionY)

  let leftY: number
  if (isElectronic) {
    const legendEndY = drawAmountInWords(ctx, data, sectionY)
    const blockStartY = Math.max(rightEndY, legendEndY) + 3
    leftY = await drawElectronicPaymentAndQrRow(ctx, data, blockStartY)
  } else {
    leftY = drawPaymentMethodBox(ctx, data, sectionY)
  }

  leftY = drawBankAccounts(ctx, data, leftY)
  leftY = drawSeller(ctx, data, leftY)
  leftY = drawLegendAndNotes(ctx, data, leftY, isElectronic)

  if (paymentWalletVisible(data, 'a4')) {
    leftY = await renderPaymentWalletBlock(doc, data, 'a4', leftY, PAGE_W, MARGIN)
    leftY += 3
  }

  await drawFooter(ctx, data, Math.max(leftY, rightEndY))
}
