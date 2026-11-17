import { jsPDF } from 'jspdf'
import JsBarcode from 'jsbarcode'
import { openPdfViewer } from '@/components/pdf/pdfViewerStore'

/**
 * Generador de etiquetas para impresoras de etiquetas autoadhesivas.
 *
 * Un solo diseño (`drawLabel`) se pinta sobre una "pluma" abstracta con dos destinos: el canvas de la vista previa
 * del modal y el PDF final. Así lo que se ve en pantalla es exactamente lo que sale impreso.
 */

export type LabelFormat = 'name_price' | 'name_price_barcode' | 'barcode'

export const LABEL_FORMATS: { id: LabelFormat; title: string; hint: string }[] = [
  { id: 'name_price', title: 'Nombre y precio', hint: 'Sin código de barras' },
  { id: 'name_price_barcode', title: 'Nombre, precio y código', hint: 'Etiqueta completa' },
  { id: 'barcode', title: 'Solo código de barras', hint: 'Para pegar en el producto' },
]

export interface LabelItem {
  name: string
  price: number
  code: string
}

/** Mínimo y máximo de lado de etiqueta aceptados (mm). */
export const LABEL_MIN_MM = 10
export const LABEL_MAX_MM = 300
export const LABEL_MAX_COLUMNS = 3
/** Tope de etiquetas por generación (cada una es una imagen de código de barras en el PDF). */
export const LABEL_MAX_TOTAL = 3000

interface TextOpts {
  size: number // pt
  bold?: boolean
  align?: 'left' | 'center' | 'right'
}

interface Pen {
  text(str: string, x: number, y: number, o: TextOpts): void
  width(str: string, o: TextOpts): number
  /** Código de barras: `modules` es la secuencia de módulos («1» = barra, «0» = espacio) y se dibuja en el rectángulo dado. */
  bars(modules: string, x: number, y: number, w: number, h: number): void
}

const PT_TO_MM = 25.4 / 72
const PAD_MM = 1.5

export function formatLabelPrice(n: number): string {
  return `S/ ${Number(n).toFixed(2)}`
}

/**
 * Módulos del Code128 (EAN13 exigiría 13 dígitos; Code128 admite códigos alfanuméricos). Se dibujan barra por barra y no
 * como imagen escalada: así quedan exactas en el PDF (vectorial) y con módulos de ancho entero al imprimir en la
 * ticketera, que es lo que permite que el lector las lea. Devuelve null si no se puede codificar.
 */
const barcodeCache = new Map<string, string | null>()
export function barcodeModules(code: string): string | null {
  const key = code.trim()
  if (barcodeCache.has(key)) return barcodeCache.get(key) ?? null
  let modules: string | null = null
  try {
    const out: { encodings?: { data: string }[] } = {}
    JsBarcode(out, key, { format: 'CODE128', displayValue: false, margin: 0 })
    const joined = (out.encodings ?? []).map((e) => e.data).join('')
    modules = joined && /^[01]+$/.test(joined) ? joined : null
  } catch {
    modules = null
  }
  barcodeCache.set(key, modules)
  return modules
}

/** Parte `str` en líneas que caben en `maxW`. */
function wrap(pen: Pen, str: string, maxW: number, o: TextOpts): string[] {
  const words = str.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (pen.width(next, o) <= maxW || !cur) {
      cur = next
    } else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines
}

/** Mayor tamaño (≤ maxPt) con el que el texto cabe en `maxLines` líneas y en `maxH` mm de alto. */
function fitText(pen: Pen, str: string, maxW: number, maxH: number, maxLines: number, maxPt: number, minPt = 4, bold = true) {
  for (let size = maxPt; size >= minPt; size -= 0.5) {
    const o = { size, bold }
    const lines = wrap(pen, str, maxW, o)
    const lineH = size * PT_TO_MM * 1.15
    const widest = Math.max(0, ...lines.map((l) => pen.width(l, o)))
    if (lines.length <= maxLines && lines.length * lineH <= maxH && widest <= maxW) return { size, lines, lineH }
  }
  // No cabe ni con el mínimo: se recorta a las líneas permitidas con "…".
  const o = { size: minPt, bold }
  const lines = wrap(pen, str, maxW, o).slice(0, maxLines)
  if (lines.length) {
    let last = lines[lines.length - 1]
    while (last.length > 1 && pen.width(`${last}…`, o) > maxW) last = last.slice(0, -1)
    lines[lines.length - 1] = `${last}…`
  }
  return { size: minPt, lines, lineH: minPt * PT_TO_MM * 1.15 }
}

function drawBlock(pen: Pen, lines: string[], size: number, lineH: number, cx: number, top: number, bold: boolean) {
  lines.forEach((l, i) => pen.text(l, cx, top + (i + 1) * lineH - lineH * 0.22, { size, bold, align: 'center' }))
  return top + lines.length * lineH
}

