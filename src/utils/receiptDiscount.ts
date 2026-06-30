import type { PrintItem } from '@/types/printData'
import { roundSunat } from '@/utils/money'

type LineDiscountFields = Pick<
  PrintItem,
  | 'quantity'
  | 'unit_price'
  | 'discount'
  | 'subtotal'
  | 'tax_amount'
  | 'line_discount_subtotal'
  | 'global_discount_subtotal'
>

/** Descuento en base imponible (subtotal) solo por línea, no el global repartido. */
export function lineSubtotalDiscount(it: LineDiscountFields): number {
  if (it.line_discount_subtotal != null) {
    return roundSunat(Math.max(0, it.line_discount_subtotal))
  }
  // print_data estructurado: item.discount incluye global + línea; no usarlo como desc. línea.
  if (it.global_discount_subtotal != null) {
    return 0
  }
  const disc = Number(it.discount) || 0
  if (disc <= 0) return 0
  const tax = Number(it.tax_amount) || 0
  const subtotal = Number(it.subtotal) || 0
  if (tax <= 0.000001) return roundSunat(disc)
  const rate = subtotal > 0 ? tax / subtotal : 0
  if (rate <= 0) return roundSunat(disc)
  const gross = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0)
  const afterDisc = gross - disc
  const subIfIgvIncluded = afterDisc / (1 + rate)
  if (Math.abs(roundSunat(subIfIgvIncluded) - roundSunat(subtotal)) <= 0.01) {
    return roundSunat(disc / (1 + rate))
  }
  return roundSunat(disc)
}

/** Descuento global repartido en ítems (p. ej. POS con descuento a toda la venta). */
export function lineGlobalSubtotalDiscount(
  it: Pick<PrintItem, 'global_discount_subtotal'>,
): number {
  return roundSunat(Math.max(0, Number(it.global_discount_subtotal) || 0))
}

export function receiptTotalDiscount(data: { items?: PrintItem[] }): number {
  return roundSunat((data.items ?? []).reduce((sum, it) => sum + lineSubtotalDiscount(it), 0))
}

export function hasReceiptDiscount(data: { items?: PrintItem[] }): boolean {
  return receiptTotalDiscount(data) > 0.000001
}
