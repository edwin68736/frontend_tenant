import {
  getConfiguredPrinter,
  isNativePrintAvailable,
  listInstalledPrinters,
  sendEscPosPayload,
} from '@/services/printers.service'
import { normalizeSlot } from '@/services/printers/storage'
import { resolvePrinterConfig } from '@/services/printers/resolve'
import type { PrinterConfig, PrinterKind, PrinterPaperWidth } from '@/services/printers/types'
import { paintLabelRow, type LabelItem, type LabelJob } from '@/utils/productLabels'

/**
 * Impresión directa de etiquetas por la ticketera (ESC/POS, imagen). Reutiliza el transporte de los comprobantes
 * (`sendEscPosPayload`), así que funciona igual en Tauri/Windows, Android (red o Bluetooth) y navegador con el Servidor de
 * impresión. Cada fila de etiquetas se dibuja con el mismo diseño del PDF a la resolución de la impresora (203 dpi) y se
 * envía como imagen; el código de barras sale con módulos enteros para que el lector lo lea.
 */

/** 203 dpi ≈ 8 puntos por mm, la resolución de casi todas las ticketeras térmicas. */
export const LABEL_DOTS_PER_MM = 8

/** Qué hace la impresora al terminar cada etiqueta. */
export type LabelAfter = 'cut' | 'feed' | 'gap' | 'none'
export const LABEL_AFTER_OPTIONS: { id: LabelAfter; label: string; hint: string }[] = [
  { id: 'cut', label: 'Cortar', hint: 'Ticketera con cuchilla: sale cada etiqueta separada.' },
  { id: 'feed', label: 'Avanzar', hint: 'Avanza un poco el papel para arrancar a mano.' },
  { id: 'gap', label: 'Ir a la siguiente etiqueta', hint: 'Rollo de etiquetas con sensor de espacio (comando de avance a la marca).' },
  { id: 'none', label: 'Nada', hint: 'Las etiquetas salen seguidas, sin avance ni corte.' },
]

export type LabelPrinterSource = PrinterKind | 'windows'

export interface LabelPrinterChoice {
  /** documentos = la impresora de comprobantes; 'windows' = otra impresora instalada en este equipo. */
  source: LabelPrinterSource
  printerName?: string
  /** Solo para 'windows': ancho del rollo (en las configuradas se usa el de su configuración). */
  paperWidthMm: PrinterPaperWidth
  after: LabelAfter
}

export const DEFAULT_LABEL_PRINTER: LabelPrinterChoice = { source: 'documentos', paperWidthMm: 80, after: 'cut' }

const STORAGE_KEY = 'tukifac_label_printer_v1'

export function loadLabelPrinterChoice(): LabelPrinterChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LABEL_PRINTER }
    const p = JSON.parse(raw) as Partial<LabelPrinterChoice>
    const source: LabelPrinterSource = ['documentos', 'precuenta', 'comandas', 'windows'].includes(String(p.source)) ? (p.source as LabelPrinterSource) : 'documentos'
    const after: LabelAfter = LABEL_AFTER_OPTIONS.some((o) => o.id === p.after) ? (p.after as LabelAfter) : 'cut'
    return { source, printerName: p.printerName ?? '', paperWidthMm: p.paperWidthMm === 58 ? 58 : 80, after }
  } catch {
    return { ...DEFAULT_LABEL_PRINTER }
  }
}

export function saveLabelPrinterChoice(c: LabelPrinterChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
  } catch {
    /* sin almacenamiento: se usa el valor por defecto la próxima vez */
  }
}

/** Impresora lista para usar según la elección, o null si falta configurarla. */
export function resolveLabelPrinter(c: LabelPrinterChoice): PrinterConfig | null {
  if (c.source === 'windows') {
    const name = (c.printerName ?? '').trim()
    if (!name) return null
    return resolvePrinterConfig(normalizeSlot({ connection: 'windows', printerName: name, paperWidthMm: c.paperWidthMm, autoPrint: true }))
  }
  return getConfiguredPrinter(c.source)
}

/** Ancho útil de impresión (mm): 58 mm ≈ 384 puntos = 48 mm; 80 mm ≈ 576 puntos = 72 mm. */
export function printableWidthMm(paperMm: PrinterPaperWidth): number {
  return paperMm === 58 ? 48 : 72
}

export function printableDots(paperMm: PrinterPaperWidth): number {
  return printableWidthMm(paperMm) * LABEL_DOTS_PER_MM
}

/** Ancho de la fila de etiquetas (mm): columnas × ancho + separaciones. */
export function labelRowWidthMm(job: Pick<LabelJob, 'width' | 'columns' | 'gap'>): number {
  return job.columns * job.width + (job.columns - 1) * job.gap
}

/** Texto corto de cómo se conecta la impresora, para mostrarlo en pantalla. */
export function describePrinter(cfg: PrinterConfig): string {
  if (cfg.connection === 'network') return `Red ${cfg.tcpHost}${cfg.tcpPort ? `:${cfg.tcpPort}` : ''}`
  if (cfg.connection === 'bluetooth') return `Bluetooth ${cfg.bluetoothName || cfg.bluetoothMac}`
  return `Windows · ${cfg.printerName}`
}

export { isNativePrintAvailable, listInstalledPrinters }

/* ───────────────────────── Imagen → ESC/POS ───────────────────────── */

const RASTER_STRIP_ROWS = 128

