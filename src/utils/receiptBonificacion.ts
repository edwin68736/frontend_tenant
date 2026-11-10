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

import { sunatUnitCode } from '@/constants/sunatUnits'
import { isGravadoOperacionNoOnerosa } from '@/constants/igvAffectation'
import type { PrintItem } from '@/types/printData'
import { formatAmountDisplay, formatUnitPrice, roundDisplay, roundSunat } from '@/utils/money'

export function receiptItemIsOperacionGratuita(it: Pick<PrintItem, 'igv_affectation_type'>): boolean {
  return isGravadoOperacionNoOnerosa(it.igv_affectation_type ?? '')
}

/** @deprecated Use receiptItemIsOperacionGratuita — conservado por compatibilidad. */
export function receiptItemIsBonificacion(it: Pick<PrintItem, 'igv_affectation_type'>): boolean {
  return receiptItemIsOperacionGratuita(it)
}

/** Entrada de modifiers_json tal como se guardó (parseStoredModifiers pierde el tipo "combo"). */
type ReceiptModifierEntry = { kind: 'variant' | 'modifier' | 'combo'; name: string; price: number }

function receiptModifierEntries(raw: string | null | undefined): ReceiptModifierEntry[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: ReceiptModifierEntry[] = []
    for (const row of parsed) {
      if (row == null || typeof row !== 'object') continue
      const x = row as { type?: string; group_type?: string; option_name?: string; name?: string; extra_price?: number }
      const name = String(x.option_name ?? x.name ?? '').trim()
      if (!name) continue
      const t = x.type ?? x.group_type
      out.push({ kind: t === 'variant' ? 'variant' : t === 'combo' ? 'combo' : 'modifier', name, price: Number(x.extra_price) || 0 })
    }
    return out
  } catch {
    return []
  }
}

/**
 * Detalle de lo que compone el precio de la línea: "Precio base" + cada extra/adicional/componente con su
 * precio. Sin esto el cliente solo ve un precio unitario mayor al del producto y no sabe por qué paga de más.
 * Los precios son por unidad (igual que la columna P.U.); el unit_price ya incluye los sobreprecios.
 * Un combo lista lo que incluye ("- Papas") y solo muestra precio en lo que tiene sobreprecio.
 */
export function receiptItemModifierLines(it: PrintItem): string[] {
  const extras = receiptModifierEntries(it.modifiers_json).filter((m) => m.kind !== 'variant')
  if (extras.length === 0) return []
  const surcharge = extras.reduce((sum, m) => sum + m.price, 0)
  const lines: string[] = []
  const isCombo = extras.some((m) => m.kind === 'combo')
  const base = roundDisplay((it.unit_price ?? 0) - surcharge)
  if (surcharge > 0 && base >= 0) lines.push(`${isCombo ? 'Precio del combo' : 'Precio base'} S/ ${formatAmountDisplay(base)}`)
  for (const m of extras) {
    if (m.kind === 'combo' && m.price <= 0) lines.push(`- ${m.name}`)
    else lines.push(m.price > 0 ? `+ ${m.name} (+S/ ${formatAmountDisplay(m.price)})` : `+ ${m.name}`)
  }
  return lines
}

/** Descripción de la línea para TODOS los comprobantes (ticket, A4, impresión directa y vista previa): nombre
 *  (con su presentación), desglose de extras/combos con precio y nota de línea, cada uno en su renglón. */
export function receiptItemDisplayDescription(it: PrintItem): string {
  let base = (it.description || '').trim() || '—'
  const pres = receiptModifierEntries(it.modifiers_json).find((m) => m.kind === 'variant')?.name ?? ''
  if (pres && !base.toLowerCase().includes(pres.toLowerCase())) base = `${base} - ${pres}`
  // La nota de línea ("segundo uso", "sin caja") va debajo. Este helper es el punto único de todos los
  // renderizadores, así que cubre ticket, A4, impresión directa y vista previa.
  const parts = [base, ...receiptItemModifierLines(it)]
  const note = (it.item_note || '').trim()
  if (note) parts.push(`(${note})`)
  return parts.join('\n')
}

/** Importe de línea (TOTAL / Imp.): legacy `document_items.total` (0 en 11–16). */
export function receiptItemDisplayTotal(it: PrintItem, formatAmount: (n: number) => string): string {
  return formatAmount(it.total ?? 0)
}

/** Precio unitario (P.UNIT / P.U.): legacy `document_items.unit_price` referencial. */
export function receiptItemDisplayUnitPrice(it: PrintItem, formatAmount: (n: number) => string): string {
  const price = it.unit_price ?? 0
  // Precio por gramo/mililitro (S/ 0.0045): a 2 decimales saldría "0.00" en el comprobante.
  return roundDisplay(price) === roundSunat(price) ? formatAmount(price) : formatUnitPrice(price)
}

/**
 * Unidad a mostrar en la columna UNID (ticket/A4): siempre el código SUNAT del catálogo 03
 * (NIU, ZZ, BX, KGM…), el mismo que viaja al facturador. Antes se mostraba el nombre visible
 * ("Unid", "Serv"), que no coincidía con el comprobante electrónico y se cortaba en la columna
 * angosta del ticket. `unit_display` (nombre comercial) queda disponible para otras vistas.
 */
export function receiptItemDisplayUnit(it: PrintItem): string {
  return sunatUnitCode(it.unit ?? '')
}
