import { jsPDF } from 'jspdf'
import type { CashSessionReport, IncomeDetailRow } from '@/services/cashbank.service'
import { formatPaymentMethodLabel, isDetractionPaymentMethod } from '@/utils/paymentMethodLabel'
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

export const SESSION_NOTES_CLOSING_MARKER = '\n\n[Notas de cierre]\n'

export function parseSessionNotesBlock(raw?: string | null): { opening: string; closing: string } {
  const t = (raw ?? '').trim()
  if (!t) return { opening: '', closing: '' }
  const i = t.indexOf(SESSION_NOTES_CLOSING_MARKER)
  if (i === -1) return { opening: t, closing: '' }
  return {
    opening: t.slice(0, i).trim(),
    closing: t.slice(i + SESSION_NOTES_CLOSING_MARKER.length).trim(),
  }
}

function ensureSpace(doc: jsPDF, y: { v: number }, h: number) {
  if (y.v + h > PAGE_BOTTOM) {
    doc.addPage()
    y.v = MARGIN
  }
}

function drawFooterOnAllPages(doc: jsPDF) {
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setDrawColor(...C_BORDER)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, FOOTER_Y - 4, PAGE_W - MARGIN, FOOTER_Y - 4)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...C_MUTED)
    doc.text(`Tukifac · Página ${i} de ${n}`, PAGE_W / 2, FOOTER_Y, { align: 'center' })
    doc.setTextColor(0, 0, 0)
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

function drawDataTable(
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
  doc.setFontSize(7.2)
  doc.setTextColor(51, 65, 85)
  headers.forEach((h, i) => {
    doc.text(h, x + 1.8, y.v + 0.5)
    if (i < headers.length - 1) {
      doc.line(x + colWidths[i], y.v - 4.5, x + colWidths[i], y.v + headerH - 4.5)
    }
    x += colWidths[i]
  })
  y.v += headerH

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  for (let r = 0; r < rows.length; r++) {
    ensureSpace(doc, y, rowH + 1)
    if (r % 2 === 1) {
      doc.setFillColor(...C_ROW_ALT)
      doc.rect(x0, y.v - 4.2, totalW, rowH, 'F')
    }
    x = x0
    rows[r].forEach((cell, i) => {
      const w = colWidths[i] - 3
      const isLast = i === headers.length - 1
      doc.setTextColor(...C_TEXT)
      const lines = doc.splitTextToSize(String(cell ?? ''), w)
      const line = lines.length > 1 ? `${lines[0]}…` : lines[0] || '—'
      if (isLast) {
        doc.text(line, x + colWidths[i] - 1.5, y.v, { align: 'right', maxWidth: w })
      } else {
        doc.text(line, x + 1.5, y.v)
      }
      if (i < headers.length - 1) {
        doc.setDrawColor(236, 240, 245)
        doc.line(x + colWidths[i], y.v - 4.2, x + colWidths[i], y.v + rowH - 4.2)
      }
      x += colWidths[i]
    })
    doc.setDrawColor(...C_BORDER)
    doc.line(x0, y.v + rowH - 4.2, x0 + totalW, y.v + rowH - 4.2)
    y.v += rowH
  }
  y.v += 4
}

function drawKeyValueGrid(doc: jsPDF, y: { v: number }, pairs: { k: string; v: string }[]) {
  const colW = INNER_W / 2 - 2
  const lineH = 5.5
  for (let i = 0; i < pairs.length; i += 2) {
    ensureSpace(doc, y, lineH + 1)
    const left = pairs[i]
    const right = pairs[i + 1]
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C_MUTED)
    doc.text(left.k, MARGIN, y.v)
    if (right) doc.text(right.k, MARGIN + INNER_W / 2 + 2, y.v)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C_TEXT)
    doc.setFontSize(8.5)
    const vLines = doc.splitTextToSize(left.v, colW)
    doc.text(vLines[0] ?? '—', MARGIN, y.v + 4)
    if (right) {
      const v2 = doc.splitTextToSize(right.v, colW)
      doc.text(v2[0] ?? '—', MARGIN + INNER_W / 2 + 2, y.v + 4)
    }
    y.v += lineH + 5
  }
}

