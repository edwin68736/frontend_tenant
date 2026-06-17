/**
 * Cálculo de IGV por ítem alineado con el backend (pkg/tax).
 * Respeta tipo de afectación SUNAT (Cat. N°07) y si el precio incluye IGV.
 * Soporta exención global (zona selva, régimen exonerated).
 */

import { roundSunat } from '@/utils/money'

export interface TaxConfig {
  taxRate: number
  igvRegime?: string
  taxBenefitZone?: boolean
}

/** Tasa efectiva según tipo de afectación y config tributaria. */
export function effectiveRate(
  igvAffectationType: string,
  taxRatePercent: number,
  taxConfig?: Partial<TaxConfig>
): number {
  const code = String(igvAffectationType || '10').trim()
  switch (code) {
    case '20':
    case '30':
    case '40':
      return 0
    default:
      if (taxConfig?.taxBenefitZone && taxConfig?.igvRegime === 'exonerated') {
        return 0
      }
      return taxRatePercent
  }
}

/** Categoría SUNAT para agrupar totales (Cat. N°07). */
export type SunatAfectacionGroup = 'gravado' | 'exonerado' | 'inafecto' | 'exportacion'

/** Retorna el grupo de afectación SUNAT según el código del ítem. */
export function getAfectacionGroup(igvAffectationType: string): SunatAfectacionGroup {
  const code = String(igvAffectationType || '10').trim()
  switch (code) {
    case '20':
    case '21':
      return 'exonerado'
    case '30':
    case '31':
    case '32':
    case '33':
    case '34':
    case '35':
    case '36':
      return 'inafecto'
    case '40':
      return 'exportacion'
    default:
      return 'gravado'
  }
}

/**
 * Calcula subtotal, IGV y total por ítem.
 * price = precio unitario ingresado; si priceIncludesIgv es true, se descompone.
 * taxConfig opcional: si tenant tiene exención global (zona selva), rate = 0.
 */
export function calcItem(
  unitPrice: number,
  quantity: number,
  discount: number,
  igvAffectationType: string,
  priceIncludesIgv: boolean,
  taxRatePercent: number,
  taxConfig?: Partial<TaxConfig>
): { subtotal: number; taxAmount: number; total: number } {
  const rate = effectiveRate(igvAffectationType, taxRatePercent, taxConfig)
  const gross = quantity * unitPrice - discount

  if (rate === 0) {
    return { subtotal: gross, taxAmount: 0, total: gross }
  }

  if (priceIncludesIgv) {
    const subtotal = gross / (1 + rate / 100)
    const taxAmount = subtotal * (rate / 100)
    return { subtotal, taxAmount, total: subtotal + taxAmount }
  }

  const subtotal = gross
  const taxAmount = gross * (rate / 100)
  return { subtotal, taxAmount, total: subtotal + taxAmount }
}

/**
 * Aplica descuento sobre la base imponible (subtotal) y recalcula IGV y total.
 */
export function calcItemWithSubtotalDiscount(
  unitPrice: number,
  quantity: number,
  subtotalDiscount: number,
  igvAffectationType: string,
  priceIncludesIgv: boolean,
  taxRatePercent: number,
  taxConfig?: Partial<TaxConfig>,
): { subtotal: number; taxAmount: number; total: number } {
  const base = calcItem(unitPrice, quantity, 0, igvAffectationType, priceIncludesIgv, taxRatePercent, taxConfig)
  const rate = effectiveRate(igvAffectationType, taxRatePercent, taxConfig)
  const disc = Math.max(0, Number(subtotalDiscount) || 0)
  const newSubtotal = roundSunat(Math.max(0, base.subtotal - disc))

  if (rate === 0) {
    return { subtotal: newSubtotal, taxAmount: 0, total: newSubtotal }
  }

  const taxAmount = roundSunat(newSubtotal * (rate / 100))
  const total = roundSunat(newSubtotal + taxAmount)
  return { subtotal: newSubtotal, taxAmount, total }
}

/** Convierte descuento en base imponible al monto `discount` que espera el backend en CalcItem. */
export function subtotalDiscountToLineDiscount(
  unitPrice: number,
  quantity: number,
  subtotalDiscount: number,
  igvAffectationType: string,
  priceIncludesIgv: boolean,
  taxRatePercent: number,
  taxConfig?: Partial<TaxConfig>,
): number {
  const disc = Math.max(0, Number(subtotalDiscount) || 0)
  if (disc <= 0) return 0
  const rate = effectiveRate(igvAffectationType, taxRatePercent, taxConfig)
  if (rate === 0) return roundSunat(disc)
  if (priceIncludesIgv) return roundSunat(disc * (1 + rate / 100))
  return roundSunat(disc)
}
