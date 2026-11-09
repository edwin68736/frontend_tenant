import { readXlsx, writeXlsx, type CellValue } from 'hucre'
import { downloadXlsxBytes } from '@/utils/downloadXlsx'
import {
  CATALOG_IMPORT_COLUMNS,
  normalizeDecimalComma,
  parseExcelBoolean,
  rowToBulkPayload,
  validateCatalogProductRows,
  type ParsedCatalogImportRow,
} from '@/utils/catalogProductImport'
import { productsService } from '@/services/products.service'
import type {
  BulkImportAdvancedItemPayload,
  BulkImportAdvancedResultPayload,
} from '@/services/products.service'

/**
 * Importación avanzada de productos (Excel con varias hojas):
 *   Productos · Presentaciones · Unidades de venta · Precios por sucursal · Stock por sucursal
 * Las hojas hijas se enlazan con Productos por la columna «codigo» (obligatorio en este modo).
 * El backend aplica las reglas de negocio (ver backend_principal/internal/products/service/
 * bulk_import_advanced.go); aquí solo se valida la estructura para avisar antes de enviar.
 */

export const ADVANCED_BATCH_SIZE = 200

export const SHEET_PRODUCTS = 'Productos'
export const SHEET_PRESENTATIONS = 'Presentaciones'
export const SHEET_SALE_UNITS = 'Unidades de venta'
export const SHEET_BRANCH_PRICES = 'Precios por sucursal'
export const SHEET_BRANCH_STOCKS = 'Stock por sucursal'
const SHEET_INSTRUCTIONS = 'Instrucciones'

export type AdvancedIssue = { sheet: string; row: number; message: string }

export type AdvancedParseResult = {
  items: BulkImportAdvancedItemPayload[]
  errors: AdvancedIssue[]
  /** Filas leídas por hoja (para el resumen). */
  counts: { products: number; presentations: number; saleUnits: number; branchPrices: number; branchStocks: number }
}

// ── Plantilla ────────────────────────────────────────────────────────────────────────────────────

const PRESENTATION_HEADERS = ['codigo', 'nombre', 'precio', 'stock_inicial', 'orden']
const SALE_UNIT_HEADERS = [
  'codigo', 'nombre', 'unidad', 'factor', 'permite_fraccion', 'es_base', 'precio1', 'precio2', 'precio3', 'orden',
]
const BRANCH_PRICE_HEADERS = ['codigo', 'sucursal', 'unidad_venta', 'precio']
const BRANCH_STOCK_HEADERS = ['codigo', 'sucursal', 'cantidad']

function productRow(values: Partial<Record<(typeof CATALOG_IMPORT_COLUMNS)[number], CellValue>>): CellValue[] {
  return CATALOG_IMPORT_COLUMNS.map((c) => values[c] ?? '')
}

