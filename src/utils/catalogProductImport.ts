import {
  readXlsx,
  validateWithSchema,
  writeXlsx,
  type CellValue,
  type SchemaDefinition,
} from 'hucre'
import type { BulkImportItemPayload } from '@/services/products.service'
import { productsService } from '@/services/products.service'
import { normalizeSunatUnit } from '@/constants/sunatUnits'
import { INITIAL_STOCK_REQUIRES_MANAGE_STOCK } from '@/constants/productStockRules'

type HucreRowError = {
  row: number
  column: string | number
  message: string
  value: unknown
  field: string
}

/** Catálogo SUNAT tipo de afectación del IGV (importación masiva). */
export const IGV_AFFECTATION_CODES = ['10', '15', '20', '30', '40'] as const
export type IgvAffectationCode = (typeof IGV_AFFECTATION_CODES)[number]

export const IGV_AFFECTATION_LABELS: Record<IgvAffectationCode, string> = {
  '10': 'Gravado',
  '15': 'Gravado – Bonificaciones',
  '20': 'Exonerado',
  '30': 'Inafecto',
  '40': 'Exportación',
}

const PREPARATION_AREA_VALUES = ['', 'cocina', 'bar', 'barra', 'postres', 'otro'] as const

export const CATALOG_IMPORT_COLUMNS = [
  'nombre',
  'codigo',
  'descripcion',
  'precio_venta',
  'precio_compra',
  'unidad',
  'categoria',
  'afectacion_igv',
  'precio_incluye_igv',
  'control_stock',
  'stock_inicial',
  'es_restaurante',
  'area_preparacion',
  'tipo',
  'fecha_vencimiento',
] as const

const HEADER_ALIASES: Record<string, (typeof CATALOG_IMPORT_COLUMNS)[number]> = {
  nombre: 'nombre',
  name: 'nombre',
  producto: 'nombre',
  codigo: 'codigo',
  code: 'codigo',
  sku: 'codigo',
  descripcion: 'descripcion',
  description: 'descripcion',
  precio_venta: 'precio_venta',
  precio: 'precio_venta',
  price: 'precio_venta',
  sale_price: 'precio_venta',
  precio_compra: 'precio_compra',
  costo: 'precio_compra',
  cost: 'precio_compra',
  purchase_price: 'precio_compra',
  costo_compra: 'precio_compra',
  precio_costo: 'precio_compra',
  unidad: 'unidad',
  unit: 'unidad',
  categoria: 'categoria',
  category: 'categoria',
  afectacion_igv: 'afectacion_igv',
  tipo_afectacion_igv: 'afectacion_igv',
  tipo_afectacion: 'afectacion_igv',
  afectacion: 'afectacion_igv',
  igv_affectation_type: 'afectacion_igv',
  igv_affectation: 'afectacion_igv',
  igv: 'afectacion_igv',
  precio_incluye_igv: 'precio_incluye_igv',
  incluye_igv: 'precio_incluye_igv',
  control_stock: 'control_stock',
  manage_stock: 'control_stock',
  stock_inicial: 'stock_inicial',
  cantidad_inicial: 'stock_inicial',
  inventario_inicial: 'stock_inicial',
  initial_stock: 'stock_inicial',
  es_restaurante: 'es_restaurante',
  is_restaurant: 'es_restaurante',
  restaurante: 'es_restaurante',
  area_preparacion: 'area_preparacion',
  area: 'area_preparacion',
  preparation_area: 'area_preparacion',
  tipo: 'tipo',
  type: 'tipo',
  fecha_vencimiento: 'fecha_vencimiento',
  fecha_de_vencimiento: 'fecha_vencimiento',
  vencimiento: 'fecha_vencimiento',
  expiry_date: 'fecha_vencimiento',
  expiry: 'fecha_vencimiento',
  expiration_date: 'fecha_vencimiento',
}

