import { CheckCircle2, Download, FileUp } from 'lucide-react'
import { assetUrl, type BillingHub, type BillingInvoice } from '@/services/subscription.service'
import {
  billingCyclePaymentTotal,
  formatBillingPeriod,
  formatDate,
  formatMoney,
  invoiceStatusUI,
  isInvoicePayableNow,
  sortInvoicesForBillingList,
} from './subscriptionUx'

type Props = {
  hub: BillingHub
  onPay: (invoice: BillingInvoice) => void
}

function InvoiceRow({
  hub,
  invoice,
  onPay,
}: {
  hub: BillingHub
  invoice: BillingInvoice
  onPay: (inv: BillingInvoice) => void
}) {
  const sub = hub.subscription
  const ui = invoiceStatusUI(invoice)
  const total = billingCyclePaymentTotal(invoice, sub)
  const canPay = isInvoicePayableNow(invoice)

  return (
    <article
      className={`rounded-xl border border-gray-100 bg-white border-l-4 ${ui.stripe} px-4 py-3.5 shadow-sm`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className={`inline-flex text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${ui.badge}`}>
            {ui.label}
          </span>
          <h3 className="text-sm font-bold text-gray-900 mt-1.5">{sub.plan_name || 'Plan'}</h3>
          <p className="text-sm text-gray-600">Periodo {formatBillingPeriod(invoice.period_end)}</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{formatMoney(total, invoice.currency)}</p>
          <p className="text-xs text-gray-500 mt-1">
            Emisión {formatDate(invoice.period_start)} · Vence {formatDate(invoice.due_date)}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          {canPay ? (
            <button
              type="button"
              onClick={() => onPay(invoice)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 touch-manipulation"
            >
              <FileUp size={14} /> Pagar
            </button>
          ) : invoice.status === 'paid' ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 px-2 py-1">
              <CheckCircle2 size={14} />
              Pagado
            </span>
          ) : null}
          {/* Boleta/factura del PERÍODO, la que sube el admin desde el panel central
              (fiscal_doc_url) — no el voucher que el tenant adjuntó al pagar. Si tuvo un
              intento rechazado antes del que finalmente lo pagó, esto siempre apunta al pago
              que realmente lo saldó. */}
          {invoice.status === 'paid' && invoice.fiscal_doc_url && (
            <a
              href={assetUrl(invoice.fiscal_doc_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline px-2"
              title="Descargar boleta/factura"
            >
              <Download size={12} /> Descargar
            </a>
          )}
        </div>
      </div>
    </article>
  )
}

export default function BillingTab({ hub, onPay }: Props) {
  const sorted = sortInvoicesForBillingList(hub.invoices)
  // pending_review va en este grupo (no en uno aparte): sigue siendo un cobro abierto, solo que
  // ya tiene un comprobante esperando aprobación (ui.label lo distingue con su propio badge).
  const pending = sorted.filter(
    i => i.status === 'pending' || i.status === 'overdue' || i.status === 'pending_review',
  )
  const paid = sorted.filter(i => i.status === 'paid')

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">Aún no hay períodos registrados.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {pending.length > 0 ? (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 px-0.5">
            Pendientes y vencidos
          </h3>
          <div className="space-y-3">
            {pending.map(inv => (
              <InvoiceRow key={inv.id} hub={hub} invoice={inv} onPay={onPay} />
            ))}
          </div>
        </div>
      ) : null}

      {paid.length > 0 ? (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 px-0.5">Completados</h3>
          <div className="space-y-3">
            {paid.map(inv => (
              <InvoiceRow key={inv.id} hub={hub} invoice={inv} onPay={onPay} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