const INSTRUCTIONS: string[] = [
  'IMPORTACIÓN AVANZADA DE PRODUCTOS',
  '',
  'Cada hoja se enlaza con «Productos» por la columna codigo. En este modo el codigo es OBLIGATORIO y único.',
  'Productos: igual que la plantilla básica (más stock_minimo). Es la única hoja obligatoria.',
  'Presentaciones: variantes con su propio precio y stock (ej. Personal / Familiar). Un producto no puede tener presentaciones y unidades de venta a la vez.',
  'Unidades de venta: formas de vender el mismo producto (unidad, caja x12, gramo…). factor = cuántas unidades base contiene (caja x12 = 12; gramo de un producto en kilos = 0.001). Solo una unidad puede ser es_base (factor 1). precio2 y precio3 son opcionales. La unidad (KGM, GRM, LTR, MLT, BX, NIU…) es el código SUNAT; una unidad con factor menor a 1 no puede usar el mismo código que la base del producto.',
  'Precios por sucursal: precio distinto en una sucursal. Si unidad_venta va vacía es el precio del producto; si trae el nombre de una unidad de venta del producto, es el precio de esa unidad en esa sucursal.',
  'Stock por sucursal: cantidad exacta en cada sucursal (producto nuevo: entrada inicial; existente: ajuste al valor indicado, 0 lo deja en cero). Requiere control_stock = si. Los productos con presentaciones llevan su stock en la hoja Presentaciones.',
  'Venta por kilo o litro: no necesita hojas extra. En Productos use unidad KGM (o LTR), el precio del kilo (o litro) y el stock en kilos (o litros). Las filas de gramo/mililitro en «Unidades de venta» son opcionales.',
  '',
  'PRODUCTOS QUE YA EXISTEN (mismo codigo): lo que aparece en una hoja hija es la lista FINAL de ese producto. Lo que ya tenía y no aparece se DESACTIVA (nunca se borra). Si el producto no aparece en una hoja, o la hoja está vacía, esa parte no se toca.',
  'Antes de importar verá un resumen de lo que se creará, modificará y desactivará. Los números admiten coma decimal (0,50).',
  'Las filas de ejemplo de la plantilla usan los códigos ARR-KG, ACE-LT, GAS-250 y GAL-12: bórrelas o reemplácelas por sus productos.',
]

export async function downloadAdvancedProductTemplate(branchNames: string[] = []): Promise<void> {
  const b1 = branchNames[0] || 'Principal'
  const b2 = branchNames[1] || b1
  const productos: CellValue[][] = [
    [...CATALOG_IMPORT_COLUMNS],
    // Venta por kilo: solo la hoja Productos (unidad KGM, precio y stock por kilo).
    productRow({
      nombre: 'Arroz extra (por kilo)', codigo: 'ARR-KG', descripcion: 'Se vende por peso', precio_venta: 4.5, precio_compra: 3.8,
      unidad: 'KGM', categoria: 'Abarrotes', afectacion_igv: '10', precio_incluye_igv: 'si', control_stock: 'si',
      stock_inicial: 0, es_restaurante: 'no', tipo: 'product', stock_minimo: 20,
    }),
    // Venta por litro.
    productRow({
      nombre: 'Aceite vegetal (por litro)', codigo: 'ACE-LT', precio_venta: 9.5, precio_compra: 7.9, unidad: 'LTR',
      categoria: 'Abarrotes', afectacion_igv: '10', precio_incluye_igv: 'si', control_stock: 'si', stock_inicial: 50,
      es_restaurante: 'no', tipo: 'product', stock_minimo: 10,
    }),
    // Con presentaciones.
    productRow({
      nombre: 'Gaseosa', codigo: 'GAS-250', precio_venta: 3, unidad: 'NIU', categoria: 'Bebidas', afectacion_igv: '10',
      precio_incluye_igv: 'si', control_stock: 'si', stock_inicial: 0, es_restaurante: 'no', tipo: 'product',
    }),
    // Con unidades de venta (unidad y caja x12 con 3 niveles de precio).
    productRow({
      nombre: 'Galletas de vainilla', codigo: 'GAL-12', precio_venta: 1.5, precio_compra: 1, unidad: 'NIU',
      categoria: 'Snacks', afectacion_igv: '10', precio_incluye_igv: 'si', control_stock: 'si', stock_inicial: 0,
      es_restaurante: 'no', tipo: 'product',
    }),
  ]
  const presentaciones: CellValue[][] = [
    PRESENTATION_HEADERS,
    ['GAS-250', 'Personal', 3, 24, 1],
    ['GAS-250', 'Familiar', 8, 12, 2],
  ]
  const unidades: CellValue[][] = [
    SALE_UNIT_HEADERS,
    ['GAL-12', 'Unidad', 'NIU', 1, 'no', 'si', 1.5, 1.4, 1.3, 1],
    ['GAL-12', 'Caja x12', 'BX', 12, 'no', 'no', 16, 15, 14, 2],
  ]
  const precios: CellValue[][] = [
    BRANCH_PRICE_HEADERS,
    ['ARR-KG', b1, '', 4.8],
    ['GAL-12', b2, 'Caja x12', 15.5],
  ]
  const stocks: CellValue[][] = [
    BRANCH_STOCK_HEADERS,
    ['ARR-KG', b1, 100],
    ['GAL-12', b1, 240],
  ]
  const bytes = await writeXlsx({
    sheets: [
      { name: SHEET_PRODUCTS, rows: productos },
      { name: SHEET_PRESENTATIONS, rows: presentaciones },
      { name: SHEET_SALE_UNITS, rows: unidades },
      { name: SHEET_BRANCH_PRICES, rows: precios },
      { name: SHEET_BRANCH_STOCKS, rows: stocks },
      { name: SHEET_INSTRUCTIONS, rows: INSTRUCTIONS.map((t) => [t]) },
    ],
  })
  await downloadXlsxBytes(bytes, 'plantilla-productos-avanzada.xlsx')
}

