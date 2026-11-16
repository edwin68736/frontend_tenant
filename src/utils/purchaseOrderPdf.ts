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
} from '@/utils/receiptTicketPaper'
import { contactsService } from '@/services/contacts.service'
import { PURCHASE_ORDER_STATUS_LABEL, type PurchaseOrder, type PurchaseOrderItem } from '@/services/purchaseOrders.service'

/**
 * Orden de compra (documento comercial interno, NO fiscal) en A4. Se arma en el navegador con jsPDF a partir
 * de la orden y su detalle (`GET /api/purchase-orders/:id`) y la config de empresa cacheada; el proveedor se
 * pasa ya resuelto. Mismo estilo de cabecera que el comprobante de transferencia (inventoryTransferPdf.ts).
 */

export interface PurchaseOrderPdfSupplier {
  name: string
  docNumber?: string
  address?: string
  phone?: string
  email?: string
}

export type PurchaseOrderPdfFormat = 'a4' | 'ticket'

export interface PurchaseOrderPdfInput {
  order: PurchaseOrder
  items: PurchaseOrderItem[]
  supplier: PurchaseOrderPdfSupplier
  /** Vista previa desde el formulario (aún no creada): se marca como tal en el documento. */
  preview?: boolean
}

/** Proveedor con sus datos de contacto para el documento (la orden solo guarda el id). */
export async function loadPurchaseOrderPdfSupplier(order: Pick<PurchaseOrder, 'contact_id' | 'contact_name'>): Promise<PurchaseOrderPdfSupplier> {
  const fallback = String(order.contact_name ?? '').trim()
  if (!order.contact_id) return { name: fallback }
  try {
    const c = await contactsService.get(order.contact_id)
    return {
      name: String(c.business_name ?? '').trim() || fallback,
      docNumber: c.doc_number || undefined,
      address: String(c.address ?? '').trim() || undefined,
      phone: String(c.phone ?? '').trim() || undefined,
      email: String(c.email ?? '').trim() || undefined,
    }
  } catch {
    return { name: fallback }
  }
}

export async function buildPurchaseOrderPdfInput(
  detail: { order: PurchaseOrder; items: PurchaseOrderItem[] },
  opts?: { preview?: boolean },
): Promise<PurchaseOrderPdfInput> {
  return { order: detail.order, items: detail.items, supplier: await loadPurchaseOrderPdfSupplier(detail.order), preview: opts?.preview }
}

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 12
const CONTENT_W = PAGE_W - 2 * MARGIN
const LINE_H = 4.4
const GRAY: [number, number, number] = [214, 214, 214]
const ROW_ALT: [number, number, number] = [248, 250, 252]
const BODY_BOTTOM = PAGE_H - 16

const symbol = (c: string) => (c === 'USD' ? 'US$' : 'S/')
const money = (n: number | undefined) => Number(n ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qty = (n: number) => Number(n).toLocaleString('es-PE', { maximumFractionDigits: 3 })

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d
}

export function purchaseOrderFileName(o: PurchaseOrder, format: PurchaseOrderPdfFormat = 'a4'): string {
  return `orden-compra-${o.number || 'borrador'}${format === 'ticket' ? '-ticket' : ''}.pdf`
}

const orderNumberText = (o: PurchaseOrder) => o.number || '(sin número)'

async function loadLogo(src: string | null | undefined) {
  if (!src) return null
  try {
    return await resolveReceiptLogoForPdf(src)
  } catch {
    return null
  }
}

/** Emisor para la cabecera: razón social como principal y nombre comercial debajo (igual que el PDF de compras). */
async function resolveIssuer(order: PurchaseOrder) {
  const cfg = getCompanyConfigCache()
  const branch = await loadBranchPrintIdentity({ id: order.branch_id, name: '' })
  const trade = String(cfg?.trade_name ?? '').trim()
  const business = String(cfg?.business_name ?? '').trim()
  return {
    primary: business || trade,
    secondary: business && trade && business.localeCompare(trade, undefined, { sensitivity: 'accent' }) !== 0 ? trade : '',
    ruc: cfg?.ruc || '',
    branchName: branch.name || '',
    address: branch.address || '',
    phone: String(branch.phone || cfg?.phone || '').trim(),
    email: String(cfg?.email ?? '').trim(),
    logo: branch.logo,
  }
}

