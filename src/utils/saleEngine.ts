/**
 * Motor tributario unificado de ventas (espejo de backend_go/pkg/tax/sale_engine.go).
 * Orden SUNAT/Greenter: descuento por línea → descuento global → IGV.
 *
 * Los descuentos en monto que teclea el usuario se expresan en los mismos términos que el precio:
 * con IGV cuando la línea tiene el IGV incluido (S/ 100 de descuento sobre S/ 395 dejan S/ 295), sin
 * IGV cuando el precio es sin IGV. El servidor y SUNAT trabajan siempre sobre la BASE imponible, así
 * que el motor convierte (monto ÷ (1+IGV)) y expone ese valor en `payloadDiscountValue` /
 * `globalPayloadValue`: es lo que debe viajar al backend. Los porcentajes no cambian.
 */

import { calcCheckoutDiscountAmount, distributeCheckoutDiscountToLines, type CheckoutDiscountMode } from '@/utils/checkoutDiscount'
import { isBonificacionGravada } from '@/constants/igvAffectation'
import { calcItem, calcItemWithSubtotalDiscount, effectiveRate, subtotalDiscountToLineDiscount, type TaxConfig } from '@/utils/taxCalc'
import { roundSunat } from '@/utils/money'

export type SaleLineInput = {
  unitPrice: number
  quantity: number
  igvAffectationType: string
  priceIncludesIgv: boolean
  lineDiscountMode?: CheckoutDiscountMode | ''
  lineDiscountValue?: number
}

export type SaleCheckoutInput = {
  lines: SaleLineInput[]
  globalDiscountMode?: CheckoutDiscountMode | ''
  globalDiscountValue?: number
  taxRate: number
  taxConfig?: Partial<TaxConfig>
}

export type SaleLineResult = {
  grossSubtotal: number
  lineDiscountSubtotal: number
  subtotalAfterLine: number
  globalDiscountSubtotal: number
  subtotal: number
  taxAmount: number
  total: number
  storedDiscount: number
  /** Descuento de línea tal como lo ve el cliente (con IGV si el precio lo incluye). */
  lineDiscountDisplay: number
  /** Valor a enviar al backend: monto sobre la base imponible, o el porcentaje tal cual. */
  payloadDiscountValue: number
}

export type SaleResult = {
  lines: SaleLineResult[]
  subtotal: number
  taxAmount: number
  total: number
  /** Descuento global sobre la base imponible (lo que declara el XML). */
  globalDiscountAmount: number
  /** Descuento global tal como lo ve el cliente (con IGV si los precios lo incluyen). */
  globalDiscountDisplay: number
  /** Valor a enviar al backend: monto sobre la base imponible, o el porcentaje tal cual. */
  globalPayloadValue: number
  /** Factor (1+IGV) ponderado con el que se convierte el descuento global entre base y con IGV. */
  globalFactor: number
}

/** Factor (1 + IGV) por el que se multiplica la base para llegar al importe que paga el cliente. */
function priceFactor(line: SaleLineInput, taxRate: number, taxConfig?: Partial<TaxConfig>): number {
  const rate = effectiveRate(line.igvAffectationType || '10', taxRate, taxConfig)
  return line.priceIncludesIgv && rate > 0 ? 1 + rate / 100 : 1
}

/**
 * Inversa de la conversión del motor: dado un descuento ya expresado sobre la base, el monto que
 * hay que mostrar en el formulario (con IGV). Evita que el redondeo desplace un centavo al
 * reabrir un documento guardado.
 */
export function baseDiscountToDisplayAmount(base: number, factor: number): number {
  if (!(base > 0) || !(factor > 1)) return roundSunat(base)
  const guess = roundSunat(base * factor)
  for (const cand of [guess, roundSunat(guess - 0.01), roundSunat(guess + 0.01)]) {
    if (roundSunat(cand / factor) === roundSunat(base)) return cand
  }
  return guess
}

