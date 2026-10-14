import { jsPDF } from 'jspdf'
import { getCompanyConfigCache, getCompanyLogoForPrint } from '@/lib/companyConfig/store'
import { fitReceiptLogoMm, resolveReceiptLogoForPdf } from '@/utils/receiptLogoPdf'
import { readLogoPrintSize, scaleLogoDimension } from '@/services/printers/logoPrintSize'
import {
  configuredTicketPaperMm,
  normalizeTicketPaperWidth,
  ticketMarginMm,
  ticketPageWidthMm,
  ticketTopPaddingMm,
  type TicketPaperWidthMm,
} from '@/utils/receiptTicketPaper'
import { downloadJsPdf } from '@/utils/downloadBlob'
import { openPdfViewer } from '@/components/pdf/pdfViewerStore'
import { TUKIFAC_APP_NAME } from '@/lib/appVersion'
import type { TransferListItem } from '@/services/inventory.service'

/**
 * Comprobante interno (NO fiscal) de una transferencia de stock entre sucursales — A4 y
 * ticket. Se arma en el navegador con jsPDF a partir de la fila del historial
 * (`GET /api/inventory/transfers`, que ya trae líneas, unidades y usuarios) y la config de
 * empresa cacheada al iniciar sesión: sin llamadas extra a red, igual que el comprobante de
 * movimiento de caja (cashMovementReceiptPdf.ts). No reemplaza la Guía de Remisión cuando el
 * traslado la requiere.
 */

export type TransferPdfFormat = 'a4' | 'ticket'

const STATUS_LABEL: Record<TransferListItem['status'], string> = {
  pending: 'ENVIADO (pendiente de recepción)',
  confirmed: 'CONFIRMADO (recibido en destino)',
  cancelled: 'CANCELADO',
}

/** Código visible de la transferencia: la tabla no tiene serie propia, se deriva del ID. */
export function transferCode(id: number): string {
  return `TR-${String(id).padStart(6, '0')}`
}

function fmtQty(n: number): string {
  return Number(n).toLocaleString('es-PE', { maximumFractionDigits: 3 })
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString()
}

function productLabel(l: TransferListItem['lines'][number]): string {
  return `${l.product_name || `Producto #${l.product_id}`}${l.presentation_name ? ` — ${l.presentation_name}` : ''}`
}

function companyNames() {
  const cfg = getCompanyConfigCache()
  const tradeName = String(cfg?.trade_name ?? '').trim()
  const businessName = String(cfg?.business_name ?? '').trim()
  const secondary =
    tradeName && businessName && businessName.localeCompare(tradeName, undefined, { sensitivity: 'accent' }) !== 0
      ? businessName
      : ''
  return { cfg, primary: tradeName || businessName, secondary }
}

/* ─────────────────────────────── A4 ─────────────────────────────── */

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 12
const CONTENT_W = PAGE_W - 2 * MARGIN
const LINE_H = 4.4
const BOX_RADIUS = 2
const GRAY: [number, number, number] = [214, 214, 214]
const ROW_ALT: [number, number, number] = [248, 250, 252]
const BORDER: [number, number, number] = [200, 200, 200]
const BODY_BOTTOM = PAGE_H - 16

