import { jsPDF } from 'jspdf'
import type { MovementReportRow } from '@/services/cashbank.service'
import { DETRACCION_PAYMENT_METHOD_NAME } from '@/utils/fiscalDetraction'

const PAGE_W = 210
const MARGIN = 12
const INNER_W = PAGE_W - MARGIN * 2
const PAGE_BOTTOM = 272
const FOOTER_Y = 287

const C_HEADER = [30, 41, 59] as const
const C_HEADER_TEXT = [255, 255, 255] as const
const C_MUTED = [100, 116, 139] as const
const C_TEXT = [15, 23, 42] as const
const C_BORDER = [226, 232, 240] as const
const C_ROW_ALT = [248, 250, 252] as const
const C_ACCENT = [22, 101, 52] as const

function money(n: number): string {
  return `S/ ${Number(n).toFixed(2)}`
}

function fmtDate(d: string | undefined): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString()
  } catch {
    return d
  }
}

function ensureSpace(doc: jsPDF, y: { v: number }, h: number) {
  if (y.v + h > PAGE_BOTTOM) {
    doc.addPage()
    y.v = MARGIN
  }
}

function drawSectionTitle(doc: jsPDF, y: { v: number }, title: string) {
  ensureSpace(doc, y, 10)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(...C_TEXT)
  doc.text(title, MARGIN, y.v)
  y.v += 2
  doc.setDrawColor(...C_ACCENT)
  doc.setLineWidth(0.6)
  doc.line(MARGIN, y.v, MARGIN + 42, y.v)
  doc.setDrawColor(...C_BORDER)
  y.v += 5
}

function drawDataTableLandscape(
  doc: jsPDF,
  y: { v: number },
  headers: string[],
  rows: string[][],
  colWidths: number[],
) {
  const x0 = MARGIN
  const totalW = colWidths.reduce((a, b) => a + b, 0)
  const headerH = 7
  const rowH = 6.2

  ensureSpace(doc, y, headerH + 2)
  doc.setFillColor(241, 245, 249)
  doc.rect(x0, y.v - 4.5, totalW, headerH, 'F')
  doc.setDrawColor(...C_BORDER)
  doc.setLineWidth(0.2)
  doc.rect(x0, y.v - 4.5, totalW, headerH)

  let x = x0
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.8)
  doc.setTextColor(51, 65, 85)
  headers.forEach((h, i) => {
    doc.text(h, x + 1.5, y.v + 0.5)
    x += colWidths[i]
  })
  y.v += headerH

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  for (let r = 0; r < rows.length; r++) {
    ensureSpace(doc, y, rowH + 1)
    if (r % 2 === 1) {
      doc.setFillColor(...C_ROW_ALT)
      doc.rect(x0, y.v - 4.2, totalW, rowH, 'F')
    }
    x = x0
    rows[r].forEach((cell, i) => {
      const w = colWidths[i] - 2
      const isLast = i === headers.length - 1
      doc.setTextColor(...C_TEXT)
      const lines = doc.splitTextToSize(String(cell ?? ''), w)
      const line = lines.length > 1 ? `${lines[0]}…` : lines[0] || '—'
      if (isLast) {
        doc.text(line, x + colWidths[i] - 1.5, y.v, { align: 'right', maxWidth: w })
      } else {
        doc.text(line, x + 1.2, y.v)
      }
      x += colWidths[i]
    })
    doc.setDrawColor(...C_BORDER)
    doc.line(x0, y.v + rowH - 4.2, x0 + totalW, y.v + rowH - 4.2)
    y.v += rowH
  }
  y.v += 4
}