function normalizeOptionalPreparationArea(value: unknown): string {
  const s = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  if (!s || ['-', '—', 'na', 'n/a', 'ninguna', 'none', 'sin area', 'sin área'].includes(s)) {
    return ''
  }
  return PREPARATION_AREA_VALUES.includes(s as (typeof PREPARATION_AREA_VALUES)[number]) ? s : ''
}

/**
 * Normaliza tipo de afectación IGV SUNAT: 10 gravado, 15 gravado bonificaciones, 20 exonerado, 30 inafecto, 40 exportación.
 * Vacío → 10. Acepta número de Excel (10) o texto ("10", "gravado").
 * Devuelve null si el valor no es uno de los 4 códigos permitidos.
 */
export function normalizeIgvAffectationCode(value: unknown): IgvAffectationCode | null {
  if (value == null || value === '') return '10'
  if (typeof value === 'number' && Number.isFinite(value)) {
    const code = String(Math.trunc(value))
    return IGV_AFFECTATION_CODES.includes(code as IgvAffectationCode) ? (code as IgvAffectationCode) : null
  }
  const raw = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  if (!raw) return '10'
  const digits = raw.match(/^(\d{2})(?:\.0+)?(?:\s|$|[^\d])/)
  if (digits) {
    const code = digits[1]
    return IGV_AFFECTATION_CODES.includes(code as IgvAffectationCode) ? (code as IgvAffectationCode) : null
  }
  if (raw === '10' || (raw.includes('gravado') && !raw.includes('bonific'))) return '10'
  if (raw === '15' || (raw.includes('bonific') && !raw.includes('inafecto'))) return '15'
  if (raw === '20' || raw.includes('exonerado')) return '20'
  if (raw === '30' || raw.includes('inafecto')) return '30'
  if (raw === '40' || raw.includes('exportacion')) return '40'
  return null
}

export const CATALOG_PRODUCT_IMPORT_SCHEMA: SchemaDefinition = {
  nombre: { column: 'nombre', type: 'string', required: true, min: 1, max: 255 },
  codigo: { column: 'codigo', type: 'string', max: 64 },
  descripcion: { column: 'descripcion', type: 'string', max: 500 },
  precio_venta: { column: 'precio_venta', type: 'number', required: true, min: 0.01 },
  /** Opcional: vacío = no se aplica (producto nuevo queda en 0; actualización conserva el costo actual). */
  precio_compra: {
    column: 'precio_compra',
    type: 'string',
    max: 32,
    transform: (v) => String(v ?? '').trim(),
  },
  unidad: {
    column: 'unidad',
    type: 'string',
    max: 10,
    transform: (v) => {
      const s = String(v ?? '').trim().toUpperCase()
      return s || ''
    },
  },
  categoria: { column: 'categoria', type: 'string', max: 120 },
  /** SUNAT: 10 gravado, 20 exonerado, 30 inafecto, 40 exportación. Vacío = 10. */
  afectacion_igv: {
    column: 'afectacion_igv',
    type: 'string',
    max: 40,
    transform: (v) => String(v ?? '').trim(),
  },
  precio_incluye_igv: {
    column: 'precio_incluye_igv',
    type: 'string',
    default: 'si',
    transform: parseExcelBoolean,
  },
  control_stock: {
    column: 'control_stock',
    type: 'string',
    default: 'no',
    transform: parseExcelBoolean,
  },
  stock_inicial: {
    column: 'stock_inicial',
    type: 'number',
    default: 0,
    min: 0,
  },
  es_restaurante: {
    column: 'es_restaurante',
    type: 'string',
    default: 'no',
    transform: parseExcelBoolean,
  },
  area_preparacion: {
    column: 'area_preparacion',
    type: 'string',
    transform: normalizeOptionalPreparationArea,
  },
  tipo: {
    column: 'tipo',
    type: 'string',
    default: 'product',
    transform: (v) => {
      const s = String(v ?? 'product').trim().toLowerCase()
      if (s === 'servicio' || s === 'service') return 'service'
      return 'product'
    },
    enum: ['product', 'service'],
  },
  /** Opcional: vacío = sin vencimiento. Formato YYYY-MM-DD o DD/MM/YYYY. */
  fecha_vencimiento: {
    column: 'fecha_vencimiento',
    type: 'string',
    max: 32,
    transform: (v) => String(v ?? '').trim(),
  },
}