// ── Lectura y validación ─────────────────────────────────────────────────────────────────────────

function sheetKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]/g, '')
}

type Rec = { row: number; cell: Record<string, CellValue> }

const COLUMN_ALIASES: Record<string, string> = {
  code: 'codigo', sku: 'codigo',
  name: 'nombre', presentacion: 'nombre', unidad_de_venta: 'nombre',
  price: 'precio', precio_venta: 'precio',
  stock: 'stock_inicial', cantidad_inicial: 'stock_inicial',
  order: 'orden', sort_order: 'orden',
  unit: 'unidad', codigo_sunat: 'unidad',
  factor_conversion: 'factor', conversion_factor: 'factor',
  permite_decimales: 'permite_fraccion', allow_fraction: 'permite_fraccion', fraccion: 'permite_fraccion',
  base: 'es_base', is_base: 'es_base',
  price1: 'precio1', precio_1: 'precio1', price2: 'precio2', precio_2: 'precio2', price3: 'precio3', precio_3: 'precio3',
  branch: 'sucursal', sucursal_nombre: 'sucursal',
  unidad_de_venta_nombre: 'unidad_venta', sale_unit: 'unidad_venta',
  quantity: 'cantidad', stock_final: 'cantidad', sucursales: 'sucursal',
}

function canonicalHeader(raw: unknown): string {
  // No usa normalizeHeader de la básica: sus alias (sucursal→sucursales, cantidad→stock_inicial…)
  // chocan con los nombres de columna de las hojas hijas.
  const n = String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_')
  return COLUMN_ALIASES[n] ?? n
}

/** Lee una hoja hija: devuelve registros por fila (saltando filas vacías) con el nº de fila real de Excel. */
function readRecords(rows: CellValue[][] | undefined): { headers: string[]; records: Rec[] } {
  if (!rows || rows.length === 0) return { headers: [], records: [] }
  const headers = (rows[0] ?? []).map(canonicalHeader)
  const records: Rec[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] ?? []
    if (r.every((c) => c == null || String(c).trim() === '')) continue
    const cell: Record<string, CellValue> = {}
    headers.forEach((h, idx) => {
      if (h && !(h in cell)) cell[h] = r[idx] ?? null
    })
    records.push({ row: i + 1, cell })
  }
  return { headers, records }
}

function isBlank(v: CellValue | undefined): boolean {
  return v == null || String(v).trim() === ''
}

/** undefined = vacío; NaN = no es número. Acepta coma decimal. */
function parseNum(v: CellValue | undefined): number | undefined {
  if (isBlank(v)) return undefined
  if (typeof v === 'number') return v
  const n = normalizeDecimalComma(String(v).trim() as CellValue)
  return Number(typeof n === 'string' ? n : n)
}

const str = (v: CellValue | undefined) => String(v ?? '').trim()

