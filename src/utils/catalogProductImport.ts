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

type HucreRowError = {
  row: number
  column: string | number
  message: string
  value: unknown
  field: string
}

const IGV_CODES = ['10', '20', '30', '40'] as const
const PREPARATION_AREA_VALUES = ['', 'cocina', 'bar', 'barra', 'postres', 'otro'] as const

export const CATALOG_IMPORT_COLUMNS = [
  'nombre',
  'codigo',
  'descripcion',
  'precio_venta',
  'unidad',
  'categoria',
  'afectacion_igv',
  'precio_incluye_igv',
  'control_stock',
  'stock_inicial',
  'es_restaurante',
  'area_preparacion',
  'tipo',
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
  unidad: 'unidad',
  unit: 'unidad',
  categoria: 'categoria',
  category: 'categoria',
  afectacion_igv: 'afectacion_igv',
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

export const CATALOG_PRODUCT_IMPORT_SCHEMA: SchemaDefinition = {
  nombre: { column: 'nombre', type: 'string', required: true, min: 1, max: 255 },
  codigo: { column: 'codigo', type: 'string', max: 64 },
  descripcion: { column: 'descripcion', type: 'string', max: 500 },
  precio_venta: { column: 'precio_venta', type: 'number', required: true, min: 0.01 },
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
  afectacion_igv: {
    column: 'afectacion_igv',
    type: 'string',
    default: '10',
    transform: (v) => String(v ?? '10').trim(),
    enum: [...IGV_CODES],
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
}

export type ParsedCatalogImportRow = {
  rowNumber: number
  nombre: string
  codigo: string
  descripcion: string
  precio_venta: number
  unidad: string
  categoria: string
  afectacion_igv: string
  precio_incluye_igv: boolean
  control_stock: boolean
  stock_inicial: number
  es_restaurante: boolean
  area_preparacion: string
  tipo: string
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
    'NIU',
    'General',
    '10',
    'si',
    'si',
    10,
    'no',
    '',
    'product',
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
    return { rows: [], errors: [{ row: 0, column: '', field: '', message: 'El archivo está vacío', value: null }], totalRows: 0 }
  }

  const rawRows = sheet.rows as CellValue[][]
  const headerCells = rawRows[0] ?? []
  const normalizedHeaders = headerCells.map((c) => normalizeHeader(String(c ?? '')))
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
    .filter((e) => e.field !== 'area_preparacion')
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
    const controlStock = Boolean(row.control_stock) || stockInicial > 0
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
    parsed.push({
      rowNumber,
      nombre: String(row.nombre ?? '').trim(),
      codigo,
      descripcion: String(row.descripcion ?? '').trim(),
      precio_venta: Number(row.precio_venta),
      unidad: normalizeSunatUnit(String(row.unidad ?? ''), tipo),
      categoria: String(row.categoria ?? '').trim(),
      afectacion_igv: String(row.afectacion_igv ?? '10').trim(),
      precio_incluye_igv: Boolean(row.precio_incluye_igv),
      control_stock: controlStock,
      stock_inicial: stockInicial,
      es_restaurante: esRestaurante,
      area_preparacion: normalizeOptionalPreparationArea(row.area_preparacion),
      tipo,
    })
  })

  return { rows: parsed, errors: extraErrors, totalRows: parsed.length }
}

const BULK_CHUNK_SIZE = 500

function rowToBulkPayload(row: ParsedCatalogImportRow): BulkImportItemPayload {
  return {
    row_number: row.rowNumber,
    name: row.nombre,
    code: row.codigo || undefined,
    description: row.descripcion || undefined,
    sale_price: row.precio_venta,
    unit: row.unidad,
    category_name: row.categoria || undefined,
    igv_affectation_type: row.afectacion_igv,
    price_includes_igv: row.precio_incluye_igv,
    manage_stock: row.control_stock,
    initial_stock: row.stock_inicial > 0 ? row.stock_inicial : undefined,
    is_restaurant: row.es_restaurante,
    preparation_area: row.es_restaurante && row.area_preparacion ? row.area_preparacion : undefined,
    type: row.tipo,
  }
}

export type ImportProgress = { done: number; total: number; current?: string }

export async function importCatalogProducts(
  rows: ParsedCatalogImportRow[],
  onProgress?: (p: ImportProgress) => void
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
      const res = await productsService.bulkImportCatalog(chunk.map(rowToBulkPayload))
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