function drawPreviewMark(doc: jsPDF, w: number, h: number) {
  doc.saveGraphicsState()
  doc.setGState(new (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState({ opacity: 0.12 }) as never)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(60)
  doc.setTextColor(120, 120, 120)
  doc.text('VISTA PREVIA', w / 2, h / 2, { align: 'center', angle: 35 })
  doc.restoreGraphicsState()
}

async function generateA4({ order, items, supplier, preview }: PurchaseOrderPdfInput): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const font = (size: number, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.setTextColor(0, 0, 0)
  }
  const sym = symbol(order.currency)

  // ── Cabecera: logo | empresa | recuadro con tipo y número
  const top = MARGIN
  const boxW = 62
  const boxH = 30
  const boxX = PAGE_W - MARGIN - boxW
  const issuer = await resolveIssuer(order)
  let logo: { dataUrl: string; format: string; w: number; h: number } | null = null
  const logoSize = readLogoPrintSize('a4')
  const logoMaxW = scaleLogoDimension(36, logoSize, 'a4')
  const logoMaxH = scaleLogoDimension(22, logoSize, 'a4')
  const logoAsset = await loadLogo(issuer.logo)
  if (logoAsset) {
    const { w, h } = fitReceiptLogoMm(logoAsset.naturalW, logoAsset.naturalH, logoMaxW, logoMaxH)
    logo = { dataUrl: logoAsset.dataUrl, format: logoAsset.format, w, h }
    doc.addImage(logo.dataUrl, logo.format, MARGIN, top, logo.w, logo.h)
  }
  const infoX = MARGIN + (logo ? logoMaxW + 4 : 0)
  const infoW = boxX - infoX - 4

  let cy = top + 3
  font(11.5, 'bold')
  for (const line of doc.splitTextToSize((issuer.primary || '—').toUpperCase(), infoW) as string[]) {
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
  if (issuer.secondary) info(issuer.secondary.toUpperCase())
  if (issuer.ruc) info(`RUC ${issuer.ruc}`)
  if (issuer.branchName) info(`Sucursal: ${issuer.branchName}`)
  if (issuer.address) info(issuer.address)
  if (issuer.phone) info(`Teléfono: ${issuer.phone}`)
  if (issuer.email) info(`Email: ${issuer.email}`)

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.25)
  doc.roundedRect(boxX, top, boxW, boxH, 2, 2)
  font(9, 'bold')
  doc.text(`RUC:  ${issuer.ruc || '—'}`, boxX + boxW / 2, top + 5.5, { align: 'center' })
  doc.setFillColor(...GRAY)
  doc.rect(boxX, top + 9, boxW, 8, 'F')
  font(10, 'bold')
  doc.text('ORDEN DE COMPRA', boxX + boxW / 2, top + 14.5, { align: 'center' })
  font(11, 'bold')
  doc.text(orderNumberText(order), boxX + boxW / 2, top + 24, { align: 'center' })

  let y = Math.max(cy, top + boxH) + 6

  // ── Proveedor + datos de la orden
  const colW = CONTENT_W / 2 - 2
  const rightX = MARGIN + colW + 4
  doc.setDrawColor(200, 200, 200)
  doc.roundedRect(MARGIN, y, colW, 27, 1.5, 1.5)
  doc.roundedRect(rightX, y, colW, 27, 1.5, 1.5)
  font(8, 'bold')
  doc.text('PROVEEDOR', MARGIN + 2, y + 4.5)
  doc.text('DATOS DE LA ORDEN', rightX + 2, y + 4.5)
  font(8)
  let sy = y + 9
  const put = (x: number, label: string, value: string, maxW: number) => {
    const lines = doc.splitTextToSize(`${label} ${value}`, maxW) as string[]
    doc.text(lines.slice(0, 2), x, sy)
    sy += lines.slice(0, 2).length * (LINE_H - 0.4)
  }
  put(MARGIN + 2, 'Razón social:', supplier.name || '—', colW - 4)
  put(MARGIN + 2, 'RUC/Doc.:', supplier.docNumber || '—', colW - 4)
  if (supplier.address) put(MARGIN + 2, 'Dirección:', supplier.address, colW - 4)
  if (supplier.phone) put(MARGIN + 2, 'Teléfono:', supplier.phone, colW - 4)
  sy = y + 9
  const right: [string, string][] = [
    ['Emisión:', fmtDate(order.issue_date)],
    ['Entrega esperada:', fmtDate(order.expected_date)],
    ['Moneda:', order.currency === 'USD' ? `Dólares (USD)${order.exchange_rate ? ` · TC ${Number(order.exchange_rate).toFixed(3)}` : ''}` : 'Soles (PEN)'],
    ['Condición de pago:', order.payment_condition || '—'],
    ['Estado:', PURCHASE_ORDER_STATUS_LABEL[order.status] ?? order.status],
  ]
  for (const [l, v] of right) {
    font(8, 'bold')
    doc.text(l, rightX + 2, sy)
    font(8)
    doc.text(doc.splitTextToSize(v, colW - 34)[0] as string, rightX + 34, sy)
    sy += LINE_H - 0.4
  }
  y += 27 + 6

  // ── Tabla de ítems
  const colX = { n: MARGIN + 1.5, desc: MARGIN + 9, unit: MARGIN + 112, qty: MARGIN + 142, cost: MARGIN + 164, total: MARGIN + CONTENT_W - 1.5 }
  const header = () => {
    doc.setFillColor(...GRAY)
    doc.rect(MARGIN, y, CONTENT_W, 6.5, 'F')
    font(8, 'bold')
    doc.text('#', colX.n, y + 4.5)
    doc.text('DESCRIPCIÓN', colX.desc, y + 4.5)
    doc.text('UNID.', colX.unit, y + 4.5)
    doc.text('CANT.', colX.qty, y + 4.5, { align: 'right' })
    doc.text('COSTO', colX.cost, y + 4.5, { align: 'right' })
    doc.text('IMPORTE', colX.total, y + 4.5, { align: 'right' })
    y += 11
  }
  header()
  items.forEach((it, i) => {
    font(8)
    const desc = `${it.code ? `[${it.code}] ` : ''}${it.description}`
    const lines = doc.splitTextToSize(desc, colX.unit - colX.desc - 3) as string[]
    const rowH = lines.length * (LINE_H - 0.4) + 1.6
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
    doc.text(lines, colX.desc, y)
    doc.text(it.unit || '—', colX.unit, y)
    doc.text(qty(it.quantity), colX.qty, y, { align: 'right' })
    doc.text(money(it.unit_cost), colX.cost, y, { align: 'right' })
    doc.text(money(it.total), colX.total, y, { align: 'right' })
    y += rowH
  })
  doc.setDrawColor(200, 200, 200)
  doc.line(MARGIN, y - 1.5, MARGIN + CONTENT_W, y - 1.5)

  // ── Totales (en la moneda de la orden; equivalente en soles si es USD)
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
  line('Subtotal:', `${sym} ${money(order.subtotal)}`)
  line('IGV:', `${sym} ${money(order.tax_amount)}`)
  line('TOTAL:', `${sym} ${money(order.total)}`, true)
  if (order.currency === 'USD' && order.exchange_rate) {
    font(8)
    doc.text(`Equivalente en soles (TC ${Number(order.exchange_rate).toFixed(3)}):`, totalsX - 6, y)
    doc.text(`S/ ${money(Number(order.total) * Number(order.exchange_rate))}`, MARGIN + CONTENT_W - 1.5, y, { align: 'right' })
    y += LINE_H
  }

  // ── Observaciones
  const notes = (order.notes ?? '').trim()
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

  // ── Firmas y pie
  const sigY = Math.min(Math.max(y + 22, 235), BODY_BOTTOM - 4)
  doc.setLineWidth(0.25)
  doc.line(MARGIN + 10, sigY, MARGIN + 70, sigY)
  doc.line(PAGE_W - MARGIN - 70, sigY, PAGE_W - MARGIN - 10, sigY)
  font(8)
  doc.text('Emitido por', MARGIN + 40, sigY + 4, { align: 'center' })
  doc.text('Conformidad del proveedor', PAGE_W - MARGIN - 40, sigY + 4, { align: 'center' })
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    if (preview) drawPreviewMark(doc, PAGE_W, PAGE_H)
    font(7)
    doc.text(`${TUKIFAC_APP_NAME} · Documento comercial, no es comprobante de pago`, PAGE_W / 2, PAGE_H - 8, { align: 'center' })
  }
  return doc
}