/** Comandos que se envían tras cada etiqueta. */
export function afterLabelBytes(after: LabelAfter): number[] {
  switch (after) {
    case 'cut':
      return [0x1d, 0x56, 0x41, 0x10] // avanzar y cortar (el mismo corte que usan los comprobantes)
    case 'feed':
      return [0x1b, 0x64, 0x03] // imprimir y avanzar 3 líneas
    case 'gap':
      return [0x0c] // FF: imprimir y avanzar hasta el inicio de la siguiente etiqueta
    default:
      return []
  }
}

/**
 * Convierte píxeles RGBA a comandos de imagen ESC/POS (GS v 0) en blanco y negro, centrados en el ancho imprimible y
 * partidos en franjas de 128 filas (algunas ticketeras se atragantan con imágenes muy altas). Los píxeles más oscuros que
 * `threshold` (0-255) son tinta; el transparente cuenta como blanco.
 */
export function rgbaToEscPosRaster(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, targetDots: number, threshold = 160): Uint8Array {
  const dotsW = Math.max(8, Math.ceil(targetDots / 8) * 8)
  if (width > dotsW) throw new Error(`La imagen (${width} puntos) no cabe en el ancho imprimible (${dotsW})`)
  const left = Math.floor((dotsW - width) / 2)
  const bytesPerRow = dotsW / 8
  const out: number[] = []
  for (let y0 = 0; y0 < height; y0 += RASTER_STRIP_ROWS) {
    const rows = Math.min(RASTER_STRIP_ROWS, height - y0)
    out.push(0x1d, 0x76, 0x30, 0, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, rows & 0xff, (rows >> 8) & 0xff)
    for (let y = 0; y < rows; y++) {
      for (let bx = 0; bx < bytesPerRow; bx++) {
        let byte = 0
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit - left
          if (x < 0 || x >= width) continue
          const i = ((y0 + y) * width + x) * 4
          const alpha = rgba[i + 3] / 255
          // Luminancia sobre blanco: lo transparente se mezcla con blanco.
          const lum = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * alpha + 255 * (1 - alpha)
          if (lum < threshold) byte |= 1 << (7 - bit)
        }
        out.push(byte)
      }
    }
  }
  return Uint8Array.from(out)
}

/** Reparte las etiquetas pedidas en filas de `columns` (la última puede quedar incompleta). */
export function planLabelRows(job: Pick<LabelJob, 'columns' | 'lines'>): LabelItem[][] {
  const labels: LabelItem[] = []
  for (const l of job.lines) {
    const n = Math.max(0, Math.floor(l.quantity))
    for (let i = 0; i < n; i++) labels.push(l.item)
  }
  const rows: LabelItem[][] = []
  for (let i = 0; i < labels.length; i += job.columns) rows.push(labels.slice(i, i + job.columns))
  return rows
}

export interface PrintLabelsResult {
  labels: number
  rows: number
}

/**
 * Imprime las etiquetas en la impresora elegida. Envía por tandas (con avance y posibilidad de cancelar) para no mandar
 * de golpe cientos de imágenes por Bluetooth o por la red.
 */
export async function printLabels(
  job: LabelJob,
  choice: LabelPrinterChoice,
  opts: { onProgress?: (doneRows: number, totalRows: number) => void; signal?: AbortSignal } = {},
): Promise<PrintLabelsResult> {
  if (!isNativePrintAvailable()) {
    throw new Error('La impresión directa necesita la app de escritorio, la de Android o el Servidor de impresión vinculado')
  }
  const cfg = resolveLabelPrinter(choice)
  if (!cfg) throw new Error('No hay una impresora configurada. Configúrala en Ajustes → Impresoras o elige otra')
  const paper: PrinterPaperWidth = cfg.paperWidthMm === 58 ? 58 : 80
  const rowMm = labelRowWidthMm(job)
  if (rowMm > printableWidthMm(paper) + 0.01) {
    throw new Error(`La fila de etiquetas mide ${rowMm.toFixed(1)} mm y el rollo de ${paper} mm imprime hasta ${printableWidthMm(paper)} mm: reduce el ancho o las columnas`)
  }

  const rows = planLabelRows(job)
  if (rows.length === 0) return { labels: 0, rows: 0 }
  const dots = printableDots(paper)
  const after = afterLabelBytes(choice.after)
  // Tandas de ~120 KB: con un rollo de 80 mm y etiquetas de 30 mm son unas 7 filas por envío.
  const rowBytes = (dots / 8) * Math.round(job.height * LABEL_DOTS_PER_MM)
  const perChunk = Math.max(1, Math.floor(120_000 / Math.max(1, rowBytes)))

  let sentRows = 0
  let labels = 0
  for (let i = 0; i < rows.length; i += perChunk) {
    if (opts.signal?.aborted) throw new Error('Impresión cancelada')
    const parts: Uint8Array[] = [Uint8Array.from([0x1b, 0x40])]
    for (const items of rows.slice(i, i + perChunk)) {
      const canvas = document.createElement('canvas')
      paintLabelRow(canvas, job, items, LABEL_DOTS_PER_MM)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No se pudo preparar la etiqueta para imprimir')
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      parts.push(rgbaToEscPosRaster(img.data, canvas.width, canvas.height, dots))
      if (after.length) parts.push(Uint8Array.from(after))
      labels += items.length
    }
    const total = parts.reduce((s, p) => s + p.length, 0)
    const bytes = new Uint8Array(total)
    let off = 0
    for (const p of parts) {
      bytes.set(p, off)
      off += p.length
    }
    await sendEscPosPayload(cfg, bytes, 'Etiquetas')
    sentRows += Math.min(perChunk, rows.length - i)
    opts.onProgress?.(sentRows, rows.length)
  }
  return { labels, rows: rows.length }
}
