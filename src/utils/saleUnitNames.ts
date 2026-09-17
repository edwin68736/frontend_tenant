import { productsService } from '@/services/products.service'
import { sunatUnitDisplayName } from '@/constants/sunatUnits'
import type { PrintData } from '@/types/printData'

/**
 * Caché de SaleUnits resueltas (Fase 7F: nombre comercial; Fase 7G: + allow_fraction), a nivel de
 * módulo — vive mientras dure la sesión del navegador. Evita repetir `getSaleUnit` para la misma
 * combinación producto+SaleUnit al reabrir el mismo detalle de venta, al tener varias líneas con
 * la misma SaleUnit, o al necesitar tanto el nombre como el allow_fraction de una misma línea (una
 * sola llamada resuelve ambos, nunca dos). No usa localStorage: es solo una conveniencia de
 * sesión, no un dato que deba sobrevivir un refresh.
 */
type ResolvedSaleUnit = { name: string; allow_fraction: boolean }
const cache = new Map<string, ResolvedSaleUnit>()

function cacheKey(productId: number, saleUnitId: number): string {
  return `${productId}:${saleUnitId}`
}

type SaleUnitLine = { product_id?: number | null; sale_unit_id?: number | null }

/**
 * Resuelve en un solo batch (con caché) la SaleUnit de cada línea distinta referenciada. Nunca
 * dispara una llamada por línea: agrupa por combinación producto+SaleUnit única antes de pedir al
 * backend — así N líneas con la misma SaleUnit (o un detalle ya resuelto antes) no generan N
 * llamadas. Base de `resolveSaleUnitNames`/`resolveSaleUnitAllowFraction` — ambas comparten esta
 * misma caché en vez de pedir la SaleUnit dos veces por separado.
 */
async function resolveSaleUnits(lines: SaleUnitLine[]): Promise<Map<string, ResolvedSaleUnit>> {
  const toFetch = new Map<string, [number, number]>()
  for (const line of lines) {
    const productId = line.product_id
    const saleUnitId = line.sale_unit_id
    if (!productId || !saleUnitId) continue
    const key = cacheKey(productId, saleUnitId)
    if (cache.has(key) || toFetch.has(key)) continue
    toFetch.set(key, [productId, saleUnitId])
  }
  if (toFetch.size > 0) {
    await Promise.all(
      Array.from(toFetch.entries()).map(([key, [productId, saleUnitId]]) =>
        productsService
          .getSaleUnit(productId, saleUnitId)
          .then((su) => cache.set(key, { name: su.name, allow_fraction: su.allow_fraction }))
          // SaleUnit eliminada o inaccesible: se cachea vacío para no reintentar en cada render.
          .catch(() => cache.set(key, { name: '', allow_fraction: false })),
      ),
    )
  }
  const result = new Map<string, ResolvedSaleUnit>()
  for (const line of lines) {
    const productId = line.product_id
    const saleUnitId = line.sale_unit_id
    if (!productId || !saleUnitId) continue
    const key = cacheKey(productId, saleUnitId)
    const resolved = cache.get(key)
    if (resolved && resolved.name) result.set(key, resolved)
  }
  return result
}

/**
 * Resuelve en un solo batch (con caché) el nombre comercial de cada SaleUnit distinta referenciada
 * por una lista de líneas.
 */
export async function resolveSaleUnitNames(lines: SaleUnitLine[]): Promise<Map<string, string>> {
  const resolved = await resolveSaleUnits(lines)
  const names = new Map<string, string>()
  for (const [key, su] of resolved) names.set(key, su.name)
  return names
}

/**
 * Resuelve en un solo batch (con la misma caché de `resolveSaleUnitNames`) si cada SaleUnit
 * distinta referenciada admite cantidades fraccionarias (`allow_fraction`) — Fase 7G, para que
 * BillingPage.tsx pueda validar la cantidad a devolver igual que ya hace el POS con la SaleUnit
 * (Fase 7E), sin inventar una segunda consulta al backend para el mismo dato.
 */
export async function resolveSaleUnitAllowFraction(lines: SaleUnitLine[]): Promise<Map<string, boolean>> {
  const resolved = await resolveSaleUnits(lines)
  const allowFraction = new Map<string, boolean>()
  for (const [key, su] of resolved) allowFraction.set(key, su.allow_fraction)
  return allowFraction
}

/**
 * Indica si la SaleUnit de una línea admite cantidades fraccionarias — Fase 7G (BillingPage.tsx
 * valida así la cantidad a devolver, igual que el POS ya hace al vender — Fase 7E). Devuelve
 * `undefined` si la línea no tiene SaleUnit (sale_unit_id nulo) o si todavía no se resolvió: el
 * caller decide el comportamiento de la unidad base o el valor por defecto en esos casos, este
 * helper solo resuelve el caso SaleUnit ya conocido.
 */
export function saleLineAllowsFraction(
  line: SaleUnitLine,
  allowFraction: Map<string, boolean>,
): boolean | undefined {
  const productId = line.product_id
  const saleUnitId = line.sale_unit_id
  if (!productId || !saleUnitId) return undefined
  return allowFraction.get(cacheKey(productId, saleUnitId))
}

/**
 * Etiqueta de unidad a mostrar para una línea ya resuelta (historial/detalle/impresión): el nombre
 * comercial de la SaleUnit si la línea la usó y ya se resolvió, o el nombre visible de la unidad
 * base del producto en caso contrario (línea legacy, o SaleUnit sin resolver todavía/eliminada).
 * Nunca inventa una SaleUnit: si no se pudo resolver, cae a la unidad base — igual que hace el
 * propio backend (resolveSaleItemUnitCode) cuando una SaleUnit no tiene código configurado.
 */
export function saleLineUnitLabel(
  line: SaleUnitLine & { unit?: string },
  names: Map<string, string>,
): string {
  const productId = line.product_id
  const saleUnitId = line.sale_unit_id
  if (productId && saleUnitId) {
    const name = names.get(cacheKey(productId, saleUnitId))
    if (name) return name
  }
  return sunatUnitDisplayName(line.unit ?? '')
}

/**
 * Resuelve y adjunta `unit_display` (nombre comercial) a cada línea de `printData.items` antes de
 * imprimir un ticket/PDF — Fase 7F. Devuelve un `PrintData` nuevo (no muta el original): los
 * renderizadores (receiptPdf.ts/receiptPdfA4.ts) leen `unit_display` vía receiptItemDisplayUnit,
 * cayendo al código SUNAT (`unit`) si por lo que sea no se pudo resolver — nunca rompe la
 * impresión ni bloquea el flujo por un fallo de red al resolver el catálogo.
 */
export async function enrichPrintDataWithSaleUnitNames(printData: PrintData): Promise<PrintData> {
  const names = await resolveSaleUnitNames(printData.items)
  return {
    ...printData,
    items: printData.items.map((it) => ({ ...it, unit_display: saleLineUnitLabel(it, names) })),
  }
}
