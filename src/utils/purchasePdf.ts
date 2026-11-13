import { jsPDF } from 'jspdf'
import { getCompanyConfigCache } from '@/lib/companyConfig/store'
import { loadBranchPrintIdentity } from '@/lib/branchIdentity/store'
import { fitReceiptLogoMm, resolveReceiptLogoForPdf } from '@/utils/receiptLogoPdf'
import { readLogoPrintSize, scaleLogoDimension } from '@/services/printers/logoPrintSize'
import { downloadJsPdf } from '@/utils/downloadBlob'
import { openPdfViewer } from '@/components/pdf/pdfViewerStore'
import { TUKIFAC_APP_NAME } from '@/lib/appVersion'
import {
  configuredTicketPaperMm,
  normalizeTicketPaperWidth,
  ticketMarginMm,
  ticketPageWidthMm,
  ticketTopPaddingMm,
  type TicketPaperWidthMm,
} from '@/utils/receiptTicketPaper'
import { contactsService } from '@/services/contacts.service'
import { formatTipoDocIdentidadDisplay } from '@/constants/sunat'
import { formatPaymentMethodLabel } from '@/utils/paymentMethodLabel'
import type { Purchase, PurchaseDetail, PurchaseItem } from '@/services/purchases.service'

/**
 * PDF de una compra (A4 y ticket). Es un documento de CONTROL INTERNO del comprobante del proveedor (no es un
 * comprobante emitido por la empresa), por eso muestra los datos que se digitaron: tipo, serie y número del
 * proveedor, fecha, moneda/TC, forma de pago, ítems y totales. La cabecera lleva el logo y los datos de la sucursal
 * de la compra (con respaldo a los de la empresa) y la razón social del tenant. Se arma en el navegador con jsPDF,
 * igual que la orden de compra y la transferencia de stock.
 */

export type PurchasePdfFormat = 'a4' | 'ticket'

export interface PurchasePdfSupplier {
  name: string
  docLabel?: string
  address?: string
  phone?: string
  email?: string
}

export interface PurchasePdfLine {
  code?: string
  description: string
  /** Unidad comercial a mostrar (p. ej. «Saco 100 KG» o «NIU»). */
  unitLabel: string
  quantity: number
  unitCost: number
  total: number
  serials?: string[]
}

export interface PurchasePdfInput {
  purchase: Purchase
  lines: PurchasePdfLine[]
  supplier: PurchasePdfSupplier
  /** «Crédito», «Efectivo», «Mixto (…)». */
  paymentLabel: string
  /** Vista previa desde el formulario (aún no registrada): se marca como tal en el documento. */
  preview?: boolean
}

/** Compra sin método de pago = a crédito (queda como cuenta por pagar). */
export const purchasePaymentLabel = (code?: string, upfront?: { method: string }[]): string =>
  upfront && upfront.length > 1
    ? `Mixto (${upfront.map(u => formatPaymentMethodLabel(u.method)).join(' + ')})`
    : code?.trim() ? formatPaymentMethodLabel(code) : 'Crédito'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 12
const CONTENT_W = PAGE_W - 2 * MARGIN
const LINE_H = 4.4
const GRAY: [number, number, number] = [214, 214, 214]
const ROW_ALT: [number, number, number] = [248, 250, 252]
const BODY_BOTTOM = PAGE_H - 16

const symbol = (c: string) => (c === 'USD' ? 'US$' : 'S/')
const money = (n: number | undefined) =>
  Number(n ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtyText = (n: number) => Number(n).toLocaleString('es-PE', { maximumFractionDigits: 3 })

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d
}

/** Serie-número tal como lo emitió el proveedor (el número se rellena a 8 dígitos como en el listado). */
export function purchaseDocNumber(p: Pick<Purchase, 'series' | 'number'>): string {
  const n = String(p.number ?? '').trim()
  const s = String(p.series ?? '').trim()
  const num = /^\d+$/.test(n) ? n.padStart(8, '0') : n
  return s ? `${s}-${num}` : num
}

export function purchasePdfFileName(p: Purchase, format: PurchasePdfFormat): string {
  return `compra-${purchaseDocNumber(p)}${format === 'ticket' ? '-ticket' : ''}.pdf`
}

