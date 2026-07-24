/**
 * Unidades de medida del sistema — códigos catálogo SUNAT 03 (tabla 6).
 * Referencia oficial: https://github.com/EliuTimana/SunatCatalogos/blob/master/data/08/03.json
 *
 * Solo incluye unidades ya usadas en TukiFac; no agregar todo el catálogo SUNAT.
 * El select de productos usa PRODUCT_UNIT_FORM_OPTIONS (subconjunto frecuente).
 */
export type SunatUnitRow = { code: string; label: string }

/** Unidades disponibles en el ERP (código SUNAT 03 interno; label = texto visible al usuario). */
export const SUNAT_UNITS: SunatUnitRow[] = [
  { code: 'NIU', label: 'Unidades' },
  { code: 'ZZ', label: 'Servicio' },
  { code: 'KGM', label: 'Kilos' },
  { code: 'LTR', label: 'Litros' },
  { code: 'MTR', label: 'Metros' },
  { code: 'MTK', label: 'Metro cuadrado' },
  { code: 'MTQ', label: 'Metro cúbico' },
  { code: 'TNE', label: 'Toneladas' },
  { code: 'GLL', label: 'Galones' },
  { code: 'BX', label: 'Cajas' },
  { code: 'BG', label: 'Bolsa' },
  { code: 'BO', label: 'Botellas' },
  { code: 'PK', label: 'Paquete' },
  { code: 'SET', label: 'Juego' },
  { code: 'KT', label: 'Kit' },
  { code: 'DZN', label: 'Docena' },
  { code: 'GRM', label: 'Gramos' },
  { code: 'C62', label: 'Piezas' },
]

/** Unidades para bienes / productos con inventario (excluye ZZ = servicio). */
export const SUNAT_PRODUCT_UNITS: SunatUnitRow[] = SUNAT_UNITS.filter((u) => u.code !== 'ZZ')

/**
 * Opciones del registro de producto (nombre visible; el `code` enviado es SUNAT 03).
 * Todos los códigos existen en catálogo 03: NIU, BG, BX, GLL, KGM, LTR, MTR, PK.
 */
export const PRODUCT_UNIT_FORM_OPTIONS: { code: string; displayName: string }[] = [
  { code: 'NIU', displayName: 'Unidades' },
  { code: 'BG', displayName: 'Bolsa' },
  { code: 'BX', displayName: 'Caja' },
  { code: 'GLL', displayName: 'Galones' },
  { code: 'KGM', displayName: 'Kilos' },
  { code: 'LTR', displayName: 'Litros' },
  { code: 'MTR', displayName: 'Metros' },
  { code: 'PK', displayName: 'Paquete' },
]

const PRODUCT_UNIT_FORM_CODE_SET = new Set(PRODUCT_UNIT_FORM_OPTIONS.map((o) => o.code))

/** Códigos SUNAT 03 válidos para normalización (unidades del sistema + destinos de alias legacy). */
const VALID_SUNAT_UNIT_CODES = new Set([
  ...SUNAT_UNITS.map((u) => u.code),
  // Solo alias legacy → código catalogo 03 (no están en el select)
  'MLT', 'BE', 'CA', 'GLI', 'LBR', 'CMT',
])

/** Alias comercial / códigos legacy incorrectos → código SUNAT 03. */
const UNIT_ALIASES: Record<string, string> = {
  LT: 'LTR',
  L: 'LTR',
  LITRO: 'LTR',
  LITROS: 'LTR',
  KG: 'KGM',
  KGS: 'KGM',
  KILO: 'KGM',
  KILOS: 'KGM',
  G: 'GRM',
  GR: 'GRM',
  GRAMO: 'GRM',
  GRAMOS: 'GRM',
  ML: 'MLT',
  GL: 'GLL',
  GAL: 'GLL',
  GALON: 'GLL',
  GALONES: 'GLL',
  M: 'MTR',
  METRO: 'MTR',
  METROS: 'MTR',
  CAJ: 'BX',
  CAJA: 'BX',
  CAJAS: 'BX',
  CJA: 'BX',
  BOLS: 'BG',
  BOLSA: 'BG',
  PQT: 'PK',
  PAQ: 'PK',
  PAQUETE: 'PK',
  DOC: 'DZN',
  JGO: 'SET',
  BULT: 'BE',
  BLT: 'BE',
  BULTO: 'BE',
  PZ: 'C62',
  PIEZA: 'C62',
  PIEZAS: 'C62',
  UND: 'NIU',
  UNIDAD: 'NIU',
  UNIDADES: 'NIU',
  UNIT: 'NIU',
  UNITS: 'NIU',
  U: 'NIU',
  UN: 'NIU',
  LAT: 'CA',
  LATA: 'CA',
  LATAS: 'CA',
}

