import { roundDisplay, roundSunat } from '@/utils/money'

export type CheckoutDiscountMode = 'percent' | 'amount'

/** @deprecated Use roundDisplay from @/utils/money */
export function roundMoney(n: number): number {
  return roundDisplay(n)
}

/** Monto de descuento en soles (6 decimales) a partir del total bruto. */
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