async function generateA4(t: TransferListItem): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const font = (size: number, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.setTextColor(0, 0, 0)
  }

  // ── Cabecera: logo | datos de empresa | recuadro con tipo y número (estilo receiptPdfA4.ts)
  const top = MARGIN
  const logoSize = readLogoPrintSize('a4')
  const logoMaxW = scaleLogoDimension(36, logoSize, 'a4')
  const logoMaxH = scaleLogoDimension(22, logoSize, 'a4')
  const boxW = 62
  const boxH = 36
  const boxX = PAGE_W - MARGIN - boxW

  let logo: { dataUrl: string; format: string; w: number; h: number } | null = null
  const companyLogo = getCompanyLogoForPrint()
  if (companyLogo) {
    try {
      const resolved = await resolveReceiptLogoForPdf(companyLogo)
      if (resolved) {
        const { w, h } = fitReceiptLogoMm(resolved.naturalW, resolved.naturalH, logoMaxW, logoMaxH)
        logo = { dataUrl: resolved.dataUrl, format: resolved.format, w, h }
      }
    } catch {
      /* sin logo */
    }
  }
  const infoX = MARGIN + (logo ? logoMaxW + 4 : 0)
  const infoW = boxX - infoX - 4

  const { cfg, primary, secondary } = companyNames()
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
  if (cfg?.address?.trim()) info(cfg.address.trim())
  if (cfg?.phone?.trim()) info(`Teléfono: ${cfg.phone.trim()}`)
  if (cfg?.email?.trim()) info(`Email: ${cfg.email.trim()}`)

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.25)
  doc.roundedRect(boxX, top, boxW, boxH, BOX_RADIUS, BOX_RADIUS)
  font(9, 'bold')
  doc.text(`RUC:  ${cfg?.ruc || '—'}`, boxX + boxW / 2, top + 5.5, { align: 'center' })
  const barY = top + 9
  doc.setFillColor(...GRAY)
  doc.rect(boxX, barY, boxW, 9, 'F')
  doc.setLineWidth(0.2)
  doc.line(boxX, barY, boxX + boxW, barY)
  doc.line(boxX, barY + 9, boxX + boxW, barY + 9)
  doc.text('TRANSFERENCIA DE STOCK', boxX + boxW / 2, barY + 6, { align: 'center' })
  font(10.5, 'bold')
  doc.text(transferCode(t.id), boxX + boxW / 2, top + 26, { align: 'center' })
  font(6.5)
  doc.text('Documento interno — no es comprobante SUNAT', boxX + boxW / 2, top + 32, { align: 'center' })

  if (logo) {
    const sectionH = Math.max(cy - top, boxH)
    doc.addImage(
      logo.dataUrl,
      logo.format,
      MARGIN + Math.max(0, (logoMaxW - logo.w) / 2),
      top + Math.max(0, (sectionH - logo.h) / 2),
      logo.w,
      logo.h,
      undefined,
      'NONE',
    )
  }
  let y = Math.max(cy, top + boxH, logo ? top + logo.h : top) + 7

  // ── Datos de la transferencia (dos columnas en un recuadro)
  const half = CONTENT_W / 2
  const left: [string, string][] = [
    ['Origen:', t.from_branch_name || `Sucursal #${t.from_branch_id}`],
    ['Destino:', t.to_branch_name || `Sucursal #${t.to_branch_id}`],
    ['Estado:', STATUS_LABEL[t.status] ?? t.status],
  ]
  const right: [string, string][] = [
    ['Fecha de envío:', fmtDate(t.created_at)],
    ['Registrado por:', t.created_by_name || '—'],
  ]
  if (t.status === 'confirmed') {
    right.push(['Fecha de recepción:', fmtDate(t.confirmed_at)])
    if (t.confirmed_by_name) right.push(['Recibido por:', t.confirmed_by_name])
  }
  const labelW = 31
  const drawPairs = (pairs: [string, string][], x: number, startY: number): number => {
    let py = startY
    for (const [label, value] of pairs) {
      font(8.5, 'bold')
      doc.text(label, x, py)
      font(8.5)
      const lines = doc.splitTextToSize(value, half - labelW - 6) as string[]
      lines.forEach((ln, i) => doc.text(ln, x + labelW, py + i * LINE_H))
      py += LINE_H * Math.max(1, lines.length) + 0.6
    }
    return py
  }
  const pairsTop = y + 5.5
  const endL = drawPairs(left, MARGIN + 3, pairsTop)
  const endR = drawPairs(right, MARGIN + half + 2, pairsTop)
  const infoBoxH = Math.max(endL, endR) - y - 1
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.25)
  doc.roundedRect(MARGIN, y, CONTENT_W, infoBoxH, BOX_RADIUS, BOX_RADIUS)
  y += infoBoxH + 6

  // ── Tabla de productos
  const cols = [
    { title: 'N°', w: 10, align: 'center' as const },
    { title: 'CÓDIGO', w: 28, align: 'left' as const },
    { title: 'DESCRIPCIÓN', w: CONTENT_W - 10 - 28 - 32 - 24, align: 'left' as const },
    { title: 'UNIDAD', w: 32, align: 'left' as const },
    { title: 'CANTIDAD', w: 24, align: 'right' as const },
  ]
  const cellX = (i: number) => MARGIN + cols.slice(0, i).reduce((a, c) => a + c.w, 0)
  const drawTableHeader = () => {
    doc.setFillColor(...GRAY)
    doc.rect(MARGIN, y, CONTENT_W, 7, 'F')
    font(7.5, 'bold')
    cols.forEach((c, i) => {
      const x = c.align === 'right' ? cellX(i) + c.w - 1.5 : c.align === 'center' ? cellX(i) + c.w / 2 : cellX(i) + 1.5
      doc.text(c.title, x, y + 4.8, { align: c.align })
    })
    y += 7
  }
  drawTableHeader()

  let totalQty = 0
  t.lines.forEach((l, idx) => {
    totalQty += Number(l.quantity) || 0
    font(8)
    const descLines = doc.splitTextToSize(productLabel(l), cols[2].w - 3) as string[]
    const serialLines =
      l.serials && l.serials.length > 0
        ? (doc.splitTextToSize(`Series: ${l.serials.join(', ')}`, cols[2].w - 3) as string[])
        : l.with_serials
          ? ['Con series']
          : []
    const rowH = Math.max(1, descLines.length + serialLines.length) * 3.9 + 2.8
    if (y + rowH > BODY_BOTTOM) {
      doc.addPage()
      y = MARGIN
      drawTableHeader()
    }
    if (idx % 2 === 1) {
      doc.setFillColor(...ROW_ALT)
      doc.rect(MARGIN, y, CONTENT_W, rowH, 'F')
    }
    const ty = y + 4.4
    font(8)
    doc.text(String(idx + 1), cellX(0) + cols[0].w / 2, ty, { align: 'center' })
    doc.text((doc.splitTextToSize(l.product_code || '—', cols[1].w - 3) as string[])[0] ?? '', cellX(1) + 1.5, ty)
    descLines.forEach((ln, i) => doc.text(ln, cellX(2) + 1.5, ty + i * 3.9))
    if (serialLines.length) {
      font(6.8)
      doc.setTextColor(90, 90, 90)
      serialLines.forEach((ln, i) => doc.text(ln, cellX(2) + 1.5, ty + (descLines.length + i) * 3.9))
      font(8)
    }
    doc.text((doc.splitTextToSize(l.unit || '—', cols[3].w - 3) as string[])[0] ?? '', cellX(3) + 1.5, ty)
    font(8, 'bold')
    doc.text(fmtQty(l.quantity), cellX(4) + cols[4].w - 1.5, ty, { align: 'right' })
    y += rowH
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.15)
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y)
  })
  if (t.lines.length === 0) {
    font(8)
    doc.text('Sin productos registrados', PAGE_W / 2, y + 5, { align: 'center' })
    y += 8
  }

  y += 4
  if (y + 8 > BODY_BOTTOM) {
    doc.addPage()
    y = MARGIN
  }
  font(8.5, 'bold')
  doc.text(`Ítems: ${t.lines.length}`, MARGIN, y)
  doc.text(`Cantidad total: ${fmtQty(totalQty)}`, PAGE_W - MARGIN, y, { align: 'right' })
  y += 7

  // ── Observaciones
  const notes = (t.notes ?? '').trim()
  if (notes) {
    font(8)
    const noteLines = doc.splitTextToSize(notes, CONTENT_W - 6) as string[]
    const h = 8 + noteLines.length * 3.9
    if (y + h > BODY_BOTTOM) {
      doc.addPage()
      y = MARGIN
    }
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.25)
    doc.roundedRect(MARGIN, y, CONTENT_W, h, BOX_RADIUS, BOX_RADIUS)
    font(8.5, 'bold')
    doc.text('Observaciones', MARGIN + 3, y + 4.8)
    font(8)
    noteLines.forEach((ln, i) => doc.text(ln, MARGIN + 3, y + 9 + i * 3.9))
    y += h + 6
  }

  // ── Firmas: quien entrega en origen y quien recibe en destino
  const sigH = 24
  if (y + sigH > BODY_BOTTOM) {
    doc.addPage()
    y = MARGIN
  }
  const sigY = y + 16
  const sigW = 70
  const sigs: [number, string, string][] = [
    [MARGIN + 10, 'Entregado por (origen)', t.from_branch_name],
    [PAGE_W - MARGIN - 10 - sigW, 'Recibido por (destino)', t.to_branch_name],
  ]
  for (const [x, label, branch] of sigs) {
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.25)
    doc.line(x, sigY, x + sigW, sigY)
    font(8, 'bold')
    doc.text(label, x + sigW / 2, sigY + 4, { align: 'center' })
    font(7.5)
    if (branch) doc.text(branch, x + sigW / 2, sigY + 8, { align: 'center' })
  }

  // ── Pie en todas las páginas
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    font(7)
    doc.setTextColor(110, 110, 110)
    doc.text(`${TUKIFAC_APP_NAME} — generado el ${new Date().toLocaleString()}`, MARGIN, PAGE_H - 8)
    doc.text(`Página ${p} de ${pages}`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' })
  }
  return doc
}