function companyNames() {
  const cfg = getCompanyConfigCache()
  const trade = String(cfg?.trade_name ?? '').trim()
  const business = String(cfg?.business_name ?? '').trim()
  // La razón social es lo principal; el nombre comercial va debajo si es distinto.
  const primary = business || trade
  const secondary =
    business && trade && business.localeCompare(trade, undefined, { sensitivity: 'accent' }) !== 0 ? trade : ''
  return { cfg, primary, secondary }
}

/** Proveedor con sus datos de contacto (si el usuario no puede leer contactos, queda solo el nombre de la compra). */
export async function loadPurchasePdfSupplier(p: Purchase): Promise<PurchasePdfSupplier> {
  const fallbackName = String(p.supplier_name ?? p.contact_name ?? '').trim() || '—'
  if (!p.contact_id) return { name: fallbackName }
  try {
    const c = await contactsService.get(p.contact_id)
    return {
      name: String(c.business_name ?? '').trim() || fallbackName,
      docLabel: formatTipoDocIdentidadDisplay(c.doc_type, c.doc_number) || undefined,
      address: String(c.address ?? '').trim() || undefined,
      phone: String(c.phone ?? '').trim() || undefined,
      email: String(c.email ?? '').trim() || undefined,
    }
  } catch {
    return { name: fallbackName }
  }
}

/** Arma el insumo del PDF a partir del detalle de la compra. `unitLabelOf` da la unidad comercial de cada línea. */
export async function buildPurchasePdfInput(
  detail: PurchaseDetail,
  paymentLabel: string,
  unitLabelOf?: (item: PurchaseItem) => string | null,
  opts?: { preview?: boolean },
): Promise<PurchasePdfInput> {
  const supplier = await loadPurchasePdfSupplier(detail.purchase)
  const lines: PurchasePdfLine[] = (detail.items ?? []).map((it) => ({
    code: it.code || undefined,
    description: it.description,
    unitLabel: unitLabelOf?.(it) || it.unit || '',
    quantity: Number(it.quantity),
    unitCost: Number(it.unit_cost),
    total: Number(it.quantity) * Number(it.unit_cost),
    serials: it.serials,
  }))
  return { purchase: detail.purchase, lines, supplier, paymentLabel, preview: opts?.preview }
}

const statusLabel = (p: Purchase) => (p.status === 'cancelled' ? 'Anulada' : 'Recibida')

async function loadLogo(logoSrc: string | null) {
  if (!logoSrc) return null
  try {
    return await resolveReceiptLogoForPdf(logoSrc)
  } catch {
    return null
  }
}

/* ─────────────────────────────── A4 ─────────────────────────────── */

