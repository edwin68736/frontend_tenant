import { jsPDF } from 'jspdf'
import { getCompanyConfigCache } from '@/lib/companyConfig/store'
import { loadBranchPrintIdentity } from '@/lib/branchIdentity/store'
import { fitReceiptLogoMm, resolveReceiptLogoForPdf } from '@/utils/receiptLogoPdf'
import { readLogoPrintSize, scaleLogoDimension } from '@/services/printers/logoPrintSize'
import { downloadJsPdf } from '@/utils/downloadBlob'
import { openPdfViewer } from '@/components/pdf/pdfViewerStore'
import { TUKIFAC_APP_NAME } from '@/lib/appVersion'
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

export interface PurchaseOrderPdfInput {
  order: PurchaseOrder
  items: PurchaseOrderItem[]
  supplier: PurchaseOrderPdfSupplier
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

export function purchaseOrderFileName(o: PurchaseOrder): string {
  return `orden-compra-${o.number}.pdf`
}

export async function generatePurchaseOrderPdf({ order, items, supplier }: PurchaseOrderPdfInput): Promise<jsPDF> {
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
  const cfg = getCompanyConfigCache()
  const issuer = await loadBranchPrintIdentity({ id: order.branch_id, name: '' })
  let logo: { dataUrl: string; format: string; w: number; h: number } | null = null
  const logoSize = readLogoPrintSize('a4')
  const logoMaxW = scaleLogoDimension(36, logoSize, 'a4')
  const logoMaxH = scaleLogoDimension(22, logoSize, 'a4')
  if (issuer.logo) {
    try {
      const r = await resolveReceiptLogoForPdf(issuer.logo)
      if (r) {
        const { w, h } = fitReceiptLogoMm(r.naturalW, r.naturalH, logoMaxW, logoMaxH)
        logo = { dataUrl: r.dataUrl, format: r.format, w, h }
      }
    } catch {
      /* sin logo */
    }
  }
  if (logo) doc.addImage(logo.dataUrl, logo.format, MARGIN, top, logo.w, logo.h)
  const infoX = MARGIN + (logo ? logoMaxW + 4 : 0)
  const infoW = boxX - infoX - 4

  const trade = String(cfg?.trade_name ?? '').trim()
  const business = String(cfg?.business_name ?? '').trim()
  let cy = top + 3
  font(11.5, 'bold')
  for (const line of doc.splitTextToSize((trade || business || '—').toUpperCase(), infoW) as string[]) {
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
  if (trade && business && trade.toLowerCase() !== business.toLowerCase()) info(business.toUpperCase())
  if (cfg?.ruc) info(`RUC ${cfg.ruc}`)
  if (issuer.address) info(issuer.address)
  if (cfg?.phone?.trim()) info(`Teléfono: ${cfg.phone.trim()}`)
  if (cfg?.email?.trim()) info(`Email: ${cfg.email.trim()}`)

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.25)
  doc.roundedRect(boxX, top, boxW, boxH, 2, 2)
  font(9, 'bold')
  doc.text(`RUC:  ${cfg?.ruc || '—'}`, boxX + boxW / 2, top + 5.5, { align: 'center' })
  doc.setFillColor(...GRAY)
  doc.rect(boxX, top + 9, boxW, 8, 'F')
  font(10, 'bold')
  doc.text('ORDEN DE COMPRA', boxX + boxW / 2, top + 14.5, { align: 'center' })
  font(11, 'bold')
  doc.text(order.number, boxX + boxW / 2, top + 24, { align: 'center' })

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
    font(7)
    doc.text(`${TUKIFAC_APP_NAME} · Documento comercial, no es comprobante de pago`, PAGE_W / 2, PAGE_H - 8, { align: 'center' })
  }
  return doc
}

export async function downloadPurchaseOrderPdf(input: PurchaseOrderPdfInput): Promise<void> {
  const doc = await generatePurchaseOrderPdf(input)
  await downloadJsPdf(doc, purchaseOrderFileName(input.order))
}

/** Abre la orden en el visor de PDF global de la app. */
export async function openPurchaseOrderPdfViewer(input: PurchaseOrderPdfInput): Promise<void> {
  const doc = await generatePurchaseOrderPdf(input)
  const url = URL.createObjectURL(doc.output('blob'))
  openPdfViewer({
    url,
    title: `Orden de compra ${input.order.number}`,
    fileName: purchaseOrderFileName(input.order),
    onClose: () => URL.revokeObjectURL(url),
  })
}
