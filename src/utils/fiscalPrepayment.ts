import type { PrintFiscalContext } from '@/types/printData'
import { getTipoComprobanteLabel } from '@/constants/sunat'

export type PrepaymentAffectationGroup = 'gravado' | 'exonerado' | 'inafecto'

export const PREPAYMENT_AFFECTATION_OPTIONS: { value: PrepaymentAffectationGroup; label: string }[] = [
  { value: 'gravado', label: 'Gravado' },
  { value: 'exonerado', label: 'Exonerado' },
  { value: 'inafecto', label: 'Inafecto' },
]

export function affectationGroupFromItem(aff?: string): PrepaymentAffectationGroup {
  const c = (aff ?? '10').trim()
  if (c.startsWith('2')) return 'exonerado'
  if (c.startsWith('3')) return 'inafecto'
  return 'gravado'
}

/** Infiere grupo homogéneo de ítems; null si hay mezcla. */
export function inferPrepaymentAffectationGroup(
  items: { igv_affectation_type?: string }[],
): PrepaymentAffectationGroup | null {
  if (!items.length) return null
  const group = affectationGroupFromItem(items[0].igv_affectation_type)
  for (const it of items) {
    if (affectationGroupFromItem(it.igv_affectation_type) !== group) return null
  }
  return group
}

export function validatePrepaymentItems(
  group: PrepaymentAffectationGroup,
  items: { igv_affectation_type?: string }[],
): string | null {
  if (!items.length) return 'Agregue al menos un ítem'
  for (const it of items) {
    if (affectationGroupFromItem(it.igv_affectation_type) !== group) {
      return 'Todos los ítems deben tener la misma afectación IGV que el anticipo'
    }
  }
  return null
}

export type PrepaymentOpenVoucher = {
  source_sale_id: number
  description: string
  document_number: string
  related_doc_type: string
  amount: number
  total: number
  balance_amount: number
  affectation_group: PrepaymentAffectationGroup
  contact_id?: number | null
  contact_name?: string
}