/** Pinta una etiqueta de `w`×`h` mm con origen (ox, oy). */
export function drawLabel(pen: Pen, format: LabelFormat, w: number, h: number, item: LabelItem, ox = 0, oy = 0): void {
  // La etiqueta de solo código lleva más aire alrededor: es la que se pega sola y el lector necesita zona de silencio.
  const barcodeOnly = format === 'barcode'
  const pad = barcodeOnly ? Math.min(1.5, w * 0.05, h * 0.08) : Math.min(PAD_MM, w * 0.06, h * 0.06)
  const innerW = w - 2 * pad
  const innerH = h - 2 * pad
  const cx = ox + w / 2
  const top = oy + pad
  const code = item.code.trim()
  const bars = code ? barcodeModules(code) : null

  const drawBars = (y: number, bh: number, withCode: boolean) => {
    if (!bars) {
      // Sin código válido: se avisa en la etiqueta en vez de dejar un hueco sin explicación.
      pen.text(code ? 'Código no válido' : 'Sin código', cx, y + bh / 2, { size: 6, align: 'center' })
      return
    }
    const textH = withCode ? Math.min(3.2, bh * 0.28) : 0
    // Zona de silencio a los lados de las barras (más ancha en la etiqueta de solo código) y aire arriba/abajo.
    const sideQuiet = Math.min(innerW * (barcodeOnly ? 0.05 : 0.07), barcodeOnly ? 3 : 6)
    const vGap = barcodeOnly ? Math.min(1.5, bh * 0.08) : Math.min(0.8, bh * 0.05)
    const barsH = bh - textH
    pen.bars(bars, ox + pad + sideQuiet, y + vGap, innerW - 2 * sideQuiet, Math.max(2, barsH - (withCode ? 0.4 : 0) - 2 * vGap))
    if (withCode) {
      const fit = fitText(pen, code, innerW, textH, 1, 7, 4, false)
      drawBlock(pen, fit.lines, fit.size, fit.lineH, cx, y + barsH, false)
    }
  }

  if (format === 'barcode') {
    drawBars(top, innerH, true)
    return
  }

  if (format === 'name_price') {
    const priceH = innerH * 0.42
    const nameH = innerH - priceH - 0.8
    const name = fitText(pen, item.name, innerW, nameH, 3, 13)
    const nameBottom = drawBlock(pen, name.lines, name.size, name.lineH, cx, top + (nameH - name.lines.length * name.lineH) / 2, true)
    const price = fitText(pen, formatLabelPrice(item.price), innerW, priceH, 1, 30)
    drawBlock(pen, price.lines, price.size, price.lineH, cx, Math.max(nameBottom + 0.4, top + nameH + 0.8 + (priceH - price.lineH) / 2), true)
    return
  }

  // name_price_barcode: nombre arriba, precio al centro, código abajo.
  const nameH = innerH * 0.3
  const priceH = innerH * 0.26
  const barsH = innerH - nameH - priceH - 1
  const name = fitText(pen, item.name, innerW, nameH, 2, 10)
  drawBlock(pen, name.lines, name.size, name.lineH, cx, top + (nameH - name.lines.length * name.lineH) / 2, true)
  const price = fitText(pen, formatLabelPrice(item.price), innerW, priceH, 1, 20)
  drawBlock(pen, price.lines, price.size, price.lineH, cx, top + nameH + 0.5 + (priceH - price.lineH) / 2, true)
  drawBars(top + nameH + priceH + 1, barsH, true)
}

/* ───────────────────────────── Destinos de dibujo ───────────────────────────── */

/**
 * Pluma sobre un canvas. Con `crisp` (impresión) el código de barras usa módulos de ancho ENTERO en puntos y se centra:
 * un ancho fraccionario se deformaría al pasar a blanco y negro y el lector no podría leerlo.
 */
function createCanvasPen(ctx: CanvasRenderingContext2D, pxPerMm: number, crisp: boolean): Pen {
  const fontOf = (o: TextOpts) => `${o.bold ? 'bold ' : ''}${o.size * PT_TO_MM * pxPerMm}px Helvetica, Arial, sans-serif`
  return {
    width(str, o) {
      ctx.font = fontOf(o)
      return ctx.measureText(str).width / pxPerMm
    },
    text(str, x, y, o) {
      ctx.font = fontOf(o)
      ctx.textAlign = o.align ?? 'left'
      ctx.fillStyle = '#000'
      ctx.fillText(str, x * pxPerMm, y * pxPerMm)
    },
    bars(modules, x, y, bw, bh) {
      const totalPx = bw * pxPerMm
      const mw = crisp ? Math.max(1, Math.floor(totalPx / modules.length)) : totalPx / modules.length
      const startX = x * pxPerMm + (crisp ? Math.floor((totalPx - mw * modules.length) / 2) : 0)
      ctx.fillStyle = '#000'
      for (let i = 0; i < modules.length; ) {
        if (modules[i] !== '1') {
          i++
          continue
        }
        let j = i
        while (j < modules.length && modules[j] === '1') j++
        ctx.fillRect(startX + i * mw, y * pxPerMm, (j - i) * mw, bh * pxPerMm)
        i = j
      }
    },
  }
}