async function generateA4({ purchase: p, lines, supplier, paymentLabel, preview }: PurchasePdfInput): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const font = (size: number, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.setTextColor(0, 0, 0)
  }
  const sym = symbol(p.currency)

  // ── Cabecera: logo de la sucursal | razón social y datos | recuadro con tipo y número
  const top = MARGIN
  const boxW = 62
  const boxH = 30
  const boxX = PAGE_W - MARGIN - boxW
  const { cfg, primary, secondary } = companyNames()
  const issuer = await loadBranchPrintIdentity({ id: p.branch_id, name: '' })
  const logoSize = readLogoPrintSize('a4')
  const logoMaxW = scaleLogoDimension(36, logoSize, 'a4')
  const logoMaxH = scaleLogoDimension(22, logoSize, 'a4')
  const logoAsset = await loadLogo(issuer.logo)
  let logo: { dataUrl: string; format: string; w: number; h: number } | null = null
  if (logoAsset) {
    const { w, h } = fitReceiptLogoMm(logoAsset.naturalW, logoAsset.naturalH, logoMaxW, logoMaxH)
    logo = { dataUrl: logoAsset.dataUrl, format: logoAsset.format, w, h }
    doc.addImage(logo.dataUrl, logo.format, MARGIN, top, logo.w, logo.h)
  }
  const infoX = MARGIN + (logo ? logoMaxW + 4 : 0)
  const infoW = boxX - infoX - 4

  let cy = top + 3
  font(11.5, 'bold')
  for (const line of doc.splitTextToSize((primary || '—').toUpperCase(), infoW) as string[]) {
    doc.text(line, infoX, cy)
    cy += LINE_H + 0.2
  }
  font(8)
  const info = (text: string) => {
    for (const line of doc.splitTextToSize(text, infoW) as string[]) {
      doc.text(line, infoX, cy)
      cy += LINE_H - 0.15
    }
  }
  if (secondary) info(secondary.toUpperCase())
  if (cfg?.ruc) info(`RUC ${cfg.ruc}`)
  if (issuer.name) info(`Sucursal: ${issuer.name}`)
  if (issuer.address) info(issuer.address)
  const phone = issuer.phone || cfg?.phone?.trim()
  if (phone) info(`Teléfono: ${phone}`)
  if (cfg?.email?.trim()) info(`Email: ${cfg.email.trim()}`)

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.25)
  doc.roundedRect(boxX, top, boxW, boxH, 2, 2)
  font(9, 'bold')
  doc.text(`RUC:  ${cfg?.ruc || '—'}`, boxX + boxW / 2, top + 5.5, { align: 'center' })
  doc.setFillColor(...GRAY)
  doc.rect(boxX, top + 9, boxW, 8, 'F')
  font(10, 'bold')
  doc.text('COMPROBANTE DE COMPRA', boxX + boxW / 2, top + 14.5, { align: 'center' })
  font(8)
  doc.text(String(p.doc_type || '').toUpperCase(), boxX + boxW / 2, top + 21, { align: 'center' })
  font(11, 'bold')
  doc.text(purchaseDocNumber(p), boxX + boxW / 2, top + 26.5, { align: 'center' })

  let y = Math.max(cy, top + boxH) + 6

  // ── Proveedor + datos de la compra
  const colW = CONTENT_W / 2 - 2
  const rightX = MARGIN + colW + 4
  const blockH = 32
  doc.setDrawColor(200, 200, 200)
  doc.roundedRect(MARGIN, y, colW, blockH, 1.5, 1.5)
  doc.roundedRect(rightX, y, colW, blockH, 1.5, 1.5)
  font(8, 'bold')
  doc.text('PROVEEDOR', MARGIN + 2, y + 4.5)
  doc.text('DATOS DE LA COMPRA', rightX + 2, y + 4.5)
  font(8)
  let sy = y + 9
  const put = (label: string, value: string) => {
    const lines2 = doc.splitTextToSize(`${label} ${value}`, colW - 4) as string[]
    doc.text(lines2.slice(0, 2), MARGIN + 2, sy)
    sy += lines2.slice(0, 2).length * (LINE_H - 0.4)
  }
  put('Razón social:', supplier.name || '—')
  put('Documento:', supplier.docLabel || '—')
  if (supplier.address) put('Dirección:', supplier.address)
  if (supplier.phone) put('Teléfono:', supplier.phone)
  sy = y + 9
  const right: [string, string][] = [
    ['Tipo de documento:', String(p.doc_type || '—')],
    ['N° comprobante:', purchaseDocNumber(p)],
    ['Fecha de emisión:', fmtDate(p.issue_date)],
    ['Moneda:', p.currency === 'USD' ? `Dólares (USD)${p.exchange_rate ? ` · TC ${Number(p.exchange_rate).toFixed(3)}` : ''}` : 'Soles (PEN)'],
    ['Forma de pago:', paymentLabel],
    ['Estado:', statusLabel(p)],
  ]
  for (const [l, v] of right) {
    font(8, 'bold')
    doc.text(l, rightX + 2, sy)
    font(8)
    doc.text(doc.splitTextToSize(v, colW - 36)[0] as string, rightX + 35, sy)
    sy += LINE_H - 0.4
  }
  y += blockH + 6

  // ── Tabla de ítems
  const colX = { n: MARGIN + 1.5, desc: MARGIN + 9, unit: MARGIN + 108, qty: MARGIN + 142, cost: MARGIN + 164, total: MARGIN + CONTENT_W - 1.5 }
  const header = () => {
    doc.setFillColor(...GRAY)
    doc.rect(MARGIN, y, CONTENT_W, 6.5, 'F')
    font(8, 'bold')
    doc.text('#', colX.n, y + 4.5)
    doc.text('DESCRIPCIÓN', colX.desc, y + 4.5)
    doc.text('UNIDAD', colX.unit, y + 4.5)
    doc.text('CANT.', colX.qty, y + 4.5, { align: 'right' })
    doc.text('COSTO UNIT.', colX.cost, y + 4.5, { align: 'right' })
    doc.text('IMPORTE', colX.total, y + 4.5, { align: 'right' })
    y += 11
  }
  header()
  lines.forEach((it, i) => {
    font(8)
    const desc = `${it.code ? `[${it.code}] ` : ''}${it.description}`
    const descLines = doc.splitTextToSize(desc, colX.unit - colX.desc - 3) as string[]
    const serialLines = it.serials?.length ? (doc.splitTextToSize(`Series: ${it.serials.join(', ')}`, colX.unit - colX.desc - 3) as string[]) : []
    const rowH = (descLines.length + serialLines.length) * (LINE_H - 0.4) + 1.6
    if (y + rowH > BODY_BOTTOM - 40) {
      doc.addPage()
      y = MARGIN
      header()
    }
    if (i % 2 === 1) {
      doc.setFillColor(...ROW_ALT)
      doc.rect(MARGIN, y - 3.2, CONTENT_W, rowH, 'F')
    }
    font(8)
    doc.text(String(i + 1), colX.n, y)
    doc.text(descLines, colX.desc, y)
    if (serialLines.length) {
      font(7)
      doc.text(serialLines, colX.desc, y + descLines.length * (LINE_H - 0.4))
      font(8)
    }
    doc.text(doc.splitTextToSize(it.unitLabel || '—', colX.qty - colX.unit - 14)[0] as string, colX.unit, y)
    doc.text(qtyText(it.quantity), colX.qty, y, { align: 'right' })
    doc.text(money(it.unitCost), colX.cost, y, { align: 'right' })
    doc.text(money(it.total), colX.total, y, { align: 'right' })
    y += rowH
  })
  doc.setDrawColor(200, 200, 200)
  doc.line(MARGIN, y - 1.5, MARGIN + CONTENT_W, y - 1.5)

  // ── Totales (en la moneda del documento; equivalente en soles si es USD)
  if (y > BODY_BOTTOM - 38) {
    doc.addPage()
    y = MARGIN
  }
  y += 3
  const totalsX = MARGIN + CONTENT_W - 62
  const line = (label: string, value: string, bold = false) => {
    font(bold ? 10 : 8.5, bold ? 'bold' : 'normal')
    doc.text(label, totalsX, y)
    doc.text(value, MARGIN + CONTENT_W - 1.5, y, { align: 'right' })
    y += bold ? 6 : LINE_H
  }
  line('Subtotal:', `${sym} ${money(p.subtotal)}`)
  line('IGV:', `${sym} ${money(p.tax_amount)}`)
  line('TOTAL:', `${sym} ${money(p.total)}`, true)
  if (p.currency === 'USD' && p.exchange_rate) {
    font(8)
    doc.text(`Equivalente en soles (TC ${Number(p.exchange_rate).toFixed(3)}):`, totalsX - 6, y)
    doc.text(`S/ ${money(Number(p.total) * Number(p.exchange_rate))}`, MARGIN + CONTENT_W - 1.5, y, { align: 'right' })
    y += LINE_H
  }

  // ── Observaciones
  const notes = (p.notes ?? '').trim()
  if (notes) {
    y += 4
    font(8, 'bold')
    doc.text('OBSERVACIONES', MARGIN, y)
    y += LINE_H
    font(8)
    for (const ln of doc.splitTextToSize(notes, CONTENT_W) as string[]) {
      if (y > BODY_BOTTOM) {
        doc.addPage()
        y = MARGIN
      }
      doc.text(ln, MARGIN, y)
      y += LINE_H - 0.4
    }
  }

  // ── Marca de agua si está anulada, y pie en todas las páginas
  const pages = doc.getNumberOfPages()
  for (let pg = 1; pg <= pages; pg++) {
    doc.setPage(pg)
    if (p.status === 'cancelled' || preview) {
      doc.saveGraphicsState()
      doc.setGState(new (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState({ opacity: 0.12 }) as never)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(80)
      doc.setTextColor(preview ? 120 : 200, preview ? 120 : 0, preview ? 120 : 0)
      doc.setFontSize(preview ? 60 : 80)
      doc.text(preview ? 'VISTA PREVIA' : 'ANULADA', PAGE_W / 2, PAGE_H / 2, { align: 'center', angle: 35 })
      doc.restoreGraphicsState()
    }
    font(7)
    doc.text(`${TUKIFAC_APP_NAME} · Documento de control interno de compras, no es comprobante de pago`, PAGE_W / 2, PAGE_H - 8, { align: 'center' })
  }
  return doc
}

