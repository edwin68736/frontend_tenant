import { jsPDF } from 'jspdf'
import { downloadJsPdf } from '@/utils/downloadBlob'

const PAGE_W = 297 // A4 apaisado
const PAGE_H = 210
const MARGIN = 8
const FONT_BODY = 7.5
const FONT_HEADER = 7.5
const ROW_H = 5.4
const HEADER_H = 8.4
const FOOTER_RESERVED = 9 // espacio para "Página x de y"

type Rgb = [number, number, number]

export interface ExportColumn<T = Record<string, unknown>> {
  key: keyof T | string
  label: string
  /** Ancho fijo en mm (mantiene el comportamiento anterior). */
  width?: number
  /** Ancho relativo: las columnas con `weight` se reparten el ancho que dejan las de `width`. */
  weight?: number
  /** Alineación del texto (los montos conviene `right`). */
  align?: 'left' | 'right' | 'center'
  format?: (val: unknown, row: T) => string | number
}

export interface ExportPdfOptions<T> {
  /** Líneas bajo el título: periodo, filtros aplicados, etc. */
  subtitle?: string[]
  /** Recuadros de resumen (totales, por método de pago…) sobre la tabla. */
  summary?: { label: string; value: string }[]
  /**
   * Fila de totales al final, una celda por columna (texto o número; los números salen con 2
   * decimales). Mismo contenido que se pasa al Excel.
   */
  footerRow?: (string | number)[]
  /** Color del texto de una fila (p. ej. gris para las anuladas). */
  rowTextColor?: (row: T) => Rgb | undefined
}

