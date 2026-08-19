import { AlertTriangle, FileUp, ShieldAlert } from 'lucide-react'
import type { BillingHub, BillingInvoice } from '@/services/subscription.service'
import { formatMoney } from './subscriptionUx'

/**
 * Barra de acción a todo el ancho: es lo más urgente que puede haber en esta página, así que
 * va justo debajo del resumen del plan, antes que cualquier tabla o historial. Se muestra para
 * todo cobro `pending`/`overdue` (ver isInvoicePayableNow: el estado real manda, no la cercanía
 * del vencimiento) — un cobro `pending_review` no cuenta, ya tiene un comprobante esperando
 * aprobación (ver el aviso "en revisión" del resumen).
 */
export default function PendingPaymentBanner({
  hub,
  invoices,
  onPay,
}: {
  hub: BillingHub
  invoices: BillingInvoice[]
  onPay: (inv: BillingInvoice) => void
}) {
  if (invoices.length === 0) return null

  const sub = hub.subscription
  const suspended = sub.is_suspended || sub.tenant_status === 'suspended'
  const total = invoices.reduce((sum, inv) => sum + inv.amount + (suspended ? inv.reconnection_fee : 0), 0)
  const n = invoices.length

  const title = n === 1 ? 'Tienes 1 pago pendiente' : `Tienes ${n} pagos pendientes`
  const subtitle = suspended
    ? 'Tu servicio está suspendido por falta de pago. Realiza el pago para reactivarlo.'
    : 'Por favor, realiza el pago para mantener tu servicio activo y sin interrupciones.'

  const tone = suspended
    ? { wrap: 'border-red-200 bg-red-50', icon: 'bg-red-100 text-red-700', btn: 'bg-red-600 hover:bg-red-700' }
    : { wrap: 'border-amber-200 bg-amber-50', icon: 'bg-amber-100 text-amber-700', btn: 'bg-emerald-600 hover:bg-emerald-700' }

  return (
    <div className={`rounded-2xl border shadow-sm px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 ${tone.wrap}`}>
      <div className={`p-2.5 rounded-xl shrink-0 ${tone.icon}`}>
        {suspended ? <ShieldAlert size={20} /> : <AlertTriangle size={20} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-gray-600 mt-0.5">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-lg font-bold text-gray-900 tabular-nums">{formatMoney(total)}</span>
        <button
          type="button"
          onClick={() => onPay(invoices[0])}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${tone.btn}`}
        >
          <FileUp size={16} />
          Pagar ahora
        </button>
      </div>
    </div>
  )
}