function blankCanvas(canvas: HTMLCanvasElement, wMm: number, hMm: number, pxPerMm: number): CanvasRenderingContext2D | null {
  canvas.width = Math.round(wMm * pxPerMm)
  canvas.height = Math.round(hMm * pxPerMm)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000'
  return ctx
}

/** Pinta una etiqueta en un canvas (vista previa). `pxPerMm` ya incluye el factor de pantalla. */
export function paintLabelPreview(canvas: HTMLCanvasElement, format: LabelFormat, w: number, h: number, item: LabelItem, pxPerMm: number): void {
  const ctx = blankCanvas(canvas, w, h, pxPerMm)
  if (!ctx) return
  drawLabel(createCanvasPen(ctx, pxPerMm, false), format, w, h, item)
}

/**
 * Pinta una FILA de etiquetas (1 a 3 lado a lado) para imprimirla: `pxPerMm` es la resolución de la impresora (203 dpi ≈ 8
 * puntos por mm) y las barras salen con módulos enteros. La fila mide columnas × ancho + separaciones.
 */
export function paintLabelRow(
  canvas: HTMLCanvasElement,
  job: Pick<LabelJob, 'format' | 'width' | 'height' | 'gap'>,
  items: LabelItem[],
  pxPerMm: number,
): void {
  const rowW = items.length * job.width + (items.length - 1) * job.gap
  const ctx = blankCanvas(canvas, rowW, job.height, pxPerMm)
  if (!ctx) return
  const pen = createCanvasPen(ctx, pxPerMm, true)
  items.forEach((item, i) => drawLabel(pen, job.format, job.width, job.height, item, i * (job.width + job.gap), 0))
}

export interface LabelJob {
  format: LabelFormat
  /** Ancho y alto de cada etiqueta (mm). */
  width: number
  height: number
  /** Etiquetas por fila (1 a 3). */
  columns: number
  /** Separación horizontal entre columnas (mm). */
  gap: number
  /** Una entrada por producto con la cantidad de copias que se quiere. */
  lines: { item: LabelItem; quantity: number }[]
}

export function totalLabels(job: Pick<LabelJob, 'lines'>): number {
  return job.lines.reduce((s, l) => s + Math.max(0, Math.floor(l.quantity)), 0)
}

/**
 * PDF para impresora de etiquetas: cada página es una fila de etiquetas (una columna = la etiqueta sola, como
 * sale de un rollo). Con 2 o 3 columnas la página es más ancha y lleva las etiquetas lado a lado.
 */
export function buildLabelsPdf(job: LabelJob): jsPDF {
  const { width: w, height: h, columns, gap } = job
  const pageW = columns * w + (columns - 1) * gap
  const doc = new jsPDF({ unit: 'mm', format: [pageW, h], orientation: pageW > h ? 'landscape' : 'portrait', compress: true })

  const pen: Pen = {
    width(str, o) {
      doc.setFont('helvetica', o.bold ? 'bold' : 'normal')
      doc.setFontSize(o.size)
      return doc.getTextWidth(str)
    },
    text(str, x, y, o) {
      doc.setFont('helvetica', o.bold ? 'bold' : 'normal')
      doc.setFontSize(o.size)
      doc.setTextColor(0, 0, 0)
      doc.text(str, x, y, { align: o.align ?? 'left' })
    },
    bars(modules, x, y, bw, bh) {
      // Vectorial: cada tramo de barras es un rectángulo del ancho exacto (en mm), sin imagen que se pixele.
      const mw = bw / modules.length
      doc.setFillColor(0, 0, 0)
      for (let i = 0; i < modules.length; ) {
        if (modules[i] !== '1') {
          i++
          continue
        }
        let j = i
        while (j < modules.length && modules[j] === '1') j++
        doc.rect(x + i * mw, y, (j - i) * mw, bh, 'F')
        i = j
      }
    },
  }

  const labels: LabelItem[] = []
  for (const l of job.lines) {
    const n = Math.max(0, Math.floor(l.quantity))
    for (let i = 0; i < n; i++) labels.push(l.item)
  }

  labels.forEach((item, i) => {
    const col = i % columns
    if (i > 0 && col === 0) doc.addPage([pageW, h], pageW > h ? 'landscape' : 'portrait')
    drawLabel(pen, job.format, w, h, item, col * (w + gap), 0)
  })
  return doc
}

export function openLabelsPdf(job: LabelJob): void {
  const doc = buildLabelsPdf(job)
  const url = URL.createObjectURL(doc.output('blob'))
  openPdfViewer({
    url,
    title: 'Etiquetas de productos',
    fileName: `etiquetas-${job.width}x${job.height}mm.pdf`,
    onClose: () => URL.revokeObjectURL(url),
  })
}