export function calcSaleCheckout(input: SaleCheckoutInput): SaleResult {
  const { lines, taxRate, taxConfig } = input
  const n = lines.length
  const out: SaleResult = {
    lines: [],
    subtotal: 0,
    taxAmount: 0,
    total: 0,
    globalDiscountAmount: 0,
    globalDiscountDisplay: 0,
    globalPayloadValue: 0,
    globalFactor: 1,
  }
  if (n === 0) return out

  const afterLineSubs: number[] = []
  let subtotalAfterLineSum = 0

  for (const line of lines) {
    const aff = line.igvAffectationType || '10'
    const grossSub = roundSunat(calcItem(line.unitPrice, line.quantity, 0, aff, line.priceIncludesIgv, taxRate, taxConfig).subtotal)
    const lineMode = line.lineDiscountMode || 'amount'
    const typed = line.lineDiscountValue || 0
    const factor = priceFactor(line, taxRate, taxConfig)
    const lineDisc = calcCheckoutDiscountAmount(grossSub, lineMode, lineMode === 'amount' ? typed / factor : typed)
    const afterLine = roundSunat(
      calcItemWithSubtotalDiscount(
        line.unitPrice,
        line.quantity,
        lineDisc,
        aff,
        line.priceIncludesIgv,
        taxRate,
        taxConfig,
      ).subtotal,
    )
    afterLineSubs.push(afterLine)
    if (!isBonificacionGravada(aff)) {
      subtotalAfterLineSum = roundSunat(subtotalAfterLineSum + afterLine)
    }
    out.lines.push({
      grossSubtotal: grossSub,
      lineDiscountSubtotal: lineDisc,
      subtotalAfterLine: afterLine,
      globalDiscountSubtotal: 0,
      subtotal: 0,
      taxAmount: 0,
      total: 0,
      storedDiscount: 0,
      lineDiscountDisplay: roundSunat(lineDisc * factor),
      payloadDiscountValue: lineMode === 'amount' ? lineDisc : Math.min(100, Math.max(0, typed)),
    })
  }

  // Factor global: promedio de (1+IGV) ponderado por la base de cada línea cobrable, para que un
  // descuento en monto sobre un documento mixto (con y sin IGV incluido) se convierta de forma
  // proporcional. Con todas las líneas con IGV incluido vale 1.18; sin IGV incluido, 1.
  let weighted = 0
  let weightBase = 0
  lines.forEach((line, i) => {
    if (isBonificacionGravada(line.igvAffectationType || '10')) return
    weighted += afterLineSubs[i] * priceFactor(line, taxRate, taxConfig)
    weightBase += afterLineSubs[i]
  })
  const globalFactor = weightBase > 0 ? weighted / weightBase : 1
  const globalMode = input.globalDiscountMode || 'amount'
  const globalTyped = input.globalDiscountValue || 0
  const globalDisc = calcCheckoutDiscountAmount(
    subtotalAfterLineSum,
    globalMode,
    globalMode === 'amount' ? globalTyped / globalFactor : globalTyped,
  )
  const chargeableAfterLine = afterLineSubs.map((sub, i) =>
    isBonificacionGravada(lines[i].igvAffectationType || '10') ? 0 : sub,
  )
  const globalShares = distributeCheckoutDiscountToLines(chargeableAfterLine, globalDisc)

  lines.forEach((line, i) => {
    const aff = line.igvAffectationType || '10'
    const globalShare = globalShares[i] ?? 0
    const totalDiscSub = roundSunat(out.lines[i].lineDiscountSubtotal + globalShare)
    const finalLine = calcItemWithSubtotalDiscount(
      line.unitPrice,
      line.quantity,
      totalDiscSub,
      aff,
      line.priceIncludesIgv,
      taxRate,
      taxConfig,
    )
    out.lines[i] = {
      ...out.lines[i],
      globalDiscountSubtotal: globalShare,
      subtotal: finalLine.subtotal,
      taxAmount: finalLine.taxAmount,
      total: isBonificacionGravada(aff) ? 0 : finalLine.total,
      storedDiscount: subtotalDiscountToLineDiscount(
        line.unitPrice,
        line.quantity,
        totalDiscSub,
        aff,
        line.priceIncludesIgv,
        taxRate,
        taxConfig,
      ),
    }
    if (!isBonificacionGravada(aff)) {
      out.subtotal = roundSunat(out.subtotal + finalLine.subtotal)
      out.taxAmount = roundSunat(out.taxAmount + finalLine.taxAmount)
      out.total = roundSunat(out.total + finalLine.total)
    }
  })

  out.globalDiscountAmount = globalDisc
  out.globalFactor = globalFactor
  out.globalDiscountDisplay = roundSunat(globalDisc * globalFactor)
  out.globalPayloadValue = globalMode === 'amount' ? globalDisc : Math.min(100, Math.max(0, globalTyped))
  return out
}

export function usesStructuredDiscounts(input: {
  globalDiscountValue?: number
  globalDiscountMode?: string
  lines: Array<{ lineDiscountValue?: number; lineDiscountMode?: string }>
}): boolean {
  if ((input.globalDiscountValue ?? 0) > 0 || (input.globalDiscountMode ?? '').trim()) return true
  return input.lines.some((l) => (l.lineDiscountValue ?? 0) > 0 || (l.lineDiscountMode ?? '').trim())
}