export type ParsedCatalogImportRow = {
  rowNumber: number
  nombre: string
  codigo: string
  descripcion: string
  precio_venta: number
  /** undefined = celda vacía / no enviada */
  precio_compra?: number
  unidad: string
  categoria: string
  afectacion_igv: string
  precio_incluye_igv: boolean
  control_stock: boolean
  stock_inicial: number
  es_restaurante: boolean
  area_preparacion: string
  tipo: string
  /** YYYY-MM-DD cuando la columna está en el Excel y la celda tiene valor; null = sin vencimiento */
  fecha_vencimiento?: string | null
}

export type ImportRowIssue = {
  row: number
  column: string | number
  message: string
  value: unknown
  field: string
}

export type ImportValidationResult = {
  rows: ParsedCatalogImportRow[]
  errors: ImportRowIssue[]
  totalRows: number
  /** true si el Excel incluye la columna fecha_vencimiento */
  hasExpiryColumn: boolean
}

function normalizeHeader(raw: string): string {
  const key = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_')
  return HEADER_ALIASES[key] ?? key
}

function parseExcelBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const s = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  if (['1', 'si', 'yes', 'true', 'verdadero', 's', 'y'].includes(s)) return true
  if (['0', 'no', 'false', 'falso', 'n'].includes(s)) return false
  return Boolean(value)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatYmdLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function isValidYmd(y: number, m: number, d: number): boolean {
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

function excelSerialToDate(serial: number): Date {
  const utcDays = Math.floor(serial - 25569)
  const utcMs = utcDays * 86_400_000
  const d = new Date(utcMs)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** Vacío → null (sin vencimiento). Válido → YYYY-MM-DD. Inválido → null y mensaje de error. */
export function parseCatalogExpiryDate(value: unknown): { date: string | null; error?: string } {
  if (value == null || value === '') return { date: null }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { date: formatYmdLocal(value) }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 30_000 && value <= 120_000) {
      return { date: formatYmdLocal(excelSerialToDate(value)) }
    }
    return { date: null, error: 'fecha_vencimiento inválida (use YYYY-MM-DD o DD/MM/YYYY)' }
  }
  const raw = String(value).trim()
  if (!raw || ['-', '—', 'na', 'n/a', 'sin vencimiento', 'none'].includes(raw.toLowerCase())) {
    return { date: null }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number)
    if (!isValidYmd(y, m, d)) {
      return { date: null, error: 'fecha_vencimiento inválida (use YYYY-MM-DD)' }
    }
    return { date: raw }
  }
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) {
    const day = Number(dmy[1])
    const month = Number(dmy[2])
    const year = Number(dmy[3])
    if (!isValidYmd(year, month, day)) {
      return { date: null, error: 'fecha_vencimiento inválida (use DD/MM/YYYY)' }
    }
    return { date: `${year}-${pad2(month)}-${pad2(day)}` }
  }
  return { date: null, error: 'fecha_vencimiento inválida (use YYYY-MM-DD o DD/MM/YYYY)' }
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

export async function downloadCatalogProductTemplate(): Promise<void> {
  const headerRow: CellValue[] = [...CATALOG_IMPORT_COLUMNS]
  const exampleRow: CellValue[] = [
    'Producto demo',
    '7750123456789',
    'Descripción opcional',
    25.5,
    15.0,
    'NIU',
    'General',
    '10',
    'si',
    'no',
    0,
    'no',
    '',
    'product',
    '2026-12-31',
  ]
  const bytes = await writeXlsx({
    sheets: [{ name: 'Productos', rows: [headerRow, exampleRow] }],
  })
  downloadXlsx(bytes, 'plantilla-productos-catalogo.xlsx')
}

