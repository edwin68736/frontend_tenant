/**
 * Unidades de medida frecuentes (códigos SUNAT catálogo 03 / lista de comprobantes).
 * Etiquetas en español para UI; el valor enviado al backend es siempre `code`.
 */
export type SunatUnitRow = { code: string; label: string }

export const SUNAT_UNITS: SunatUnitRow[] = [
  { code: 'NIU', label: 'NIU — Unidad (bien)' },
  { code: 'ZZ', label: 'ZZ — Servicio' },
  { code: 'KGM', label: 'KGM — Kilogramo' },
  { code: 'LTR', label: 'LTR — Litro' },
  { code: 'MTR', label: 'MTR — Metro' },
  { code: 'MTK', label: 'MTK — Metro cuadrado' },
  { code: 'MTQ', label: 'MTQ — Metro cúbico' },
  { code: 'TNE', label: 'TNE — Tonelada métrica' },
  { code: 'GLL', label: 'GLL — Galón' },
  { code: 'BX', label: 'BX — Caja' },
  { code: 'BG', label: 'BG — Bolsa' },
  { code: 'BO', label: 'BO — Botella' },
  { code: 'PK', label: 'PK — Paquete' },
  { code: 'SET', label: 'SET — Juego' },
  { code: 'KT', label: 'KT — Kit' },
  { code: 'DZN', label: 'DZN — Docena' },
  { code: 'GRM', label: 'GRM — Gramo' },
  { code: 'C62', label: 'C62 — Unidad (pieza)' },
  { code: 'UND', label: 'UND — Unidad (uso comercial)' },
  { code: 'BLT', label: 'BLT — Bulto' },
  { code: 'CJA', label: 'CJA — Caja (comercial)' },
  { code: 'PAQ', label: 'PAQ — Paquete (comercial)' },
]

/** Unidades para bienes / productos con inventario (excluye ZZ = servicio). */
export const SUNAT_PRODUCT_UNITS: SunatUnitRow[] = SUNAT_UNITS.filter((u) => u.code !== 'ZZ')

/**
 * Opciones del registro de producto (solo nombre visible; el `code` SUNAT va al backend).
 * Orden: Unidades por defecto (NIU), luego el resto.
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

export function isProductUnitFormCode(code: string): boolean {
  return PRODUCT_UNIT_FORM_CODE_SET.has((code || '').trim().toUpperCase())
}

/** Texto para UI sin exponer códigos SUNAT (panel, servicio, unidades heredadas). */
export function productUnitFormDisplayName(code: string): string {
  const c = (code || '').trim().toUpperCase()
  if (c === 'ZZ') return 'Servicio'
  const opt = PRODUCT_UNIT_FORM_OPTIONS.find((o) => o.code === c)
  if (opt) return opt.displayName
  const row = SUNAT_UNITS.find((u) => u.code === c)
  if (row) {
    const parts = row.label.split(' — ')
    if (parts.length >= 2) return parts.slice(1).join(' — ')
    return row.label
  }
  return c || '—'
}

export function sunatUnitLabel(code: string): string {
  const c = (code || '').trim().toUpperCase()
  const row = SUNAT_UNITS.find((u) => u.code === c)
  return row ? row.label : c
}