function drawSummaryBoxes(
  doc: jsPDF,
  y: { v: number },
  items: { label: string; value: string; tone?: 'default' | 'green' | 'red' | 'strong' }[],
) {
  const gap = 3
  const n = items.length
  const boxW = (INNER_W - gap * (n - 1)) / n
  const boxH = 20
  ensureSpace(doc, y, boxH + 4)
  let bx = MARGIN
  for (const it of items) {
    doc.setDrawColor(...C_BORDER)
    doc.setFillColor(249, 250, 251)
    doc.roundedRect(bx, y.v, boxW, boxH, 1.2, 1.2, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...C_MUTED)
    doc.text(it.label, bx + 2.5, y.v + 6)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(it.tone === 'strong' ? 11 : 10)
    if (it.tone === 'green') doc.setTextColor(21, 128, 61)
    else if (it.tone === 'red') doc.setTextColor(185, 28, 28)
    else doc.setTextColor(...C_TEXT)
    doc.text(it.value, bx + 2.5, y.v + 15)
    doc.setTextColor(0, 0, 0)
    bx += boxW + gap
  }
  y.v += boxH + 6
}

function isEfectivo(m: string): boolean {
  const c = (m || '').toLowerCase()
  return c === 'efectivo' || c === 'cash'
}

function mapIncomeRows(rows: IncomeDetailRow[]): string[][] {
  return (rows ?? []).map(r => [
    fmtDate(r.date),
    r.doc_number || '—',
    r.reference || '—',
    formatPaymentMethodLabel(r.payment_method),
    money(r.amount),
  ])
}