function fmtNumber(n: number): string {
  return n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function ellipsize(doc: jsPDF, text: string, maxW: number): string {
  if (maxW <= 0) return ''
  if (doc.getTextWidth(text) <= maxW) return text
  let s = text
  while (s.length > 1 && doc.getTextWidth(s + '…') > maxW) s = s.slice(0, -1)
  return s + '…'
}

/** Anchos en mm: los fijos se respetan y el resto se reparte por `weight` (o por igual). */
function resolveWidths<T>(columns: ExportColumn<T>[], total: number): number[] {
  const fixed = columns.reduce((s, c) => s + (c.width ?? 0), 0)
  const flex = columns.filter((c) => c.width == null)
  const weightSum = flex.reduce((s, c) => s + (c.weight ?? 1), 0)
  const left = Math.max(total - fixed, 0)
  return columns.map((c) => c.width ?? (left * (c.weight ?? 1)) / (weightSum || 1))
}

export async function exportTableToPdf<T extends object>(
  title: string,
  columns: ExportColumn<T>[],
  data: T[],
  filename?: string,
  options: ExportPdfOptions<T> = {},
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const contentW = PAGE_W - 2 * MARGIN
  const widths = resolveWidths(columns, contentW)
  const bottom = PAGE_H - MARGIN - FOOTER_RESERVED
  const generated = new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
  const outName = filename ?? `${title.replace(/\s+/g, '-')}.pdf`

  let y = MARGIN + 4

  // ── Encabezado ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(17, 24, 39)
  doc.text(title, MARGIN, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(107, 114, 128)
  doc.text(`Generado: ${generated}`, PAGE_W - MARGIN, y, { align: 'right' })
  y += 5
  for (const line of options.subtitle ?? []) {
    doc.setFontSize(8.5)
    doc.setTextColor(75, 85, 99)
    doc.text(ellipsize(doc, line, contentW), MARGIN, y)
    y += 4.2
  }
  y += 1.5

  // ── Resumen en recuadros ───────────────────────────────────────────────────
  const summary = options.summary ?? []
  if (summary.length > 0) {
    const perRow = Math.min(summary.length, 6)
    const gap = 3
    const boxW = (contentW - gap * (perRow - 1)) / perRow
    const boxH = 11.5
    summary.forEach((s, i) => {
      const col = i % perRow
      const rowIdx = Math.floor(i / perRow)
      const bx = MARGIN + col * (boxW + gap)
      const by = y + rowIdx * (boxH + 2.5)
      doc.setDrawColor(229, 231, 235)
      doc.setFillColor(249, 250, 251)
      doc.roundedRect(bx, by, boxW, boxH, 1.2, 1.2, 'FD')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.2)
      doc.setTextColor(107, 114, 128)
      doc.text(ellipsize(doc, s.label.toUpperCase(), boxW - 4), bx + 2.2, by + 4)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(17, 24, 39)
      doc.text(ellipsize(doc, s.value, boxW - 4), bx + 2.2, by + 9)
    })
    y += Math.ceil(summary.length / perRow) * (boxH + 2.5) + 1.5
  }

  if (data.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(75, 85, 99)
    doc.text('Sin datos para mostrar.', MARGIN, y + 4)
    finishPages(doc, title)
    await downloadJsPdf(doc, outName)
    return
  }

  const drawHeader = () => {
    doc.setFillColor(31, 41, 55)
    doc.rect(MARGIN, y, contentW, HEADER_H, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(FONT_HEADER)
    doc.setTextColor(255, 255, 255)
    let x = MARGIN
    columns.forEach((col, i) => {
      // Hasta 2 líneas: "Total facturado" o "Detracción SPOT" no caben en una columna de 15 mm.
      const lines = (doc.splitTextToSize(col.label, widths[i] - 2.4) as string[]).slice(0, 2)
      if (lines.length === 1) {
        drawCell(doc, lines[0], x, widths[i], y + HEADER_H / 2 + 1.1, col.align)
      } else {
        drawCell(doc, ellipsize(doc, lines[0], widths[i] - 2.4), x, widths[i], y + 3.1, col.align)
        drawCell(doc, ellipsize(doc, lines[1], widths[i] - 2.4), x, widths[i], y + 6.2, col.align)
      }
      x += widths[i]
    })
    y += HEADER_H
  }

  drawHeader()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT_BODY)

  // ── Filas ──────────────────────────────────────────────────────────────────
  data.forEach((row, idx) => {
    if (y + ROW_H > bottom) {
      doc.addPage('a4', 'landscape')
      y = MARGIN + 2
      drawHeader()
    }
    if (idx % 2 === 1) {
      doc.setFillColor(243, 244, 246)
      doc.rect(MARGIN, y, contentW, ROW_H, 'F')
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(FONT_BODY)
    const color = options.rowTextColor?.(row) ?? [31, 41, 55]
    doc.setTextColor(color[0], color[1], color[2])
    let x = MARGIN
    columns.forEach((col, i) => {
      const raw = row[col.key as keyof T]
      const text = col.format ? String(col.format(raw, row)) : String(raw ?? '')
      drawCell(doc, ellipsize(doc, text, widths[i] - 2.4), x, widths[i], y + ROW_H / 2 + 1.1, col.align)
      x += widths[i]
    })
    y += ROW_H
  })

  // ── Fila de totales ────────────────────────────────────────────────────────
  if (options.footerRow) {
    if (y + ROW_H + 1 > bottom) {
      doc.addPage('a4', 'landscape')
      y = MARGIN + 2
      drawHeader()
    }
    doc.setDrawColor(31, 41, 55)
    doc.setLineWidth(0.4)
    doc.line(MARGIN, y, MARGIN + contentW, y)
    doc.setFillColor(229, 231, 235)
    doc.rect(MARGIN, y, contentW, ROW_H + 0.8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(FONT_BODY + 0.3)
    doc.setTextColor(17, 24, 39)
    let x = MARGIN
    columns.forEach((col, i) => {
      const cell = options.footerRow?.[i]
      const text = typeof cell === 'number' ? fmtNumber(cell) : String(cell ?? '')
      drawCell(doc, ellipsize(doc, text, widths[i] - 2.4), x, widths[i], y + (ROW_H + 0.8) / 2 + 1.1, typeof cell === 'number' ? 'right' : col.align)
      x += widths[i]
    })
    y += ROW_H + 0.8
  }

  finishPages(doc, title)
  await downloadJsPdf(doc, outName)
}

function drawCell(doc: jsPDF, text: string, x: number, w: number, baseline: number, align: ExportColumn['align'] = 'left') {
  if (align === 'right') doc.text(text, x + w - 1.2, baseline, { align: 'right' })
  else if (align === 'center') doc.text(text, x + w / 2, baseline, { align: 'center' })
  else doc.text(text, x + 1.2, baseline)
}

/** Pie de cada página: título a la izquierda y "Página x de y" a la derecha. */
function finishPages(doc: jsPDF, title: string) {
  const n = doc.getNumberOfPages()
  for (let p = 1; p <= n; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(156, 163, 175)
    doc.setDrawColor(229, 231, 235)
    doc.setLineWidth(0.2)
    doc.line(MARGIN, PAGE_H - MARGIN - 4.5, PAGE_W - MARGIN, PAGE_H - MARGIN - 4.5)
    doc.text(title, MARGIN, PAGE_H - MARGIN - 1)
    doc.text(`Página ${p} de ${n}`, PAGE_W - MARGIN, PAGE_H - MARGIN - 1, { align: 'right' })
  }
}