const LEGACY_DISPLAY: Record<string, string> = {
  LT: 'Litros',
  KG: 'Kilos',
  CJA: 'Caja',
  PAQ: 'Paquete',
  BLT: 'Bulto',
  UND: 'Unidades',
}

export function isProductUnitFormCode(code: string): boolean {
  return PRODUCT_UNIT_FORM_CODE_SET.has((code || '').trim().toUpperCase())
}

/**
 * Unidades MEDIBLES (continuas): peso, volumen, longitud, superficie… admiten cantidades con
 * decimales (hasta 3, límite decimal(15,3) de la BD). ZZ (servicio) también: 1.5 horas es válido.
 * El resto (NIU, cajas, bolsas, docenas…) son DISCRETAS: solo cantidades enteras — regla de
 * negocio del ERP, no fiscal (el XML de SUNAT acepta decimales en cualquier unidad).
 */
const MEASURABLE_UNIT_CODES = new Set([
  'KGM', 'GRM', 'TNE', 'LBR', // peso
  'LTR', 'GLL', 'MLT',        // volumen
  'MTR', 'CMT', 'MTK', 'MTQ', // longitud / superficie / volumen cúbico
  'ZZ',                       // servicios (horas fraccionadas)
])

/** Resuelve alias comerciales/legacy a código catálogo 03 sin forzar ZZ→NIU. */
function resolveUnitCode(unit: string): string {
  const u = (unit || '').trim().toUpperCase()
  return UNIT_ALIASES[u] ?? u
}

/** true si la unidad admite cantidades con decimales (ver MEASURABLE_UNIT_CODES). */
export function unitAllowsDecimals(unit: string): boolean {
  return MEASURABLE_UNIT_CODES.has(resolveUnitCode(unit))
}

/** Máximo de decimales que persiste la BD en cantidades (decimal(15,3)). */
export const QUANTITY_MAX_DECIMALS = 3

/**
 * Ajusta una cantidad a la divisibilidad de la unidad: discretas → entero ≥ 1;
 * medibles → 3 decimales, mínimo 0.001. NaN/∞ → 1.
 */
export function normalizeQuantityForUnit(qty: number, unit: string): number {
  if (!Number.isFinite(qty)) return 1
  if (!unitAllowsDecimals(unit)) {
    return Math.max(1, Math.round(qty))
  }
  const factor = 10 ** QUANTITY_MAX_DECIMALS
  return Math.max(1 / factor, Math.round(qty * factor) / factor)
}

/** Nombre visible de una unidad (sin código SUNAT). */
export function sunatUnitDisplayName(code: string): string {
  const c = (code || '').trim().toUpperCase()
  if (!c) return '—'
  const opt = PRODUCT_UNIT_FORM_OPTIONS.find((o) => o.code === c)
  if (opt) return opt.displayName
  const aliased = UNIT_ALIASES[c] ?? c
  const row = SUNAT_UNITS.find((u) => u.code === aliased)
  if (row) return row.label
  if (LEGACY_DISPLAY[c]) return LEGACY_DISPLAY[c]
  return c
}

/** Texto para UI sin exponer códigos SUNAT (panel, servicio, unidades heredadas). */
export function productUnitFormDisplayName(code: string): string {
  return sunatUnitDisplayName(code)
}

export function sunatUnitLabel(code: string): string {
  return sunatUnitDisplayName(code)
}

/** Opciones para selects de unidad: value = código SUNAT, label = nombre visible. */
export function sunatUnitSelectOptions(): { value: string; label: string }[] {
  return SUNAT_UNITS.map((u) => ({
    value: u.code,
    label: u.label,
  }))
}

export function isSunatUnitCode(code: string): boolean {
  const c = (code || '').trim().toUpperCase()
  if (UNIT_ALIASES[c]) return true
  return SUNAT_UNITS.some((u) => u.code === c)
}

/** Código catálogo SUNAT 03 para comprobantes (NIU bienes, ZZ servicios). */
export function normalizeSunatUnit(unit: string, type?: 'product' | 'service' | string): string {
  const t = type === 'service' ? 'service' : 'product'
  if (t === 'service') return 'ZZ'
  let u = (unit || '').trim().toUpperCase()
  if (UNIT_ALIASES[u]) u = UNIT_ALIASES[u]
  if (!u || ['UND', 'UNIDAD', 'UNIDADES', 'UNIT', 'UNITS', 'U', 'UN'].includes(u)) return 'NIU'
  if (u === 'ZZ') return 'NIU'
  if (VALID_SUNAT_UNIT_CODES.has(u)) return u
  return 'NIU'
}
