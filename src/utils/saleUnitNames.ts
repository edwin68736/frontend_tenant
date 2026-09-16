import { productsService } from '@/services/products.service'
import { sunatUnitDisplayName } from '@/constants/sunatUnits'
import type { PrintData } from '@/types/printData'

/**
 * Caché de nombres comerciales de SaleUnit (Fase 7F), a nivel de módulo — vive mientras dure la
 * sesión del navegador. Evita repetir `getSaleUnit` para la misma combinación producto+SaleUnit
 * al reabrir el mismo detalle de venta o al tener varias líneas con la misma SaleUnit. No usa
 * localStorage: es solo una conveniencia de sesión, no un dato que deba sobrevivir un refresh.
 */
const cache = new Map<string, string>()

function cacheKey(productId: number, saleUnitId: number): string {
  return `${productId}:${saleUnitId}`
}

type SaleUnitLine = { product_id?: number | null; sale_unit_id?: number | null }

/**
 * Resuelve en un solo batch (con caché) el nombre comercial de cada SaleUnit distinta referenciada
 * por una lista de líneas. Nunca dispara una llamada por línea: agrupa por combinación
 * producto+SaleUnit única antes de pedir al backend — así N líneas con la misma SaleUnit (o un
 * detalle ya resuelto antes) no generan N llamadas.
 */
export async function resolveSaleUnitNames(lines: SaleUnitLine[]): Promise<Map<string, string>> {
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
          .then((su) => cache.set(key, su.name))
          // SaleUnit eliminada o inaccesible: se cachea vacío para no reintentar en cada render.
          .catch(() => cache.set(key, '')),
      ),
    )
  }
  const result = new Map<string, string>()
  for (const line of lines) {
    const productId = line.product_id
    const saleUnitId = line.sale_unit_id
    if (!productId || !saleUnitId) continue
    const key = cacheKey(productId, saleUnitId)
    const name = cache.get(key)
    if (name) result.set(key, name)
  }
  return result
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