export async function validateAdvancedProductExcel(file: File): Promise<AdvancedParseResult> {
  const buf = await file.arrayBuffer()
  const wb = await readXlsx(new Uint8Array(buf))
  const byKey = new Map<string, CellValue[][]>()
  for (const s of wb.sheets) byKey.set(sheetKey(s.name), (s.rows ?? []) as CellValue[][])

  const errors: AdvancedIssue[] = []
  const counts = { products: 0, presentations: 0, saleUnits: 0, branchPrices: 0, branchStocks: 0 }
  const fail = (): AdvancedParseResult => ({ items: [], errors, counts })

  const productRows = byKey.get(sheetKey(SHEET_PRODUCTS))
  if (!productRows || productRows.length < 2) {
    errors.push({ sheet: SHEET_PRODUCTS, row: 0, message: 'No se encontró la hoja «Productos» con datos. Descargue la plantilla avanzada.' })
    return fail()
  }

  // Hoja Productos: mismo parser que la básica, con el nº de fila real de Excel de cada fila no vacía.
  const dataRowNumbers: number[] = []
  for (let i = 1; i < productRows.length; i++) {
    if ((productRows[i] ?? []).some((c) => c != null && String(c).trim() !== '')) dataRowNumbers.push(i + 1)
  }
  const v = validateCatalogProductRows(productRows, dataRowNumbers)
  for (const e of v.errors) {
    errors.push({ sheet: SHEET_PRODUCTS, row: e.row, message: `${String(e.field || e.column)}: ${e.message}` })
  }
  const products: ParsedCatalogImportRow[] = []
  for (const p of v.rows) {
    if (!p.codigo) {
      errors.push({ sheet: SHEET_PRODUCTS, row: p.rowNumber, message: 'codigo: es obligatorio en la importación avanzada' })
      continue
    }
    products.push(p)
  }
  counts.products = products.length
  const byCode = new Map<string, BulkImportAdvancedItemPayload>()
  const prodByCode = new Map<string, ParsedCatalogImportRow>()
  const items: BulkImportAdvancedItemPayload[] = []
  for (const p of products) {
    const item = rowToBulkPayload(p, v.hasExpiryColumn) as BulkImportAdvancedItemPayload
    byCode.set(p.codigo.toLowerCase(), item)
    prodByCode.set(p.codigo.toLowerCase(), p)
    items.push(item)
  }

  /** Resuelve el producto de una fila hija (código obligatorio y existente en la hoja Productos). */
  const owner = (sheet: string, rec: Rec): BulkImportAdvancedItemPayload | null => {
    const code = str(rec.cell.codigo)
    if (!code) {
      errors.push({ sheet, row: rec.row, message: 'codigo: es obligatorio' })
      return null
    }
    const it = byCode.get(code.toLowerCase())
    if (!it) {
      errors.push({ sheet, row: rec.row, message: `El código «${code}» no existe en la hoja Productos (fila huérfana)` })
      return null
    }
    return it
  }

  const requireHeaders = (sheet: string, headers: string[], required: string[]): boolean => {
    const missing = required.filter((h) => !headers.includes(h))
    if (missing.length > 0) {
      errors.push({ sheet, row: 1, message: `Faltan columnas obligatorias: ${missing.join(', ')}` })
      return false
    }
    return true
  }

  // Presentaciones
  {
    const { headers, records } = readRecords(byKey.get(sheetKey(SHEET_PRESENTATIONS)))
    if (records.length > 0 && requireHeaders(SHEET_PRESENTATIONS, headers, ['codigo', 'nombre', 'precio'])) {
      for (const rec of records) {
        counts.presentations++
        const it = owner(SHEET_PRESENTATIONS, rec)
        if (!it) continue
        const name = str(rec.cell.nombre)
        const price = parseNum(rec.cell.precio)
        const stock = parseNum(rec.cell.stock_inicial)
        const order = parseNum(rec.cell.orden)
        if (!name) { errors.push({ sheet: SHEET_PRESENTATIONS, row: rec.row, message: 'nombre: es obligatorio' }); continue }
        if (price == null || Number.isNaN(price) || price <= 0) { errors.push({ sheet: SHEET_PRESENTATIONS, row: rec.row, message: 'precio: debe ser un número mayor a 0' }); continue }
        if (stock != null && (Number.isNaN(stock) || stock < 0)) { errors.push({ sheet: SHEET_PRESENTATIONS, row: rec.row, message: 'stock_inicial: debe ser un número mayor o igual a 0' }); continue }
        if (order != null && Number.isNaN(order)) { errors.push({ sheet: SHEET_PRESENTATIONS, row: rec.row, message: 'orden: debe ser un número' }); continue }
        const list = (it.presentations ??= [])
        if (list.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
          errors.push({ sheet: SHEET_PRESENTATIONS, row: rec.row, message: `La presentación «${name}» está repetida para el producto «${str(rec.cell.codigo)}»` })
          continue
        }
        if (stock != null && stock > 0 && !it.manage_stock) {
          errors.push({ sheet: SHEET_PRESENTATIONS, row: rec.row, message: 'stock_inicial requiere control_stock = si en la hoja Productos' })
          continue
        }
        list.push({ row_number: rec.row, name, sale_price: price, ...(stock ? { initial_stock: stock } : {}), ...(order ? { sort_order: order } : {}) })
      }
    }
  }

  // Unidades de venta
  {
    const { headers, records } = readRecords(byKey.get(sheetKey(SHEET_SALE_UNITS)))
    if (records.length > 0 && requireHeaders(SHEET_SALE_UNITS, headers, ['codigo', 'nombre', 'unidad', 'factor', 'precio1'])) {
      for (const rec of records) {
        counts.saleUnits++
        const it = owner(SHEET_SALE_UNITS, rec)
        if (!it) continue
        const name = str(rec.cell.nombre)
        const unit = str(rec.cell.unidad).toUpperCase()
        const factor = parseNum(rec.cell.factor)
        const p1 = parseNum(rec.cell.precio1)
        const p2 = parseNum(rec.cell.precio2)
        const p3 = parseNum(rec.cell.precio3)
        const order = parseNum(rec.cell.orden)
        const isBase = parseExcelBoolean(rec.cell.es_base)
        const issue = (message: string) => errors.push({ sheet: SHEET_SALE_UNITS, row: rec.row, message })
        if (!name) { issue('nombre: es obligatorio'); continue }
        if (!unit) { issue('unidad: es obligatoria (código SUNAT: NIU, KGM, GRM, LTR, MLT, BX…)'); continue }
        if (factor == null || Number.isNaN(factor) || factor <= 0) { issue('factor: debe ser un número mayor a 0'); continue }
        if (isBase && factor !== 1) { issue('la unidad base (es_base = si) debe tener factor 1'); continue }
        if (p1 == null || Number.isNaN(p1) || p1 <= 0) { issue('precio1: debe ser un número mayor a 0'); continue }
        if (p2 != null && (Number.isNaN(p2) || p2 <= 0)) { issue('precio2: debe ser mayor a 0 (o vacío)'); continue }
        if (p3 != null && (Number.isNaN(p3) || p3 <= 0)) { issue('precio3: debe ser mayor a 0 (o vacío)'); continue }
        if (order != null && Number.isNaN(order)) { issue('orden: debe ser un número'); continue }
        const list = (it.sale_units ??= [])
        if (list.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
          issue(`La unidad de venta «${name}» está repetida para el producto «${str(rec.cell.codigo)}»`)
          continue
        }
        if (isBase && list.some((x) => x.is_base)) {
          issue(`El producto «${str(rec.cell.codigo)}» ya tiene otra unidad base: solo una unidad puede ser es_base`)
          continue
        }
        list.push({
          row_number: rec.row, name, unit, conversion_factor: factor, allow_fraction: parseExcelBoolean(rec.cell.permite_fraccion),
          is_base: isBase, price1: p1,
          ...(p2 != null ? { price2: p2 } : {}), ...(p3 != null ? { price3: p3 } : {}), ...(order ? { sort_order: order } : {}),
        })
      }
    }
  }

  // Precios por sucursal
  {
    const { headers, records } = readRecords(byKey.get(sheetKey(SHEET_BRANCH_PRICES)))
    if (records.length > 0 && requireHeaders(SHEET_BRANCH_PRICES, headers, ['codigo', 'sucursal', 'precio'])) {
      for (const rec of records) {
        counts.branchPrices++
        const it = owner(SHEET_BRANCH_PRICES, rec)
        if (!it) continue
        const branch = str(rec.cell.sucursal)
        const unitName = str(rec.cell.unidad_venta)
        const price = parseNum(rec.cell.precio)
        const issue = (message: string) => errors.push({ sheet: SHEET_BRANCH_PRICES, row: rec.row, message })
        if (!branch) { issue('sucursal: es obligatoria'); continue }
        if (price == null || Number.isNaN(price) || price <= 0) { issue('precio: debe ser un número mayor a 0'); continue }
        const list = (it.branch_prices ??= [])
        if (list.some((x) => x.branch_name.toLowerCase() === branch.toLowerCase() && (x.sale_unit_name ?? '').toLowerCase() === unitName.toLowerCase())) {
          issue('Precio repetido para la misma sucursal y unidad de venta')
          continue
        }
        list.push({ row_number: rec.row, branch_name: branch, ...(unitName ? { sale_unit_name: unitName } : {}), sale_price: price })
      }
    }
  }

  // Stock por sucursal
  {
    const { headers, records } = readRecords(byKey.get(sheetKey(SHEET_BRANCH_STOCKS)))
    if (records.length > 0 && requireHeaders(SHEET_BRANCH_STOCKS, headers, ['codigo', 'sucursal', 'cantidad'])) {
      for (const rec of records) {
        counts.branchStocks++
        const it = owner(SHEET_BRANCH_STOCKS, rec)
        if (!it) continue
        const branch = str(rec.cell.sucursal)
        const qty = parseNum(rec.cell.cantidad)
        const issue = (message: string) => errors.push({ sheet: SHEET_BRANCH_STOCKS, row: rec.row, message })
        if (!branch) { issue('sucursal: es obligatoria'); continue }
        if (qty == null || Number.isNaN(qty) || qty < 0) { issue('cantidad: debe ser un número mayor o igual a 0'); continue }
        if (!it.manage_stock) { issue('el producto no controla stock (control_stock = no en la hoja Productos)'); continue }
        const list = (it.branch_stocks ??= [])
        if (list.some((x) => x.branch_name.toLowerCase() === branch.toLowerCase())) {
          issue(`Sucursal «${branch}» repetida para el producto «${str(rec.cell.codigo)}»`)
          continue
        }
        list.push({ row_number: rec.row, branch_name: branch, quantity: qty })
      }
    }
  }

  // Reglas entre hojas (una vez cargadas todas).
  for (const [code, it] of byCode) {
    const p = prodByCode.get(code)!
    const pres = it.presentations ?? []
    const units = it.sale_units ?? []
    if (pres.length > 0 && units.length > 0) {
      errors.push({
        sheet: SHEET_SALE_UNITS, row: units[0].row_number,
        message: `El producto «${p.codigo}» tiene presentaciones y unidades de venta: no pueden convivir (use solo una de las dos hojas)`,
      })
    }
    if (pres.length > 0 && (it.branch_stocks ?? []).length > 0) {
      errors.push({
        sheet: SHEET_BRANCH_STOCKS, row: it.branch_stocks![0].row_number,
        message: `El producto «${p.codigo}» tiene presentaciones: su stock va en la columna stock_inicial de la hoja Presentaciones`,
      })
    }
    if (pres.length > 0 && p.stock_inicial > 0) {
      errors.push({
        sheet: SHEET_PRODUCTS, row: p.rowNumber,
        message: `El producto «${p.codigo}» tiene presentaciones: su stock va en la hoja Presentaciones, deje stock_inicial en 0`,
      })
    }
    for (const bp of it.branch_prices ?? []) {
      const sn = (bp.sale_unit_name ?? '').toLowerCase()
      if (sn && units.length > 0 && !units.some((u) => u.name.toLowerCase() === sn)) {
        errors.push({
          sheet: SHEET_BRANCH_PRICES, row: bp.row_number,
          message: `La unidad de venta «${bp.sale_unit_name}» no está en la hoja Unidades de venta para «${p.codigo}»`,
        })
      }
    }
  }

  errors.sort((a, b) => a.sheet.localeCompare(b.sheet) || a.row - b.row)
  return { items, errors, counts }
}