export type PrepaymentDeductionRow = {
  id: string
  source_sale_id: number | null
  document_number: string
  amount: number
  total: number
  max_amount: number
  max_total: number
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function prepaymentTotalFromBase(base: number, group: PrepaymentAffectationGroup, taxRate: number) {
  if (group === 'gravado' && taxRate > 0) return round2(base * (1 + taxRate / 100))
  return round2(base)
}

/** Total deducido sin superar el saldo del voucher (evita 218.01 > 218.00 por redondeo). */
export function prepaymentTotalFromBaseCapped(
  base: number,
  group: PrepaymentAffectationGroup,
  taxRate: number,
  voucherBalanceTotal: number,
) {
  const total = prepaymentTotalFromBase(base, group, taxRate)
  if (voucherBalanceTotal > 0 && total > voucherBalanceTotal) return round2(voucherBalanceTotal)
  return total
}

export type SaleAfectacionTotals = {
  gravado: { subtotal: number }
  exonerado: { subtotal: number }
  inafecto: { subtotal: number }
}

/** Base máxima deducible de la venta según afectación del anticipo. */
export function saleDeductibleBaseForGroup(
  group: PrepaymentAffectationGroup,
  totals: SaleAfectacionTotals,
): number {
  switch (group) {
    case 'exonerado':
      return round2(totals.exonerado.subtotal)
    case 'inafecto':
      return round2(totals.inafecto.subtotal)
    default:
      return round2(totals.gravado.subtotal)
  }
}

/** Ajusta monto base/total respetando saldo del anticipo y total de la venta. */
export function resolvePrepaymentDeductionAmount(input: {
  requestedBase: number
  group: PrepaymentAffectationGroup
  taxRate: number
  voucherMaxBase: number
  voucherBalanceTotal: number
  saleDeductibleBase: number
  otherRowsBaseSum: number
}): { amount: number; total: number } {
  const remainingSaleBase = round2(Math.max(0, input.saleDeductibleBase - input.otherRowsBaseSum))
  const amount = round2(Math.min(input.requestedBase, input.voucherMaxBase, remainingSaleBase))
  const total = prepaymentTotalFromBaseCapped(
    amount,
    input.group,
    input.taxRate,
    input.voucherBalanceTotal,
  )
  return { amount, total }
}

/** Etiqueta FACTURA/BOLETA del comprobante de anticipo (cat. 12: 02/03). */
export function prepaymentRelatedDocLabel(relatedDocType: string): string {
  return String(relatedDocType).trim() === '03' ? 'BOLETA' : 'FACTURA'
}

/** Línea de ítem al deducir anticipo (legacy PHP invoice_a4). */
export function prepaymentDeductionDescription(relatedDocType: string, documentNumber: string): string {
  const doc = String(documentNumber ?? '').trim()
  return `ANTICIPO: ${prepaymentRelatedDocLabel(relatedDocType)} NRO. ${doc}`
}

/** Infiere cat. 12 desde serie (F001 → 02, B001 → 03). */
export function inferPrepaymentRelatedDocType(documentNumber: string): '02' | '03' {
  const s = String(documentNumber ?? '').trim().toUpperCase()
  if (s.startsWith('B')) return '03'
  return '02'
}

/** Título del comprobante en PDF local (emisión de anticipo vs factura/boleta normal). */
export function receiptDocTypeTitle(sunatCode: string, fiscal?: PrintFiscalContext | null): string {
  if (fiscal?.has_prepayment_emit) {
    return (fiscal.prepayment_label ?? 'COMPROBANTE DE ANTICIPO').toUpperCase()
  }
  const map: Record<string, string> = {
    '00': 'NOTA DE VENTA',
    '01': 'FACTURA ELECTRÓNICA',
    '03': 'BOLETA DE VENTA ELECTRÓNICA',
    '07': 'NOTA DE CRÉDITO',
    '08': 'NOTA DE DÉBITO',
    QT: 'COTIZACIÓN',
  }
  const code = String(sunatCode ?? '').trim()
  if (map[code]) return map[code]
  return getTipoComprobanteLabel(code).toUpperCase()
}

/** Ajuste de totales al deducir anticipos (equivalente discountGlobalPrepayment en PHP). */
export function applyPrepaymentDeductionToTotals(input: {
  group: PrepaymentAffectationGroup
  gravadoSubtotal: number
  gravadoTax: number
  exoneradoSubtotal: number
  inafectoSubtotal: number
  subtotal: number
  taxAmount: number
  total: number
  deductionBase: number
  taxRate: number
}) {
  const amount = round2(input.deductionBase)
  if (amount <= 0) {
    return { subtotal: input.subtotal, taxAmount: input.taxAmount, total: input.total, deductionTotal: 0 }
  }
  if (input.group === 'gravado') {
    const newGravadoSub = round2(input.gravadoSubtotal - amount)
    const newTax = round2(newGravadoSub * (input.taxRate / 100))
    const newTotal = round2(newGravadoSub + newTax + input.exoneradoSubtotal + input.inafectoSubtotal)
    const deductionTotal = round2(
      input.total - newTotal,
    )
    return {
      subtotal: round2(newGravadoSub + input.exoneradoSubtotal + input.inafectoSubtotal),
      taxAmount: newTax,
      total: newTotal,
      deductionTotal,
    }
  }
  if (input.group === 'exonerado') {
    const newExo = round2(input.exoneradoSubtotal - amount)
    const newTotal = round2(input.gravadoSubtotal + input.gravadoTax + newExo + input.inafectoSubtotal)
    return {
      subtotal: round2(input.gravadoSubtotal + newExo + input.inafectoSubtotal),
      taxAmount: input.gravadoTax,
      total: newTotal,
      deductionTotal: round2(input.total - newTotal),
    }
  }
  const newInaf = round2(input.inafectoSubtotal - amount)
  const newTotal = round2(input.gravadoSubtotal + input.gravadoTax + input.exoneradoSubtotal + newInaf)
  return {
    subtotal: round2(input.gravadoSubtotal + input.exoneradoSubtotal + newInaf),
    taxAmount: input.gravadoTax,
    total: newTotal,
    deductionTotal: round2(input.total - newTotal),
  }
}
