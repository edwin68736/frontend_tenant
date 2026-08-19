import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FileUp, Loader2, X } from 'lucide-react'
import { PortalModal } from '@/components/ui/PortalModal'
import { subscriptionService, type BillingHub, type BillingInvoice } from '@/services/subscription.service'
import PaymentMethodsPanel from './PaymentMethodsPanel'
import {
  billingCyclePaymentTotal,
  formatBillingPeriod,
  formatDate,
  formatMoney,
  invoiceStatusUI,
} from './subscriptionUx'

const inputClass =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white'

type Props = {
  open: boolean
  onClose: () => void
  hub: BillingHub
  invoice: BillingInvoice | null
  onSuccess: (hub?: BillingHub) => void
}

export default function PaymentModal({ open, onClose, hub, invoice, onSuccess }: Props) {
  const sub = hub.subscription
  const cfg = hub.payment_config
  const [paymentMethod, setPaymentMethod] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !invoice) return
    setAmount(String(billingCyclePaymentTotal(invoice, sub)))
    const first = cfg.methods[0]
    if (first) setPaymentMethod(first.key)
    setReceipt(null)
    setReference('')
  }, [open, invoice, sub, cfg.methods])

  if (!invoice) return null

  const statusUi = invoiceStatusUI(invoice)
  const total = billingCyclePaymentTotal(invoice, sub)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sub.can_submit_payment) {
      toast.error(sub.support_message ?? 'No puede enviar comprobantes')
      return
    }
    if (!paymentMethod || !receipt) {
      toast.error('Seleccione método y adjunte comprobante')
      return
    }
    const form = new FormData()
    form.append('billing_cycle_id', String(invoice.id))
    form.append('payment_method', paymentMethod)
    form.append('amount', amount)
    form.append('payment_date', paymentDate)
    if (reference.trim()) form.append('reference', reference.trim())
    form.append('receipt', receipt)

    setSubmitting(true)
    try {
      const res = await subscriptionService.submitPayment(form)
      toast.success(res.message ?? 'Comprobante enviado')
      onSuccess(res.hub)
      onClose()
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: string } } }
      toast.error(apiErr?.response?.data?.error ?? 'Error al enviar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PortalModal open={open} onClose={onClose} className="max-w-lg" overlayClassName="items-end sm:items-center" stacked>
      <div className="w-full max-w-lg max-h-[min(92dvh,900px)] overflow-y-auto rounded-2xl bg-white shadow-xl border border-gray-100">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-gray-100 bg-white px-4 py-3 rounded-t-2xl">
          <div>
            <h3 className="text-base font-bold text-gray-900">Pagar período</h3>
            <p className="text-xs text-gray-500 mt-0.5">Plan {sub.plan_name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className={`rounded-xl border border-gray-100 border-l-4 ${statusUi.stripe} px-3 py-2.5`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${statusUi.badge}`}>
                {statusUi.label}
              </span>
              <span className="text-lg font-bold text-gray-900">{formatMoney(total, invoice.currency)}</span>
            </div>
            <p className="text-sm text-gray-700 mt-1">Periodo {formatBillingPeriod(invoice.period_end)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Vence {formatDate(invoice.due_date)}</p>
          </div>

          {sub.can_submit_payment ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Método de pago</label>
                <select
                  className={`${inputClass} mt-1`}
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  required
                >
                  {cfg.methods.map(m => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {paymentMethod && <PaymentMethodsPanel cfg={cfg} selectedMethodKey={paymentMethod} />}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Monto (S/)</label>
                  <input
                    type="number"
                    step="0.01"
                    className={`${inputClass} mt-1`}
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Fecha de pago</label>
                  <input
                    type="date"
                    className={`${inputClass} mt-1`}
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Referencia / Nº operación</label>
                <input
                  className={`${inputClass} mt-1`}
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Comprobante (imagen o PDF)</label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,.webp"
                  className="text-sm mt-1 block w-full"
                  onChange={e => setReceipt(e.target.files?.[0] ?? null)}
                  required
                />
              </div>
              <p className="text-xs text-gray-500">
                Si tu cuenta está suspendida, tras enviar podrás tener hasta 12 h de acceso provisional (1 vez por
                ciclo).
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-60"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
                Enviar comprobante
              </button>
            </form>
          ) : (
            <p className="text-sm text-red-700">{sub.support_message ?? 'No puede enviar comprobantes en este momento.'}</p>
          )}
        </div>
      </div>
    </PortalModal>
  )
}
