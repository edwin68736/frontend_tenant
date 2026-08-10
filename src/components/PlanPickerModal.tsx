import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronLeft, FileUp, Loader2, Package } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useSubscriptionStatus } from '@/contexts/SubscriptionStatusContext'
import { subscriptionService, type PublicPlan } from '@/services/subscription.service'
import { formatMoney } from '@/pages/subscription/subscriptionUx'

const inputClass =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white'

type Props = {
  open: boolean
  onClose: () => void
}

/**
 * Elegir plan (alta nueva o cambio) con comprobante OPCIONAL en el mismo paso — a diferencia del
 * formulario de "Pagar período" (SubscriptionPage), que exige billing_cycle_id + comprobante.
 * Cierra un hueco real: antes no había ningún lugar en la app donde el tenant pudiera ver la
 * lista de planes y elegir uno; todo camino de "renovar" llevaba directo al formulario de pago.
 */
export default function PlanPickerModal({ open, onClose }: Props) {
  const { hub, setHub, refresh } = useSubscriptionStatus()
  const [plans, setPlans] = useState<PublicPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [selected, setSelected] = useState<PublicPlan | null>(null)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [reference, setReference] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [receipt, setReceipt] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setReceipt(null)
    setReference('')
    setPaymentMethod(hub?.payment_config.methods[0]?.key ?? '')
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setLoadingPlans(true)
    subscriptionService
      .listPlans()
      .then(setPlans)
      .catch(() => toast.error('No se pudieron cargar los planes'))
      .finally(() => setLoadingPlans(false))
  }, [open, hub?.payment_config.methods])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    const form = new FormData()
    form.append('plan_id', String(selected.id))
    form.append('amount', String(selected.price))
    // El resto es opcional: el tenant puede pedir el plan sin adjuntar nada todavía.
    if (paymentMethod) form.append('payment_method', paymentMethod)
    if (paymentDate) form.append('payment_date', paymentDate)
    if (reference.trim()) form.append('reference', reference.trim())
    if (receipt) form.append('receipt', receipt)

    setSubmitting(true)
    try {
      const res = await subscriptionService.submitRenewalRequest(form)
      toast.success(res.message ?? 'Solicitud enviada')
      if (res.hub) setHub(res.hub)
      else void refresh()
      onClose()
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: string } } }
      toast.error(apiErr?.response?.data?.error ?? 'Error al enviar la solicitud')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} contentClassName="max-w-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
        <div>
          <h3 className="font-bold text-gray-800">{selected ? selected.name : 'Elegir plan'}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {selected ? 'Confirma tu solicitud' : 'Selecciona el plan que quieres contratar o al que quieres cambiarte'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      {!selected ? (
        <div className="pt-4">
          {loadingPlans ? (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
              <Loader2 className="animate-spin" size={20} />
              Cargando planes…
            </div>
          ) : plans.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No hay planes disponibles por ahora.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {plans.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p)}
                  className="text-left rounded-2xl border border-gray-200 p-4 hover:border-primary-400 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Package size={16} className="text-primary-600" />
                    <span className="font-semibold text-gray-800">{p.name}</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatMoney(p.price)}
                    <span className="text-xs font-normal text-gray-500"> /{billingCycleShort(p.billing_cycle)}</span>
                  </p>
                  {p.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
                  <ul className="mt-3 space-y-1 text-xs text-gray-600">
                    <li className="flex items-center gap-1.5">
                      <Check size={12} className="text-emerald-600 shrink-0" />
                      {p.is_unlimited_documents
                        ? 'Documentos electrónicos ilimitados'
                        : `${p.monthly_documents_limit} documentos/mes`}
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check size={12} className="text-emerald-600 shrink-0" />
                      {p.max_users > 0 ? `Hasta ${p.max_users} usuarios` : 'Usuarios ilimitados'}
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check size={12} className="text-emerald-600 shrink-0" />
                      {p.max_branches > 0 ? `Hasta ${p.max_branches} sucursales` : 'Sucursales ilimitadas'}
                    </li>
                  </ul>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <ChevronLeft size={14} /> Elegir otro plan
          </button>

          <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5 text-sm flex items-center justify-between">
            <span className="text-gray-600">Plan elegido</span>
            <span className="font-semibold text-gray-800">
              {selected.name} · {formatMoney(selected.price)}
            </span>
          </div>

          <p className="text-xs text-gray-500">
            Puedes adjuntar tu comprobante ahora para agilizar la aprobación, o enviar solo la
            solicitud y pagar después desde tu suscripción.
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600">Método (opcional)</label>
              <select className={inputClass} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                <option value="">Sin especificar</option>
                {hub?.payment_config.methods.map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Fecha de pago</label>
              <input
                type="date"
                className={inputClass}
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600">Referencia / Nº operación</label>
            <input className={inputClass} value={reference} onChange={e => setReference(e.target.value)} placeholder="Opcional" />
          </div>
          <div>
            <label className="text-xs text-gray-600">Comprobante (opcional)</label>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,.webp"
              className="text-sm mt-1 block w-full"
              onChange={e => setReceipt(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
              Enviar solicitud
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function billingCycleShort(cycle: string): string {
  if (cycle === 'yearly' || cycle === 'annual') return 'año'
  if (cycle === 'lifetime') return 'única vez'
  return 'mes'
}