/* ────────────────────────────── Ticket ────────────────────────────── */

/** Alto holgado de rollo; se recorta al contenido real al final (igual que el PDF de compras). */
const TICKET_PAGE_HEIGHT = 900

async function generateTicket({ order, items, supplier, preview }: PurchaseOrderPdfInput): Promise<jsPDF> {
  const paperMm = normalizeTicketPaperWidth(configuredTicketPaperMm())
  const pageW = ticketPageWidthMm(paperMm)
  const margin = ticketMarginMm(paperMm)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pageW, TICKET_PAGE_HEIGHT], compress: false })
  const innerW = pageW - 2 * margin
  const lineH = 4.2
  const sym = symbol(order.currency)
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
  const issuer = await resolveIssuer(order)
  const logoAsset = await loadLogo(issuer.logo)
  if (logoAsset) {
    const size = readLogoPrintSize('ticket')
    const maxW = Math.min(scaleLogoDimension(paperMm === 58 ? 26 : 30, size), innerW)
    const maxH = scaleLogoDimension(paperMm === 58 ? 9 : 11, size)
    const { w, h } = fitReceiptLogoMm(logoAsset.naturalW, logoAsset.naturalH, maxW, maxH)
    doc.addImage(logoAsset.dataUrl, logoAsset.format, (pageW - w) / 2, y, w, h, undefined, 'NONE')
    y += h + 6
  }
  if (issuer.primary) center(issuer.primary, 11, true)
  if (issuer.secondary) center(issuer.secondary, 7.5)
  if (issuer.ruc) center(`RUC ${issuer.ruc}`, 8)
  if (issuer.branchName) center(`Sucursal: ${issuer.branchName}`, 7)
  if (issuer.address) center(issuer.address, 7)
  if (issuer.phone) center(`Tel. ${issuer.phone}`, 7)
  y += 2

  center('ORDEN DE COMPRA', 9.5, true)
  center(orderNumberText(order), 10, true)
  if (order.status === 'cancelled') center('*** ANULADA ***', 9, true)
  if (preview) center('*** VISTA PREVIA ***', 9, true)
  center('Documento comercial — no es comprobante de pago', 6.5)
  y += 1
  rule()

  row('Emisión:', fmtDate(order.issue_date))
  if (order.expected_date) row('Entrega:', fmtDate(order.expected_date))
  row('Proveedor:', supplier.name || '—')
  if (supplier.docNumber) row('Doc.:', supplier.docNumber)
  row('Moneda:', order.currency === 'USD' ? `USD${order.exchange_rate ? ` · TC ${Number(order.exchange_rate).toFixed(3)}` : ''}` : 'Soles (PEN)')
  if (order.payment_condition) row('Pago:', order.payment_condition)
  y += 1
  rule()

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.text('DESCRIPCIÓN', margin, y)
  doc.text('IMPORTE', pageW - margin, y, { align: 'right' })
  y += lineH
  for (const it of items) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    const name = `${it.code ? `[${it.code}] ` : ''}${it.description}`
    for (const ln of doc.splitTextToSize(name, innerW) as string[]) {
      doc.text(ln, margin, y)
      y += lineH - 0.4
    }
    doc.text(`${qty(it.quantity)}${it.unit ? ` ${it.unit}` : ''} x ${money(it.unit_cost)}`, margin, y)
    doc.setFont('helvetica', 'bold')
    doc.text(money(it.total), pageW - margin, y, { align: 'right' })
    y += lineH - 0.4 + 0.8
  }
  rule()
  amountRow('Subtotal:', `${sym} ${money(order.subtotal)}`)
  amountRow('IGV:', `${sym} ${money(order.tax_amount)}`)
  amountRow('TOTAL:', `${sym} ${money(order.total)}`, true)
  if (order.currency === 'USD' && order.exchange_rate) {
    amountRow('Equiv. en soles:', `S/ ${money(Number(order.total) * Number(order.exchange_rate))}`)
  }
  const notes = (order.notes ?? '').trim()
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

  const finalHeight = Math.max(y + margin, margin * 4)
  const mediaBox = doc.getPageInfo(1).pageContext.mediaBox
  mediaBox.bottomLeftY = mediaBox.topRightY - finalHeight * doc.internal.scaleFactor
  return doc
}

/* ───────────────────────────── API pública ───────────────────────────── */

export function generatePurchaseOrderPdf(input: PurchaseOrderPdfInput, format: PurchaseOrderPdfFormat = 'a4'): Promise<jsPDF> {
  return format === 'a4' ? generateA4(input) : generateTicket(input)
}



export async function downloadPurchaseOrderPdf(input: PurchaseOrderPdfInput, format: PurchaseOrderPdfFormat = 'a4'): Promise<void> {
  const doc = await generatePurchaseOrderPdf(input, format)
  await downloadJsPdf(doc, purchaseOrderFileName(input.order, format))
}

/** Abre la orden en el visor de PDF global de la app. */
export async function openPurchaseOrderPdfViewer(input: PurchaseOrderPdfInput, format: PurchaseOrderPdfFormat = 'a4'): Promise<void> {
  const doc = await generatePurchaseOrderPdf(input, format)
  const url = URL.createObjectURL(doc.output('blob'))
  openPdfViewer({
    url,
    title: `Orden de compra ${orderNumberText(input.order)}${format === 'ticket' ? ' (ticket)' : ''}`,
    fileName: purchaseOrderFileName(input.order, format),
    onClose: () => URL.revokeObjectURL(url),
  })
}
