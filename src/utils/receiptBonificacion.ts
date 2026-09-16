/**
 * Operaciones gratuitas gravadas (11–16).
 *
 * El XML enviado a SUNAT utiliza la estructura UBL requerida
 * para operaciones no onerosas.
 *
 * Sin embargo, para la representación impresa se replica el
 * comportamiento del sistema legacy mostrando el precio
 * referencial del producto como Precio Unitario y un Importe
 * de línea igual a 0.00.
 *
 * Este comportamiento es únicamente visual y no modifica la
 * información enviada a SUNAT.
 */

import { isGravadoOperacionNoOnerosa } from '@/constants/igvAffectation'
import type { PrintItem } from '@/types/printData'

export function receiptItemIsOperacionGratuita(it: Pick<PrintItem, 'igv_affectation_type'>): boolean {
  return isGravadoOperacionNoOnerosa(it.igv_affectation_type ?? '')
}

/** @deprecated Use receiptItemIsOperacionGratuita — conservado por compatibilidad. */
export function receiptItemIsBonificacion(it: Pick<PrintItem, 'igv_affectation_type'>): boolean {
  return receiptItemIsOperacionGratuita(it)
}

export function receiptItemDisplayDescription(it: PrintItem): string {
  const base = (it.description || '').trim() || '—'
  // La nota de línea ("segundo uso", "sin caja") va debajo de la descripción. Este helper es
  // el punto único de todos los renderizadores, así que cubre ticket, A4 e impresión directa.
  const note = (it.item_note || '').trim()
  return note ? `${base}\n(${note})` : base
}

/** Importe de línea (TOTAL / Imp.): legacy `document_items.total` (0 en 11–16). */
export function receiptItemDisplayTotal(it: PrintItem, formatAmount: (n: number) => string): string {
  return formatAmount(it.total ?? 0)
}

/** Precio unitario (P.UNIT / P.U.): legacy `document_items.unit_price` referencial. */
export function receiptItemDisplayUnitPrice(it: PrintItem, formatAmount: (n: number) => string): string {
  return formatAmount(it.unit_price ?? 0)
}

/**
 * Alias compacto SOLO para la columna UNID del comprobante impreso — la columna del ticket
 * térmico es angosta (9mm) y "Unidades" (nombre visible de NIU en el resto de la UI, ver
 * constants/sunatUnits.ts) no entraba sin partirse en dos líneas. No afecta al nombre mostrado en
 * ningún otro lugar de la app (formularios, POS, historial) ni al código SUNAT — puramente
 * cosmético para impresión (Fase 7F, corrección visual). Nunca se aplica al nombre comercial de
 * una SaleUnit real (ese "debe mantenerse completo" — solo actúa cuando la etiqueta cae al nombre
 * de la unidad base, que es lo único que produce hoy un valor igual a esta clave).
 */
const COMPACT_PRINT_UNIT_LABELS: Record<string, string> = {
  Unidades: 'Unidad',
}

/**
 * Unidad a mostrar en la columna UNID (ticket/A4): el nombre comercial de la SaleUnit si ya se
 * resolvió (`unit_display`, ver utils/saleUnitNames.ts — Fase 7F), o el código SUNAT tal cual
 * (`unit`) si no se resolvió — mismo comportamiento que antes de esta fase. El dato fiscal
 * (`unit`, lo que viaja a SUNAT) nunca se modifica; esto es solo la columna visual del comprobante.
 */
export function receiptItemDisplayUnit(it: PrintItem): string {
  const label = (it.unit_display || it.unit || '').trim()
  return COMPACT_PRINT_UNIT_LABELS[label] ?? label
}