// ── Envío por lotes ──────────────────────────────────────────────────────────────────────────────

export type AdvancedTotals = {
  created: number
  updated: number
  stockRegistered: number
  presentations: { created: number; updated: number; deactivated: number }
  saleUnits: { created: number; updated: number; deactivated: number }
  branchPrices: { created: number; updated: number; deactivated: number }
  branchStocksSet: number
  failed: { row: number; name: string; error: string }[]
}

export type AdvancedProgress = { done: number; total: number; current?: string }

function emptyTotals(): AdvancedTotals {
  return {
    created: 0, updated: 0, stockRegistered: 0,
    presentations: { created: 0, updated: 0, deactivated: 0 },
    saleUnits: { created: 0, updated: 0, deactivated: 0 },
    branchPrices: { created: 0, updated: 0, deactivated: 0 },
    branchStocksSet: 0, failed: [],
  }
}

function addResult(t: AdvancedTotals, r: BulkImportAdvancedResultPayload) {
  t.created += r.created ?? 0
  t.updated += r.updated ?? 0
  t.stockRegistered += r.stock_registered ?? 0
  t.presentations.created += r.presentations_created ?? 0
  t.presentations.updated += r.presentations_updated ?? 0
  t.presentations.deactivated += r.presentations_deactivated ?? 0
  t.saleUnits.created += r.sale_units_created ?? 0
  t.saleUnits.updated += r.sale_units_updated ?? 0
  t.saleUnits.deactivated += r.sale_units_deactivated ?? 0
  t.branchPrices.created += r.branch_prices_created ?? 0
  t.branchPrices.updated += r.branch_prices_updated ?? 0
  t.branchPrices.deactivated += r.branch_prices_deactivated ?? 0
  t.branchStocksSet += r.branch_stocks_set ?? 0
  t.failed.push(...(r.failed ?? []))
}

/**
 * Envía los productos por lotes de 200. Con dryRun=true el servidor simula todo y revierte: sirve
 * para mostrar el resumen (creados / modificados / hijos desactivados) y los errores antes de importar.
 */
export async function runAdvancedBatches(
  items: BulkImportAdvancedItemPayload[],
  branchId: number,
  dryRun: boolean,
  onProgress?: (p: AdvancedProgress) => void,
): Promise<AdvancedTotals> {
  const totals = emptyTotals()
  for (let offset = 0; offset < items.length; offset += ADVANCED_BATCH_SIZE) {
    const chunk = items.slice(offset, offset + ADVANCED_BATCH_SIZE)
    onProgress?.({ done: offset, total: items.length, current: chunk[0]?.name })
    try {
      addResult(totals, await productsService.bulkImportAdvanced(chunk, branchId, dryRun))
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (e instanceof Error ? e.message : 'Error al enviar el lote')
      for (const it of chunk) totals.failed.push({ row: it.row_number, name: it.name, error: msg })
    }
    onProgress?.({ done: offset + chunk.length, total: items.length })
  }
  return totals
}