/* ────────────────────────────── Ticket ────────────────────────────── */

/** Alto holgado de rollo; se recorta al contenido real al final (igual que receiptPdf.ts). */
const TICKET_PAGE_HEIGHT = 600

async function generateTicket(t: TransferListItem, paperWidthMm?: TicketPaperWidthMm): Promise<jsPDF> {
  const paperMm = normalizeTicketPaperWidth(paperWidthMm ?? configuredTicketPaperMm())
  const pageW = ticketPageWidthMm(paperMm)
  const margin = ticketMarginMm(paperMm)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pageW, TICKET_PAGE_HEIGHT], compress: false })
  const innerW = pageW - 2 * margin
  const lineH = 4.2
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
    // Medir con la fuente en negrita (la de la etiqueta): medida en normal queda corta y el
    // valor se pega a la etiqueta.
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
  const rule = () => {
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageW - margin, y)
    y += lineH * 0.9
  }

  // Mismo espacio inicial que el ticket de venta: la primera línea en negrita se cortaría arriba.
  y += 3

  const { cfg, primary, secondary } = companyNames()
  const companyLogo = getCompanyLogoForPrint()
  if (companyLogo) {
    try {
      const logo = await resolveReceiptLogoForPdf(companyLogo)
      if (logo) {
        const size = readLogoPrintSize('ticket')
        const maxW = Math.min(scaleLogoDimension(paperMm === 58 ? 26 : 30, size), innerW)
        const maxH = scaleLogoDimension(paperMm === 58 ? 9 : 11, size)
        const { w, h } = fitReceiptLogoMm(logo.naturalW, logo.naturalH, maxW, maxH)
        doc.addImage(logo.dataUrl, logo.format, (pageW - w) / 2, y, w, h, undefined, 'NONE')
        // `y` es la línea base del texto siguiente: dejar lugar para las mayúsculas del nombre.
        y += h + 6
      }
    } catch {
      // continuar sin logo
    }
  }
  if (primary) center(primary, 11, true)
  if (secondary) center(secondary, 7.5)
  if (cfg?.ruc) center(`RUC ${cfg.ruc}`, 8)
  if (cfg?.address) center(cfg.address, 7)
  y += 2

  center('TRANSFERENCIA DE STOCK', 9.5, true)
  center(transferCode(t.id), 10, true)
  center('Documento interno — no es comprobante SUNAT', 6.5)
  y += 1
  rule()

  row('Fecha:', fmtDate(t.created_at))
  row('Origen:', t.from_branch_name || `#${t.from_branch_id}`)
  row('Destino:', t.to_branch_name || `#${t.to_branch_id}`)
  row('Estado:', STATUS_LABEL[t.status] ?? t.status)
  row('Registrado por:', t.created_by_name || '—')
  if (t.status === 'confirmed') {
    row('Recepción:', fmtDate(t.confirmed_at))
    if (t.confirmed_by_name) row('Recibido por:', t.confirmed_by_name)
  }
  y += 1
  rule()

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.text('PRODUCTO', margin, y)
  doc.text('CANT.', pageW - margin, y, { align: 'right' })
  y += lineH
  let totalQty = 0
  for (const l of t.lines) {
    totalQty += Number(l.quantity) || 0
    const qtyText = `${fmtQty(l.quantity)} ${l.unit || ''}`.trim()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    const qtyW = doc.getTextWidth(qtyText) + 2
    doc.setFont('helvetica', 'normal')
    const name = `${l.product_code ? `[${l.product_code}] ` : ''}${productLabel(l)}`
    const lines = doc.splitTextToSize(name, innerW - qtyW) as string[]
    lines.forEach((ln, i) => {
      doc.text(ln, margin, y)
      if (i === 0) {
        doc.setFont('helvetica', 'bold')
        doc.text(qtyText, pageW - margin, y, { align: 'right' })
        doc.setFont('helvetica', 'normal')
      }
      y += lineH - 0.4
    })
    if (l.serials && l.serials.length > 0) {
      doc.setFontSize(6.5)
      for (const ln of doc.splitTextToSize(`Series: ${l.serials.join(', ')}`, innerW) as string[]) {
        doc.text(ln, margin, y)
        y += lineH - 0.8
      }
    }
    y += 0.6
  }
  rule()
  row('Ítems:', String(t.lines.length))
  row('Cantidad total:', fmtQty(totalQty))
  const notes = (t.notes ?? '').trim()
  if (notes) {
    y += 1
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    for (const ln of doc.splitTextToSize(`Obs.: ${notes}`, innerW) as string[]) {
      doc.text(ln, margin, y)
      y += lineH
    }
  }

  // Firma de recepción
  y += 10
  doc.setLineWidth(0.25)
  doc.line(margin + innerW * 0.15, y, pageW - margin - innerW * 0.15, y)
  y += lineH
  center('Recibido por', 7.5)
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

export function generateInventoryTransferPdf(t: TransferListItem, format: TransferPdfFormat): Promise<jsPDF> {
  return format === 'a4' ? generateA4(t) : generateTicket(t)
}

function fileName(t: TransferListItem, format: TransferPdfFormat): string {
  return `transferencia-${transferCode(t.id)}${format === 'ticket' ? '-ticket' : ''}.pdf`
}

export async function downloadInventoryTransferPdf(t: TransferListItem, format: TransferPdfFormat): Promise<void> {
  const doc = await generateInventoryTransferPdf(t, format)
  await downloadJsPdf(doc, fileName(t, format))
}

/** Abre el comprobante en el visor de PDF global de la app (pdfViewerStore.ts). */
export async function openInventoryTransferPdfViewer(t: TransferListItem, format: TransferPdfFormat): Promise<void> {
  const doc = await generateInventoryTransferPdf(t, format)
  const url = URL.createObjectURL(doc.output('blob'))
  openPdfViewer({
    url,
    title: `Transferencia ${transferCode(t.id)}`,
    fileName: fileName(t, format),
    onClose: () => URL.revokeObjectURL(url),
  })
}