export async function validateCatalogProductExcel(file: File): Promise<ImportValidationResult> {
  const buf = await file.arrayBuffer()
  const wb = await readXlsx(new Uint8Array(buf))
  const sheet = wb.sheets[0]
  if (!sheet?.rows?.length) {
    return { rows: [], errors: [{ row: 0, column: '', field: '', message: 'El archivo está vacío', value: null }], totalRows: 0, hasExpiryColumn: false }
  }

  const rawRows = sheet.rows as CellValue[][]
  const headerCells = rawRows[0] ?? []
  const normalizedHeaders = headerCells.map((c) => normalizeHeader(String(c ?? '')))
  const hasExpiryColumn = normalizedHeaders.includes('fecha_vencimiento')
  const missingRequired = ['nombre', 'precio_venta'].filter((col) => !normalizedHeaders.includes(col))
  if (missingRequired.length > 0) {
    return {
      rows: [],
      errors: [{
        row: 1,
        column: 'encabezados',
        field: 'encabezados',
        message: `Faltan columnas obligatorias: ${missingRequired.join(', ')}`,
        value: normalizedHeaders.join(', '),
      }],
      totalRows: 0,
      hasExpiryColumn,
    }
  }

  const rowsForSchema: CellValue[][] = [normalizedHeaders, ...rawRows.slice(1)]
  const { data, errors: schemaErrors } = validateWithSchema<Record<string, unknown>>(
    rowsForSchema,
    CATALOG_PRODUCT_IMPORT_SCHEMA,
    { headerRow: 1, skipEmptyRows: true, errorMode: 'collect' }
  )

  const parsed: ParsedCatalogImportRow[] = []
  const extraErrors: ImportRowIssue[] = (schemaErrors as HucreRowError[])
    .filter((e) => e.field !== 'area_preparacion' && e.field !== 'precio_compra' && e.field !== 'afectacion_igv' && e.field !== 'fecha_vencimiento')
    .map((e) => ({
    row: e.row,
    column: e.column,
    message: e.message,
    value: e.value,
    field: e.field,
  }))
  const codesInFile = new Map<string, number>()

  data.forEach((row, index) => {
    const rowNumber = index + 2
    const codigo = String(row.codigo ?? '').trim()
    if (codigo) {
      codesInFile.set(codigo, rowNumber)
    }
    const stockInicial = Math.max(0, Number(row.stock_inicial ?? 0) || 0)
    const controlStock = parseExcelBoolean(row.control_stock)
    if (!controlStock && stockInicial > 0) {
      extraErrors.push({
        row: rowNumber,
        column: 'stock_inicial',
        field: 'stock_inicial',
        message: INITIAL_STOCK_REQUIRES_MANAGE_STOCK,
        value: stockInicial,
      })
      return
    }
    const purchaseRaw = String(row.precio_compra ?? '').trim()
    let precioCompra: number | undefined
    if (purchaseRaw !== '') {
      const n = Number(purchaseRaw.replace(',', '.'))
      if (Number.isNaN(n) || n < 0) {
        extraErrors.push({
          row: rowNumber,
          column: 'precio_compra',
          field: 'precio_compra',
          message: 'precio_compra debe ser un número mayor o igual a 0 (o vacío)',
          value: purchaseRaw,
        })
        return
      }
      precioCompra = n
    }
    const afectacionIgv = normalizeIgvAffectationCode(row.afectacion_igv)
    if (afectacionIgv == null) {
      extraErrors.push({
        row: rowNumber,
        column: 'afectacion_igv',
        field: 'afectacion_igv',
        message: 'Use código SUNAT: 10 (gravado), 15 (gravado bonificaciones), 20 (exonerado), 30 (inafecto) o 40 (exportación)',
        value: row.afectacion_igv,
      })
      return
    }
    const esRestaurante = Boolean(row.es_restaurante)
    const tipo = String(row.tipo ?? 'product').trim().toLowerCase() === 'service' ? 'service' : 'product'
    if (tipo === 'service' && esRestaurante) {
      extraErrors.push({
        row: rowNumber,
        column: 'es_restaurante',
        field: 'es_restaurante',
        message: 'Un servicio no puede ser de restaurante; use tipo product',
        value: 'si',
      })
    }
    let fechaVencimiento: string | null | undefined
    if (hasExpiryColumn) {
      const expiryCell = row.fecha_vencimiento
      const parsedExpiry = parseCatalogExpiryDate(expiryCell)
      if (parsedExpiry.error) {
        extraErrors.push({
          row: rowNumber,
          column: 'fecha_vencimiento',
          field: 'fecha_vencimiento',
          message: parsedExpiry.error,
          value: expiryCell,
        })
        return
      }
      fechaVencimiento = parsedExpiry.date
    }
    parsed.push({
      rowNumber,
      nombre: String(row.nombre ?? '').trim(),
      codigo,
      descripcion: String(row.descripcion ?? '').trim(),
      precio_venta: Number(row.precio_venta),
      precio_compra: precioCompra,
      unidad: normalizeSunatUnit(String(row.unidad ?? ''), tipo),
      categoria: String(row.categoria ?? '').trim(),
      afectacion_igv: afectacionIgv,
      precio_incluye_igv: parseExcelBoolean(row.precio_incluye_igv),
      control_stock: controlStock,
      stock_inicial: stockInicial,
      es_restaurante: esRestaurante,
      area_preparacion: normalizeOptionalPreparationArea(row.area_preparacion),
      tipo,
      ...(hasExpiryColumn ? { fecha_vencimiento: fechaVencimiento ?? null } : {}),
    })
  })

  return { rows: parsed, errors: extraErrors, totalRows: parsed.length, hasExpiryColumn }
}