function drawSummaryBoxes(
  doc: jsPDF,
  y: { v: number },
  items: { label: string; value: string; tone?: 'green' | 'red' | 'strong' }[],
) {
  const gap = 3
  const n = items.length
  const boxW = (INNER_W - gap * (n - 1)) / n
  const boxH = 18
  ensureSpace(doc, y, boxH + 4)
  let bx = MARGIN
  for (const it of items) {
    doc.setDrawColor(...C_BORDER)
    doc.setFillColor(249, 250, 251)
    doc.roundedRect(bx, y.v, boxW, boxH, 1.2, 1.2, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...C_MUTED)
    doc.text(it.label, bx + 2.5, y.v + 5.5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(it.tone === 'strong' ? 10 : 9.5)
    if (it.tone === 'green') doc.setTextColor(21, 128, 61)
    else if (it.tone === 'red') doc.setTextColor(185, 28, 28)
    else doc.setTextColor(...C_TEXT)
    doc.text(it.value, bx + 2.5, y.v + 13)
    doc.setTextColor(0, 0, 0)
    bx += boxW + gap
  }
  y.v += boxH + 6
}

export type CashMovementsPdfInput = {
  filtersLabel: string
  movTotals: {
    efectivo: { ingresos: number; egresos: number; saldo: number }
    bancos: { ingresos: number; egresos: number; saldo: number }
  }
  detractionMovements: MovementReportRow[]
  movements: MovementReportRow[]
  methodLabel: (code?: string) => string
  companyName?: string
}

export function downloadCashMovementsReportPdf(input: CashMovementsPdfInput): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const pageW = 297
  const y = { v: MARGIN }

  doc.setFillColor(...C_HEADER)
  doc.rect(0, 0, pageW, 28, 'F')
  doc.setTextColor(...C_HEADER_TEXT)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('REPORTE DE MOVIMIENTOS DE CAJA', MARGIN, 12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(input.companyName?.trim() || 'Movimientos por filtros', MARGIN, 18)
  doc.setFontSize(7.5)
  doc.setTextColor(203, 213, 225)
  doc.text(`Filtros: ${input.filtersLabel}`, MARGIN, 24)
  doc.text(`Generado: ${new Date().toLocaleString()}`, pageW - MARGIN, 24, { align: 'right' })
  doc.setTextColor(0, 0, 0)
  y.v = 34

  drawSectionTitle(doc, y, 'Totales según filtros')
  drawSummaryBoxes(doc, y, [
    { label: 'Ingresos efectivo', value: money(input.movTotals.efectivo.ingresos), tone: 'green' },
    { label: 'Egresos efectivo', value: money(input.movTotals.efectivo.egresos), tone: 'red' },
    { label: 'Saldo efectivo', value: money(input.movTotals.efectivo.saldo), tone: 'strong' },
    { label: 'Ingresos otros medios', value: money(input.movTotals.bancos.ingresos), tone: 'green' },
    { label: 'Egresos otros medios', value: money(input.movTotals.bancos.egresos), tone: 'red' },
    { label: 'Saldo otros medios', value: money(input.movTotals.bancos.saldo), tone: 'strong' },
  ])

  if (input.detractionMovements.length > 0) {
    drawSectionTitle(doc, y, `${DETRACCION_PAYMENT_METHOD_NAME} (${input.detractionMovements.length})`)
    ensureSpace(doc, y, 8)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...C_MUTED)
    doc.text('Informativo — no suma a efectivo ni bancos.', MARGIN, y.v)
    y.v += 5
    drawDataTableLandscape(
      doc,
      y,
      ['Fecha', 'Documento', 'Monto'],
      input.detractionMovements.map(r => [fmtDate(r.date), r.doc_number || '—', money(r.amount)]),
      [90, 120, 65],
    )
  }

  drawSectionTitle(doc, y, 'Reporte de movimientos (cobro directo)')
  const headers = ['Fecha', 'Tipo', 'Documento', 'Cliente/Proveedor', 'Usuario', 'Sucursal', 'Método', 'Monto']
  const colWidths = [38, 22, 32, 48, 38, 38, 32, 28]
  const rows = input.movements.map(r => [
    fmtDate(r.date),
    r.type,
    r.doc_number || '—',
    r.contact_name || '—',
    r.user_name || '—',
    r.branch_name || '—',
    input.methodLabel(r.payment_method),
    `${r.amount >= 0 ? '+' : ''}${money(r.amount)}`,
  ])

  if (rows.length === 0) {
    ensureSpace(doc, y, 6)
    doc.setFontSize(8.5)
    doc.setTextColor(...C_MUTED)
    doc.text('Sin movimientos para los filtros seleccionados.', MARGIN, y.v)
  } else {
    drawDataTableLandscape(doc, y, headers, rows, colWidths)
  }

  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setDrawColor(...C_BORDER)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, FOOTER_Y - 4, pageW - MARGIN, FOOTER_Y - 4)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...C_MUTED)
    doc.text(`Tukifac · Página ${i} de ${n}`, pageW / 2, FOOTER_Y, { align: 'center' })
    doc.setTextColor(0, 0, 0)
  }

  const datePart = new Date().toISOString().slice(0, 10)
  doc.save(`reporte-movimientos-caja_${datePart}.pdf`)
}