export function generateCashSessionReportPdf(report: CashSessionReport, opts?: { companyName?: string }): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const y = { v: MARGIN }

  doc.setFillColor(...C_HEADER)
  doc.rect(0, 0, PAGE_W, 30, 'F')
  doc.setTextColor(...C_HEADER_TEXT)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('REPORTE DE CAJA — RESUMEN DE SESIÓN', MARGIN, 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text(opts?.companyName?.trim() || 'Resumen de sesión', MARGIN, 21)
  doc.setFontSize(8)
  doc.setTextColor(203, 213, 225)
  doc.text(`Generado: ${new Date().toLocaleString()}`, MARGIN, 27)
  doc.setTextColor(0, 0, 0)
  y.v = 36

  const s = report.session
  const spotTotal = report.detraction?.total_spot ?? report.totals.total_detraccion_spot ?? 0
  const directSalesTotal = report.totals.total_sales_direct ?? report.totals.total_sales ?? 0
  const commercialTotal = report.totals.total_sales_commercial ?? directSalesTotal + spotTotal
  const directIncomeRows = (report.income_detail ?? []).filter(
    row => row.type === 'venta' && !isDetractionPaymentMethod(row.payment_method),
  )

  drawSectionTitle(doc, y, 'Datos de la sesión')
  drawKeyValueGrid(doc, y, [
    { k: 'Sucursal', v: s.branch_name || '—' },
    { k: 'Nº sesión', v: String(s.id) },
    { k: 'Responsable apertura', v: s.opened_by_user_name || '—' },
    { k: 'Estado', v: s.status === 'open' ? 'Abierta' : 'Cerrada' },
    { k: 'Apertura', v: fmtDate(s.opened_at) },
    { k: 'Cierre', v: s.closed_at ? fmtDate(s.closed_at) : '—' },
    { k: 'Monto inicial', v: money(s.opening_balance) },
  ])

  const { opening, closing } = parseSessionNotesBlock(s.notes)
  if (opening || closing) {
    drawSectionTitle(doc, y, 'Notas')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...C_TEXT)
    if (opening) {
      ensureSpace(doc, y, 12)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...C_MUTED)
      doc.text('Apertura', MARGIN, y.v)
      y.v += 4
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...C_TEXT)
      for (const ln of doc.splitTextToSize(opening, INNER_W)) {
        ensureSpace(doc, y, 5)
        doc.text(ln, MARGIN, y.v)
        y.v += 4.5
      }
      y.v += 2
    }
    if (closing) {
      ensureSpace(doc, y, 12)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...C_MUTED)
      doc.text('Cierre', MARGIN, y.v)
      y.v += 4
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...C_TEXT)
      for (const ln of doc.splitTextToSize(closing, INNER_W)) {
        ensureSpace(doc, y, 5)
        doc.text(ln, MARGIN, y.v)
        y.v += 4.5
      }
      y.v += 2
    }
  }

  drawSectionTitle(doc, y, 'Totales generales')
  drawSummaryBoxes(doc, y, [
    { label: 'Cobrado directo', value: money(directSalesTotal), tone: 'green' },
    { label: DETRACCION_PAYMENT_METHOD_NAME, value: money(spotTotal) },
    { label: 'Total comercial', value: money(commercialTotal), tone: 'strong' },
    { label: 'Total ingresos caja', value: money(report.totals.total_income), tone: 'green' },
    { label: 'Total egresos', value: money(report.totals.total_expense), tone: 'red' },
    { label: 'Saldo final', value: money(report.totals.final_balance), tone: 'strong' },
  ])

  if (spotTotal > 0) {
    drawSectionTitle(doc, y, `${DETRACCION_PAYMENT_METHOD_NAME} — trazabilidad`)
    ensureSpace(doc, y, 8)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...C_MUTED)
    doc.text('Montos de detracción registrados en ventas 1001. No entran al arqueo de caja.', MARGIN, y.v)
    y.v += 5
    const detRows = (report.detraction?.sales ?? []).map(r => [
      fmtDate(r.date),
      r.doc_number || '—',
      money(r.amount),
    ])
    if (detRows.length === 0) {
      doc.text('Sin registros de detracción.', MARGIN, y.v)
      y.v += 8
    } else {
      drawDataTable(doc, y, ['Fecha', 'Factura', 'Monto'], detRows, [58, 78, 38])
    }
  }

  let ingEfe = 0
  let egreEfe = 0
  directIncomeRows.forEach(row => {
    if (isEfectivo(row.payment_method)) ingEfe += row.amount
  })
  report.expense_detail?.forEach(row => {
    if (isEfectivo(row.payment_method)) egreEfe += row.amount
  })
  report.cash_physical?.manual_income?.forEach(row => {
    if (isEfectivo(row.payment_method)) ingEfe += row.amount
  })
  const saldoEfe = ingEfe - egreEfe

  drawSectionTitle(doc, y, 'Efectivo en caja (para arqueo)')
  ensureSpace(doc, y, 8)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...C_MUTED)
  doc.text('Solo pagos directos en efectivo; excluye SPOT, Yape, Plin y bancos.', MARGIN, y.v)
  y.v += 5
  drawSummaryBoxes(doc, y, [
    { label: 'Ingresos efectivo', value: money(ingEfe), tone: 'green' },
    { label: 'Egresos efectivo', value: money(egreEfe), tone: 'red' },
    { label: 'Saldo efectivo', value: money(saldoEfe), tone: 'strong' },
  ])

  drawSectionTitle(doc, y, 'Totales por método de pago')
  const methodSections = [
    { title: 'Ventas', rows: report.totals_by_method.sales ?? [] },
    { title: 'Compras', rows: report.totals_by_method.purchases ?? [] },
    { title: 'Movimientos de caja', rows: report.totals_by_method.movements ?? [] },
  ]
  for (const sec of methodSections) {
    ensureSpace(doc, y, 8)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...C_MUTED)
    doc.text(sec.title, MARGIN, y.v)
    y.v += 4
    if (sec.rows.length === 0) {
      doc.setFont('helvetica', 'normal')
      doc.text('Sin datos', MARGIN, y.v)
      y.v += 6
    } else {
      drawDataTable(
        doc,
        y,
        ['Método', 'Monto'],
        sec.rows.map(x => [formatPaymentMethodLabel(x.method), money(x.total)]),
        [120, 54],
      )
    }
  }

  const cash = report.cash_physical
  const electronic = report.electronic
  const incomeCols = [38, 28, 58, 28, 26]
  const incomeHeaders = ['Fecha / hora', 'Documento', 'Referencia', 'Método', 'Monto']

  drawSectionTitle(doc, y, 'Detalle de ingresos (cobro directo)')
  const directRows = mapIncomeRows(directIncomeRows)
  if (directRows.length === 0) {
    ensureSpace(doc, y, 6)
    doc.setFontSize(8.5)
    doc.setTextColor(...C_MUTED)
    doc.text('Sin ingresos de cobro directo.', MARGIN, y.v)
    y.v += 8
  } else {
    drawDataTable(doc, y, incomeHeaders, directRows, incomeCols)
  }

  drawSectionTitle(doc, y, 'Ventas en efectivo (caja física)')
  const cashSalesRows = mapIncomeRows(cash?.cash_sales ?? [])
  if (cashSalesRows.length === 0) {
    ensureSpace(doc, y, 6)
    doc.setTextColor(...C_MUTED)
    doc.text('Sin ventas en efectivo en esta sesión.', MARGIN, y.v)
    y.v += 8
  } else {
    drawDataTable(doc, y, incomeHeaders, cashSalesRows, incomeCols)
  }

  drawSectionTitle(doc, y, 'Ventas por medios electrónicos')
  const electronicSalesRows = mapIncomeRows(electronic?.sales ?? [])
  if (electronicSalesRows.length === 0) {
    ensureSpace(doc, y, 6)
    doc.setTextColor(...C_MUTED)
    doc.text('Sin ventas por Yape, Plin, tarjeta u otros medios.', MARGIN, y.v)
    y.v += 8
  } else {
    drawDataTable(doc, y, incomeHeaders, electronicSalesRows, incomeCols)
  }

  const manualIncome = cash?.manual_income ?? []
  if (manualIncome.length > 0) {
    drawSectionTitle(doc, y, 'Ingresos manuales (caja)')
    drawDataTable(doc, y, incomeHeaders, mapIncomeRows(manualIncome), incomeCols)
  }

  drawSectionTitle(doc, y, 'Detalle de egresos')
  const expenseCols = [34, 22, 26, 58, 22, 24]
  const expenseHeaders = ['Fecha / hora', 'Tipo', 'Documento', 'Referencia', 'Método', 'Monto']
  const expenseSource = cash?.expenses ?? report.expense_detail ?? []
  const expenseRows = expenseSource.map(r => [
    fmtDate(r.date),
    r.type,
    r.doc_number || '—',
    r.reference || '—',
    formatPaymentMethodLabel(r.payment_method),
    money(r.amount),
  ])
  if (expenseRows.length === 0) {
    ensureSpace(doc, y, 6)
    doc.setTextColor(...C_MUTED)
    doc.text('Sin egresos en esta sesión.', MARGIN, y.v)
    y.v += 8
  } else {
    drawDataTable(doc, y, expenseHeaders, expenseRows, expenseCols)
  }

  if ((report.cancelled_sales_detail ?? []).length > 0) {
    drawSectionTitle(doc, y, 'Ventas anuladas')
    const voidCols = [32, 36, 24, 24, 70]
    const voidHeaders = ['Fecha / hora', 'Comprobante', 'Método', 'Monto', 'Referencia']
    const voidRows = (report.cancelled_sales_detail ?? []).map(r => [
      fmtDate(r.date),
      r.doc_number || '—',
      formatPaymentMethodLabel(r.payment_method),
      money(r.amount),
      r.reference || '—',
    ])
    drawDataTable(doc, y, voidHeaders, voidRows, voidCols)
  }

  drawFooterOnAllPages(doc)
  return doc
}

function sanitizeFilenamePart(raw: string, maxLen = 48): string {
  const s = raw
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, maxLen)
  return s || 'caja'
}

export function buildCashSessionReportPdfFilename(report: CashSessionReport): string {
  const now = new Date()
  const y = now.getFullYear()
  const mo = String(now.getMonth() + 1).padStart(2, '0')
  const da = String(now.getDate()).padStart(2, '0')
  const h = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  const se = String(now.getSeconds()).padStart(2, '0')
  const nombreCaja = sanitizeFilenamePart(report.session.branch_name || `Sesion-${report.session.id}`)
  return `reporte-caja-resumen_${nombreCaja}_${y}-${mo}-${da}_${h}-${mi}-${se}.pdf`
}

export function downloadCashSessionReportPdf(report: CashSessionReport, opts?: { companyName?: string }): void {
  const doc = generateCashSessionReportPdf(report, opts)
  doc.save(buildCashSessionReportPdfFilename(report))
}
