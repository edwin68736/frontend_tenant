import type { PrintData } from '@/types/printData'
import { calcPaymentChange, roundDisplay, roundSunat, sumMoney } from '@/utils/money'
import { receiptTotalDiscount, lineSubtotalDiscount, lineGlobalSubtotalDiscount } from '@/utils/receiptDiscount'

/** Descuento por línea agregado desde print_data persistido. */
export function receiptLineDiscountTotal(data: Pick<PrintData, 'line_discount_total' | 'items'>): number {
  if (data.line_discount_total != null) {
    return roundSunat(Math.max(0, data.line_discount_total))
  }
  return roundSunat((data.items ?? []).reduce((sum, it) => sum + lineSubtotalDiscount(it), 0))
}

/** Descuento global en base imponible desde print_data persistido. */
export function receiptGlobalDiscount(data: Pick<PrintData, 'global_discount_amount' | 'items'>): number {
  if (data.global_discount_amount != null) {
    return roundSunat(Math.max(0, data.global_discount_amount))
  }
  const fromItems = roundSunat(
    (data.items ?? []).reduce((sum, it) => sum + lineGlobalSubtotalDiscount(it), 0),
  )
  if (fromItems > 0.000001) return fromItems
  return 0
}

/** Descuento total (línea + global) en base imponible. */
export function receiptCombinedDiscount(data: Pick<PrintData, 'global_discount_amount' | 'line_discount_total' | 'items'>): number {
  const line = receiptLineDiscountTotal(data)
  const global = receiptGlobalDiscount(data)
  if (line > 0 || global > 0) return roundSunat(line + global)
  return receiptTotalDiscount(data)
}

export type ReceiptTotalLine = {
  label: string
  amount: number
  negative?: boolean
  bold?: boolean
}

/** Monto cobrable neto (detracción / retención) o total del comprobante. */
export function receiptPayableAmount(data: PrintData): number {
  const total = roundDisplay(Number(data.total) || 0)
  const fiscal = data.fiscal
  if (fiscal?.has_detraccion && (fiscal.detraccion_net_payable ?? 0) > 0) {
    return roundDisplay(fiscal.detraccion_net_payable!)
  }
  if (fiscal?.retention_applied && (fiscal.net_collectible ?? 0) > 0) {
    return roundDisplay(fiscal.net_collectible!)
  }
  return total
}

/** Suma de pagos directos (excluye detracción BN). */
export function receiptDirectPaidAmount(data: PrintData): number {
  return sumMoney(...(data.payments ?? []).map(p => Number(p.amount) || 0))
}

/** Vuelto desde print_data o calculado desde pagos vs monto cobrable. */
export function resolvePrintChangeAmount(data: PrintData): number {
  if (data.change_amount != null && data.change_amount > 0.009) {
    return roundDisplay(data.change_amount)
  }
  return calcPaymentChange(receiptDirectPaidAmount(data), receiptPayableAmount(data))
}

/**
 * Líneas de totales unificadas para comprobante (ticket, A4, modal, ESC/POS).
 */
export function buildReceiptTotalLines(data: PrintData): ReceiptTotalLine[] {
  const aff = data.totals_by_affectation || {}
  const gravado = aff['10']
  const exonerado = aff['20']
  const inafecto = aff['30']
  const exportacion = aff['40']
  const lineDiscount = receiptLineDiscountTotal(data)
  const globalDiscount = receiptGlobalDiscount(data)
  const hasDiscount = lineDiscount > 0.000001 || globalDiscount > 0.000001 || receiptTotalDiscount(data) > 0.000001
  const netSubtotal = roundSunat(Number(data.subtotal) || 0)
  const tax = roundSunat(Number(data.tax_amount) || 0)
  const total = roundSunat(Number(data.total) || 0)
  const lines: ReceiptTotalLine[] = []

  const affectationRows: ReceiptTotalLine[] = []
  if (gravado && (gravado.subtotal ?? 0) > 0.000001) {
    affectationRows.push({ label: 'Op. Gravadas:', amount: gravado.subtotal })
  }
  if (exonerado && (exonerado.subtotal ?? 0) > 0.000001) {
    affectationRows.push({ label: 'Op. Exoneradas:', amount: exonerado.subtotal })
  }
  if (inafecto && (inafecto.subtotal ?? 0) > 0.000001) {
    affectationRows.push({ label: 'Op. Inafectas:', amount: inafecto.subtotal })
  }
  if (exportacion && (exportacion.subtotal ?? 0) > 0.000001) {
    affectationRows.push({ label: 'Op. Exportación:', amount: exportacion.subtotal })
  }

  if (hasDiscount) {
    lines.push({ label: 'Subtotal:', amount: netSubtotal })
    if (lineDiscount > 0.000001) {
      lines.push({ label: 'Desc. por línea:', amount: lineDiscount, negative: true })
    }
    if (globalDiscount > 0.000001) {
      lines.push({ label: 'Desc. global:', amount: globalDiscount, negative: true })
    }
    if (lineDiscount <= 0 && globalDiscount <= 0) {
      const legacy = receiptTotalDiscount(data)
      if (legacy > 0) lines.push({ label: 'Descuento:', amount: legacy, negative: true })
    }
    if (affectationRows.length > 1) lines.push(...affectationRows)
  } else if (affectationRows.length > 0) {
    lines.push(...affectationRows)
  } else if (netSubtotal > 0.000001) {
    lines.push({ label: 'Subtotal:', amount: netSubtotal })
  }

  if (tax > 0.000001) lines.push({ label: 'IGV:', amount: tax })
  lines.push({ label: 'TOTAL A PAGAR:', amount: total, bold: true })
  return lines
}

export function formatReceiptTotalAmount(
  amount: number,
  currency: string,
  opts?: { negative?: boolean },
): string {
  const sym = currency === 'USD' ? '$' : 'S/'
  const n = Math.abs(amount)
  const formatted = `${sym} ${n.toFixed(2)}`
  return opts?.negative ? `- ${formatted}` : formatted
}

/** @deprecated Use receiptCombinedDiscount */
export function receiptGrossSubtotal(data: Pick<PrintData, 'subtotal' | 'items' | 'global_discount_amount' | 'line_discount_total'>): number {
  return roundSunat((Number(data.subtotal) || 0) + receiptCombinedDiscount(data))
}
