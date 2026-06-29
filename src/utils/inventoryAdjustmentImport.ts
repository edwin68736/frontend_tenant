import {
  readXlsx,
  writeXlsx,
  type CellValue,
} from 'hucre'

export const ADJUSTMENT_IMPORT_COLUMNS = ['codigo_barras', 'stock_nuevo'] as const

export interface ParsedAdjustmentImportRow {
  rowNumber: number
  barcode: string
  newStock: number
}

export interface AdjustmentImportParseError {
  row: number
  message: string
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_')
}

function mapHeader(value: unknown): string {
  const h = normalizeHeader(value)
  if (['codigo_barras', 'codigo', 'barcode', 'codigo_de_barras', 'ean'].includes(h)) {
    return 'codigo_barras'
  }
  if (['stock_nuevo', 'stock', 'nuevo_stock', 'new_stock', 'cantidad', 'stock_contado', 'stock_conteo'].includes(h)) {
    return 'stock_nuevo'
  }
  return h
}

function parseNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function downloadXlsx(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([new Uint8Array(bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export async function downloadAdjustmentImportTemplate(): Promise<void> {
  const headerRow: CellValue[] = ['Código de barras', 'Stock contado']
  const exampleRow: CellValue[] = ['7750123456789', 20]
  const bytes = await writeXlsx({
    sheets: [{ name: 'Conteo', rows: [headerRow, exampleRow] }],
  })
  downloadXlsx(bytes, 'plantilla-conteo-fisico.xlsx')
}

export interface ImportErrorExportRow {
  row_number: number
  barcode: string
  error: string
}

export async function exportImportErrorsExcel(rows: ImportErrorExportRow[]): Promise<void> {
  if (rows.length === 0) return
  const headerRow: CellValue[] = ['Fila', 'Código de barras', 'Error']
  const dataRows: CellValue[][] = rows.map(r => [r.row_number, r.barcode, r.error])
  const bytes = await writeXlsx({
    sheets: [{ name: 'Errores', rows: [headerRow, ...dataRows] }],
  })
  downloadXlsx(bytes, 'errores-conteo-fisico.xlsx')
}

export async function parseAdjustmentImportExcel(file: File): Promise<{
  rows: ParsedAdjustmentImportRow[]
  errors: AdjustmentImportParseError[]
}> {
  const buf = await file.arrayBuffer()
  const wb = await readXlsx(new Uint8Array(buf))
  const sheet = wb.sheets[0]
  if (!sheet?.rows?.length) {
    return { rows: [], errors: [{ row: 0, message: 'El archivo está vacío' }] }
  }

  const header = sheet.rows[0] ?? []
  const colIndex: Record<string, number> = {}
  header.forEach((cell, idx) => {
    const key = mapHeader(cell)
    if (key === 'codigo_barras' || key === 'stock_nuevo') {
      colIndex[key] = idx
    }
  })

  const errors: AdjustmentImportParseError[] = []
  if (colIndex.codigo_barras == null || colIndex.stock_nuevo == null) {
    return {
      rows: [],
      errors: [{ row: 1, message: 'Encabezados requeridos: Código de barras | Stock contado' }],
    }
  }

  const rows: ParsedAdjustmentImportRow[] = []
  for (let i = 1; i < sheet.rows.length; i++) {
    const row = sheet.rows[i] ?? []
    const barcode = String(row[colIndex.codigo_barras] ?? '').trim()
    const stockRaw = row[colIndex.stock_nuevo]
    if (!barcode && (stockRaw == null || stockRaw === '')) continue

    const rowNumber = i + 1
    if (!barcode) {
      errors.push({ row: rowNumber, message: 'Código de barras requerido' })
      continue
    }
    const newStock = parseNumber(stockRaw)
    if (newStock == null) {
      errors.push({ row: rowNumber, message: 'Stock nuevo inválido' })
      continue
    }
    if (newStock < 0) {
      errors.push({ row: rowNumber, message: 'Stock nuevo no puede ser negativo' })
      continue
    }
    rows.push({ rowNumber, barcode, newStock })
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ row: 0, message: 'No hay filas de datos' })
  }

  return { rows, errors }
}
