import type { SalePayment } from '@/services/sales.service'
import {
  formatPaymentMethodLabel,
  isDetractionPaymentMethod,
} from '@/utils/paymentMethodLabel'
import { DETRACCION_PAYMENT_METHOD_NAME } from '@/utils/fiscalDetraction'

type Props = {
  payments?: SalePayment[]
  invoiceTotal?: number
  detractionAmount?: number
  netPayable?: number
  currency?: string
}

function fmt(n: number, currency = 'PEN') {
  const sym = currency === 'USD' ? 'US$' : 'S/'
  return `${sym} ${n.toFixed(2)}`
}

/** Desglose de pagos directos vs línea SPOT (detracción BN). */
export function SalePaymentsBreakdown({
  payments = [],
  invoiceTotal,
  detractionAmount,
  netPayable,
  currency = 'PEN',
}: Props) {
  const direct = payments.filter((p) => !isDetractionPaymentMethod(p.method) && Number(p.amount) > 0)
  const spot = payments.filter((p) => isDetractionPaymentMethod(p.method) && Number(p.amount) > 0)
  const directTotal = direct.reduce((s, p) => s + Number(p.amount), 0)
  const spotTotal = spot.reduce((s, p) => s + Number(p.amount), 0)
  const showSummary =
    (detractionAmount != null && detractionAmount > 0) ||
    spotTotal > 0 ||
    (netPayable != null && invoiceTotal != null && netPayable < invoiceTotal)

  if (direct.length === 0 && spot.length === 0 && !showSummary) {
    return null
  }

  return (
    <div className="space-y-2 border-t border-gray-100 pt-3">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Cobranza</p>
      {showSummary && invoiceTotal != null && (
        <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-xs space-y-1">
          <div className="flex justify-between text-gray-700">
            <span>Total factura</span>
            <span className="tabular-nums font-medium">{fmt(invoiceTotal, currency)}</span>
          </div>
          {(detractionAmount ?? spotTotal) > 0 && (
            <div className="flex justify-between text-amber-800">
              <span>{DETRACCION_PAYMENT_METHOD_NAME}</span>
              <span className="tabular-nums font-medium">{fmt(detractionAmount ?? spotTotal, currency)}</span>
            </div>
          )}
          {netPayable != null && (
            <div className="flex justify-between text-emerald-800 font-semibold border-t border-emerald-100 pt-1">
              <span>Neto cobrable (directo)</span>
              <span className="tabular-nums">{fmt(netPayable, currency)}</span>
            </div>
          )}
        </div>
      )}
      {direct.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Pagos directos</p>
          {direct.map((p) => (
            <div key={p.id ?? `${p.method}-${p.amount}`} className="flex justify-between text-sm">
              <span>{formatPaymentMethodLabel(p.method)}</span>
              <span className="tabular-nums font-medium">{fmt(Number(p.amount), currency)}</span>
            </div>
          ))}
          {direct.length > 1 && (
            <div className="flex justify-between text-xs text-gray-600 pt-1 border-t border-gray-100">
              <span>Subtotal directo</span>
              <span className="tabular-nums font-semibold">{fmt(directTotal, currency)}</span>
            </div>
          )}
        </div>
      )}
      {spot.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-sm">
          {spot.map((p) => (
            <div key={p.id ?? 'spot'} className="flex justify-between text-amber-900">
              <span>{formatPaymentMethodLabel(p.method)}</span>
              <span className="tabular-nums font-semibold">{fmt(Number(p.amount), currency)}</span>
            </div>
          ))}
          <p className="text-[10px] text-amber-700/80 mt-1">Sin impacto en caja · trazabilidad SPOT</p>
        </div>
      )}
    </div>
  )
}
