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
  return (it.description || '').trim() || '—'
}

/** Importe de línea (TOTAL / Imp.): legacy `document_items.total` (0 en 11–16). */
export function receiptItemDisplayTotal(it: PrintItem, formatAmount: (n: number) => string): string {
  return formatAmount(it.total ?? 0)
}

/** Precio unitario (P.UNIT / P.U.): legacy `document_items.unit_price` referencial. */
export function receiptItemDisplayUnitPrice(it: PrintItem, formatAmount: (n: number) => string): string {
  return formatAmount(it.unit_price ?? 0)
}
