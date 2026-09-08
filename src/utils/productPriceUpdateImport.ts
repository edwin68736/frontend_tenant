import { downloadXlsxBytes } from '@/utils/downloadXlsx'
import { readXlsx, writeXlsx, type CellValue } from 'hucre'

/** Fila de la lista descargada desde "Actualizar precio" (Productos). */
export interface PriceUpdateExportRow {
  code: string
  name: string
  sale_price: number
  purchase_price?: number | null
}

/**
 * Descarga el catálogo de la sucursal activa con solo 3 columnas para editar precios en masa:
 * código de barras, precio de venta, precio de compra. El nombre va como referencia (no se lee
 * al reimportar; el match es siempre por código).
 */
export async function exportPriceUpdateList(rows: PriceUpdateExportRow[], filename = 'actualizar-precios.xlsx'): Promise<void> {
  const headerRow: CellValue[] = ['codigo', 'nombre', 'precio_venta', 'precio_compra']
  const dataRows: CellValue[][] = rows.map((r) => [
    r.code,
    r.name,
    r.sale_price,
    r.purchase_price ?? '',
  ])
  const bytes = await writeXlsx({ sheets: [{ name: 'Precios', rows: [headerRow, ...dataRows] }] })
  await downloadXlsxBytes(bytes, filename)
}

export interface ParsedPriceUpdateRow {
  rowNumber: number
  code: string
  /** null = la celda vino vacía: no se toca ese precio al actualizar. */
  salePrice: number | null
  purchasePrice: number | null
}

export interface PriceUpdateParseError {
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
  if (['codigo', 'codigo_barras', 'code', 'sku', 'barcode', 'codigo_de_barras'].includes(h)) return 'codigo'
  if (['precio_venta', 'sale_price', 'pventa', 'p_venta', 'venta'].includes(h)) return 'precio_venta'
  if (['precio_compra', 'purchase_price', 'pcompra', 'p_compra', 'compra', 'costo'].includes(h)) return 'precio_compra'
  return h
}

/** '' o undefined = celda vacía (no tocar); número inválido = null con error. */
function parseOptionalPrice(value: unknown): { value: number | null; invalid: boolean } {
  if (value == null || value === '') return { value: null, invalid: false }
  const n = Number(String(value).replace(',', '.'))
  if (!Number.isFinite(n)) return { value: null, invalid: true }
  return { value: n, invalid: false }
}

export async function parsePriceUpdateExcel(file: File): Promise<{
  rows: ParsedPriceUpdateRow[]
  errors: PriceUpdateParseError[]
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
    if (key === 'codigo' || key === 'precio_venta' || key === 'precio_compra') colIndex[key] = idx
  })

  if (colIndex.codigo == null || (colIndex.precio_venta == null && colIndex.precio_compra == null)) {
    return {
      rows: [],
      errors: [{ row: 1, message: 'Encabezados requeridos: codigo, y al menos precio_venta o precio_compra' }],
    }
  }

  const rows: ParsedPriceUpdateRow[] = []
  const errors: PriceUpdateParseError[] = []
  for (let i = 1; i < sheet.rows.length; i++) {
    const row = sheet.rows[i] ?? []
    const code = String(row[colIndex.codigo] ?? '').trim()
    const saleRaw = colIndex.precio_venta != null ? row[colIndex.precio_venta] : undefined
    const purchaseRaw = colIndex.precio_compra != null ? row[colIndex.precio_compra] : undefined
    if (!code && (saleRaw == null || saleRaw === '') && (purchaseRaw == null || purchaseRaw === '')) continue // fila vacía

    const rowNumber = i + 1
    if (!code) {
      errors.push({ row: rowNumber, message: 'Código requerido' })
      continue
    }
    const sale = parseOptionalPrice(saleRaw)
    if (sale.invalid) {
      errors.push({ row: rowNumber, message: 'Precio de venta inválido' })
      continue
    }
    const purchase = parseOptionalPrice(purchaseRaw)
    if (purchase.invalid) {
      errors.push({ row: rowNumber, message: 'Precio de compra inválido' })
      continue
    }
    if (sale.value == null && purchase.value == null) {
      errors.push({ row: rowNumber, message: 'Sin precio de venta ni de compra' })
      continue
    }
    if (sale.value != null && sale.value < 0) {
      errors.push({ row: rowNumber, message: 'Precio de venta no puede ser negativo' })
      continue
    }
    if (purchase.value != null && purchase.value < 0) {
      errors.push({ row: rowNumber, message: 'Precio de compra no puede ser negativo' })
      continue
    }
    rows.push({ rowNumber, code, salePrice: sale.value, purchasePrice: purchase.value })
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ row: 0, message: 'No hay filas de datos' })
  }

  return { rows, errors }
}
