import { roundDisplay, roundSunat } from '@/utils/money'

export type CheckoutDiscountMode = 'percent' | 'amount'

/** @deprecated Use roundDisplay from @/utils/money */
export function roundMoney(n: number): number {
  return roundDisplay(n)
}

/** Monto de descuento en base imponible (subtotal) a partir del total bruto sin descuento. */
export function calcCheckoutDiscountAmount(
  rawTotal: number,
  mode: CheckoutDiscountMode,
  value: number,
): number {
  const base = roundSunat(Math.max(0, Number(rawTotal) || 0))
  if (base <= 0) return 0
  const rawValue = Math.max(0, Number(value) || 0)
  if (mode === 'percent') {
    const pct = Math.min(100, rawValue)
    return roundSunat(base * (pct / 100))
  }
  return roundSunat(Math.min(base, rawValue))
}

export function calcPayableTotal(
  rawTotal: number,
  mode: CheckoutDiscountMode,
  value: number,
): number {
  const discount = calcCheckoutDiscountAmount(rawTotal, mode, value)
  return roundSunat(Math.max(0, roundSunat(rawTotal) - discount))
}

/** Reparte descuento global proporcionalmente entre líneas (misma lógica que restaurante/backend). */
export function distributeCheckoutDiscountToLines(lineTotals: number[], discountAmount: number): number[] {
  const n = lineTotals.length
  if (n === 0) return []
  const disc = roundSunat(Math.max(0, Math.min(Number(discountAmount) || 0, sumLineTotals(lineTotals))))
  if (disc <= 0) return new Array(n).fill(0)

  const grossTotal = roundSunat(lineTotals.reduce((a, t) => a + Math.max(0, t), 0))
  if (grossTotal <= 0) return new Array(n).fill(0)

  const result = new Array<number>(n).fill(0)
  let remaining = disc
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      result[i] = roundSunat(remaining)
    } else {
      const share = roundSunat(disc * (Math.max(0, lineTotals[i]) / grossTotal))
      result[i] = share
      remaining = roundSunat(remaining - share)
    }
  }
  return result
}

function sumLineTotals(lineTotals: number[]): number {
  return roundSunat(lineTotals.reduce((a, t) => a + Math.max(0, t), 0))
}

export type LineTaxTotals = {
  subtotal: number
  taxAmount: number
  total: number
}

/** Aplica descuento global sobre subtotales y recalcula IGV/total por línea (alineado con backend). */
export function applyCheckoutDiscountToLines(
  lines: LineTaxTotals[],
  mode: CheckoutDiscountMode,
  value: number,
): {
  discountAmount: number
  lines: LineTaxTotals[]
  subtotal: number
  taxAmount: number
  payableTotal: number
} {
  if (lines.length === 0) {
    return { discountAmount: 0, lines: [], subtotal: 0, taxAmount: 0, payableTotal: 0 }
  }
  const rawSubtotal = roundSunat(lines.reduce((a, l) => a + l.subtotal, 0))
  const discountAmount = calcCheckoutDiscountAmount(rawSubtotal, mode, value)
  const lineDiscounts = distributeCheckoutDiscountToLines(
    lines.map((l) => l.subtotal),
    discountAmount,
  )
  const discountedLines = lines.map((line, i) => {
    const d = lineDiscounts[i] ?? 0
    const newSub = roundSunat(Math.max(0, line.subtotal - d))
    const effRate = line.subtotal > 0 ? line.taxAmount / line.subtotal : 0
    const newTax = roundSunat(newSub * effRate)
    const newTotal = roundSunat(newSub + newTax)
    return { subtotal: newSub, taxAmount: newTax, total: newTotal }
  })
  return {
    discountAmount,
    lines: discountedLines,
    subtotal: roundSunat(discountedLines.reduce((a, l) => a + l.subtotal, 0)),
    taxAmount: roundSunat(discountedLines.reduce((a, l) => a + l.taxAmount, 0)),
    payableTotal: roundSunat(discountedLines.reduce((a, l) => a + l.total, 0)),
  }
}
