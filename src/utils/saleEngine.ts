/**
 * Motor tributario unificado de ventas (espejo de backend_go/pkg/tax/sale_engine.go).
 * Orden SUNAT/Greenter: descuento por línea → descuento global → IGV.
 */

import { calcCheckoutDiscountAmount, distributeCheckoutDiscountToLines, type CheckoutDiscountMode } from '@/utils/checkoutDiscount'
import { isBonificacionGravada } from '@/constants/igvAffectation'
import { calcItem, calcItemWithSubtotalDiscount, subtotalDiscountToLineDiscount, type TaxConfig } from '@/utils/taxCalc'
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
}

export type SaleResult = {
  lines: SaleLineResult[]
  subtotal: number
  taxAmount: number
  total: number
  globalDiscountAmount: number
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
  }
  if (n === 0) return out

  const afterLineSubs: number[] = []
  let subtotalAfterLineSum = 0

  for (const line of lines) {
    const aff = line.igvAffectationType || '10'
    const grossSub = roundSunat(calcItem(line.unitPrice, line.quantity, 0, aff, line.priceIncludesIgv, taxRate, taxConfig).subtotal)
    const lineDisc = calcCheckoutDiscountAmount(grossSub, line.lineDiscountMode || 'amount', line.lineDiscountValue || 0)
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
    })
  }

  const globalDisc = calcCheckoutDiscountAmount(
    subtotalAfterLineSum,
    input.globalDiscountMode || 'amount',
    input.globalDiscountValue || 0,
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