/* ────────────────────────────── Ticket ────────────────────────────── */

/** Alto holgado de rollo; se recorta al contenido real al final (igual que la transferencia de stock). */
const TICKET_PAGE_HEIGHT = 900

async function generateTicket(
  { purchase: p, lines, supplier, paymentLabel, preview }: PurchasePdfInput,
  paperWidthMm?: TicketPaperWidthMm,
): Promise<jsPDF> {
  const paperMm = normalizeTicketPaperWidth(paperWidthMm ?? configuredTicketPaperMm())
  const pageW = ticketPageWidthMm(paperMm)
  const margin = ticketMarginMm(paperMm)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pageW, TICKET_PAGE_HEIGHT], compress: false })
  const innerW = pageW - 2 * margin
  const lineH = 4.2
  const sym = symbol(p.currency)
  let y = margin + ticketTopPaddingMm(paperMm)

  const center = (text: string, size: number, bold = false) => {
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    for (const line of doc.splitTextToSize(text, innerW) as string[]) {
      doc.text(line, pageW / 2, y, { align: 'center' })
      y += lineH
    }
  }
  const row = (label: string, value: string, size = 8) => {
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(size)
    doc.setFont('helvetica', 'bold')
    doc.text(label, margin, y)
    const labelW = doc.getTextWidth(`${label} `) + 0.8
    doc.setFont('helvetica', 'normal')
    const valueLines = doc.splitTextToSize(value, innerW - labelW) as string[]
    doc.text(valueLines[0] ?? '', margin + labelW, y)
    y += lineH
    for (let i = 1; i < valueLines.length; i++) {
      doc.text(valueLines[i], margin, y)
      y += lineH
    }
  }
  const amountRow = (label: string, value: string, bold = false) => {
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 9 : 8)
    doc.text(label, margin, y)
    doc.text(value, pageW - margin, y, { align: 'right' })
    y += lineH
  }
  const rule = () => {
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageW - margin, y)
    y += lineH * 0.9
  }

  y += 3
  const { cfg, primary, secondary } = companyNames()
  const issuer = await loadBranchPrintIdentity({ id: p.branch_id, name: '' })
  const logoAsset = await loadLogo(issuer.logo)
  if (logoAsset) {
    const size = readLogoPrintSize('ticket')
    const maxW = Math.min(scaleLogoDimension(paperMm === 58 ? 26 : 30, size), innerW)
    const maxH = scaleLogoDimension(paperMm === 58 ? 9 : 11, size)
    const { w, h } = fitReceiptLogoMm(logoAsset.naturalW, logoAsset.naturalH, maxW, maxH)
    doc.addImage(logoAsset.dataUrl, logoAsset.format, (pageW - w) / 2, y, w, h, undefined, 'NONE')
    y += h + 6
  }
  if (primary) center(primary, 11, true)
  if (secondary) center(secondary, 7.5)
  if (cfg?.ruc) center(`RUC ${cfg.ruc}`, 8)
  if (issuer.name) center(`Sucursal: ${issuer.name}`, 7)
  if (issuer.address) center(issuer.address, 7)
  const phone = issuer.phone || cfg?.phone?.trim()
  if (phone) center(`Tel. ${phone}`, 7)
  y += 2

  center('COMPROBANTE DE COMPRA', 9.5, true)
  center(`${String(p.doc_type || '').toUpperCase()} ${purchaseDocNumber(p)}`.trim(), 10, true)
  if (p.status === 'cancelled') center('*** ANULADA ***', 9, true)
  if (preview) center('*** VISTA PREVIA ***', 9, true)
  center('Documento interno — no es comprobante de pago', 6.5)
  y += 1
  rule()

  row('Fecha:', fmtDate(p.issue_date))
  row('Proveedor:', supplier.name || '—')
  if (supplier.docLabel) row('Doc.:', supplier.docLabel)
  row('Moneda:', p.currency === 'USD' ? `USD${p.exchange_rate ? ` · TC ${Number(p.exchange_rate).toFixed(3)}` : ''}` : 'Soles (PEN)')
  row('Pago:', paymentLabel)
  y += 1
  rule()

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.text('DESCRIPCIÓN', margin, y)
  doc.text('IMPORTE', pageW - margin, y, { align: 'right' })
  y += lineH
  for (const it of lines) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    const name = `${it.code ? `[${it.code}] ` : ''}${it.description}`
    for (const ln of doc.splitTextToSize(name, innerW) as string[]) {
      doc.text(ln, margin, y)
      y += lineH - 0.4
    }
    const detail = `${qtyText(it.quantity)}${it.unitLabel ? ` ${it.unitLabel}` : ''} x ${money(it.unitCost)}`
    doc.text(detail, margin, y)
    doc.setFont('helvetica', 'bold')
    doc.text(money(it.total), pageW - margin, y, { align: 'right' })
    y += lineH - 0.4
    if (it.serials?.length) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      for (const ln of doc.splitTextToSize(`Series: ${it.serials.join(', ')}`, innerW) as string[]) {
        doc.text(ln, margin, y)
        y += lineH - 0.8
      }
    }
    y += 0.8
  }
  rule()
  amountRow('Subtotal:', `${sym} ${money(p.subtotal)}`)
  amountRow('IGV:', `${sym} ${money(p.tax_amount)}`)
  amountRow('TOTAL:', `${sym} ${money(p.total)}`, true)
  if (p.currency === 'USD' && p.exchange_rate) {
    amountRow('Equiv. en soles:', `S/ ${money(Number(p.total) * Number(p.exchange_rate))}`)
  }
  const notes = (p.notes ?? '').trim()
  if (notes) {
    y += 1
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    for (const ln of doc.splitTextToSize(`Obs.: ${notes}`, innerW) as string[]) {
      doc.text(ln, margin, y)
      y += lineH
    }
  }
  y += 1
  rule()
  center(`${TUKIFAC_APP_NAME} - Sistema POS`, 6.5)

  // Recorta el alto de rollo al contenido real (mover el borde inferior del mediaBox).
  const finalHeight = Math.max(y + margin, margin * 4)
  const mediaBox = doc.getPageInfo(1).pageContext.mediaBox
  mediaBox.bottomLeftY = mediaBox.topRightY - finalHeight * doc.internal.scaleFactor
  return doc
}

/* ───────────────────────────── API pública ───────────────────────────── */

export function generatePurchasePdf(input: PurchasePdfInput, format: PurchasePdfFormat): Promise<jsPDF> {
  return format === 'a4' ? generateA4(input) : generateTicket(input)
}

export async function downloadPurchasePdf(input: PurchasePdfInput, format: PurchasePdfFormat): Promise<void> {
  const doc = await generatePurchasePdf(input, format)
  await downloadJsPdf(doc, purchasePdfFileName(input.purchase, format))
}

/** Abre la compra en el visor de PDF global de la app (previsualización). */
export async function openPurchasePdfViewer(input: PurchasePdfInput, format: PurchasePdfFormat): Promise<void> {
  const doc = await generatePurchasePdf(input, format)
  const url = URL.createObjectURL(doc.output('blob'))
  openPdfViewer({
    url,
    title: `Compra ${purchaseDocNumber(input.purchase)}${format === 'ticket' ? ' (ticket)' : ''}`,
    fileName: purchasePdfFileName(input.purchase, format),
    onClose: () => URL.revokeObjectURL(url),
  })
}