const BULK_CHUNK_SIZE = 500

function rowToBulkPayload(row: ParsedCatalogImportRow, hasExpiryColumn: boolean): BulkImportItemPayload {
  return {
    row_number: row.rowNumber,
    name: row.nombre,
    code: row.codigo || undefined,
    description: row.descripcion || undefined,
    sale_price: row.precio_venta,
    ...(row.precio_compra != null ? { purchase_price: row.precio_compra } : {}),
    unit: row.unidad,
    category_name: row.categoria || undefined,
    igv_affectation_type: row.afectacion_igv,
    price_includes_igv: row.precio_incluye_igv,
    manage_stock: row.control_stock,
    initial_stock: row.stock_inicial > 0 ? row.stock_inicial : undefined,
    is_restaurant: row.es_restaurante,
    preparation_area: row.es_restaurante && row.area_preparacion ? row.area_preparacion : undefined,
    type: row.tipo,
    ...(hasExpiryColumn ? { expiry_date: row.fecha_vencimiento ?? '' } : {}),
  }
}

export type ImportProgress = { done: number; total: number; current?: string }

export async function importCatalogProducts(
  rows: ParsedCatalogImportRow[],
  branchId: number,
  onProgress?: (p: ImportProgress) => void,
  hasExpiryColumn = false,
): Promise<{
  created: number
  updated: number
  stockRegistered: number
  failed: { row: number; name: string; error: string }[]
}> {
  const failed: { row: number; name: string; error: string }[] = []
  let created = 0
  let updated = 0
  let stockRegistered = 0

  for (let offset = 0; offset < rows.length; offset += BULK_CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + BULK_CHUNK_SIZE)
    onProgress?.({ done: offset, total: rows.length, current: chunk[0]?.nombre })
    try {
      const res = await productsService.bulkImportCatalog(chunk.map((r) => rowToBulkPayload(r, hasExpiryColumn)), branchId)
      created += res.created
      updated += res.updated ?? 0
      stockRegistered += res.stock_registered
      failed.push(...res.failed)
      onProgress?.({ done: offset + chunk.length, total: rows.length, current: chunk[chunk.length - 1]?.nombre })
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (e instanceof Error ? e.message : 'Error al importar lote')
      for (const row of chunk) {
        failed.push({ row: row.rowNumber, name: row.nombre, error: msg })
      }
      onProgress?.({ done: offset + chunk.length, total: rows.length })
    }
  }

  onProgress?.({ done: rows.length, total: rows.length })
  return { created, updated, stockRegistered, failed }
}
