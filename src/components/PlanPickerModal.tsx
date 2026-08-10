import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronLeft, FileUp, Loader2, Package } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useSubscriptionStatus } from '@/contexts/SubscriptionStatusContext'
import { subscriptionService, type PublicPlan } from '@/services/subscription.service'
import { formatMoney } from '@/pages/subscription/subscriptionUx'
import PaymentMethodsPanel from '@/pages/subscription/PaymentMethodsPanel'
import { SUBSCRIPTION_BLOCKED_MODAL_Z } from '@/utils/uiLayers'

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
const MONTH_PRESETS = [1, 3, 6, 12]

export default function PlanPickerModal({ open, onClose }: Props) {
  const { hub, setHub, refresh } = useSubscriptionStatus()
  const [plans, setPlans] = useState<PublicPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [selected, setSelected] = useState<PublicPlan | null>(null)
  // true cuando el plan elegido es el MISMO que el tenant ya tiene activo: es un adelanto de
  // pago, no un cambio de plan — se salta el grid y cambia el copy para que quede claro.
  const [advancingCurrentPlan, setAdvancingCurrentPlan] = useState(false)
  const [months, setMonths] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [reference, setReference] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [receipt, setReceipt] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setAdvancingCurrentPlan(false)
    setMonths(1)
    setReceipt(null)
    setReference('')
    setPaymentMethod(hub?.payment_config.methods[0]?.key ?? '')
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setLoadingPlans(true)
    subscriptionService
      .listPlans()
      .then(list => {
        setPlans(list)
        // Suscripción activa (no bloqueada) + el mismo plan ya está en la lista: es un tenant
        // que quiere adelantar pago, no elegir plan — saltar directo al formulario.
        if (hub?.subscription.can_operate && hub.subscription.plan_name) {
          const current = list.find(p => p.name === hub.subscription.plan_name)
          if (current) selectPlan(current)
        }
      })
      .catch(() => toast.error('No se pudieron cargar los planes'))
      .finally(() => setLoadingPlans(false))
  }, [open, hub?.payment_config.methods, hub?.subscription.can_operate, hub?.subscription.plan_name])

  const totalAmount = selected ? +(selected.price * months).toFixed(2) : 0

  const selectPlan = (plan: PublicPlan) => {
    setSelected(plan)
    setMonths(1)
    setAdvancingCurrentPlan(Boolean(hub?.subscription.can_operate) && plan.name === hub?.subscription.plan_name)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    const form = new FormData()
    form.append('plan_id', String(selected.id))
    form.append('period_months', String(months))
    form.append('amount', String(totalAmount))
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
    <Modal
      open={open}
      onClose={onClose}
      contentClassName="max-w-2xl"
      zClassName={SUBSCRIPTION_BLOCKED_MODAL_Z}
    >
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
        <div>
          <h3 className="font-bold text-gray-800">
            {advancingCurrentPlan ? 'Adelantar pago' : selected ? selected.name : 'Elegir plan'}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {advancingCurrentPlan
              ? `Suma meses a tu plan actual (${selected?.name}) sin esperar a que venza`
              : selected
                ? 'Confirma tu solicitud'
                : 'Selecciona el plan que quieres contratar o al que quieres cambiarte'}
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
                  onClick={() => selectPlan(p)}
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
            onClick={() => { setSelected(null); setAdvancingCurrentPlan(false) }}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <ChevronLeft size={14} /> Elegir otro plan
          </button>

          <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Plan elegido</span>
              <span className="font-semibold text-gray-800">{selected.name} · {formatMoney(selected.price)}/mes</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-600">¿Por cuántos meses?</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {MONTH_PRESETS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                    months === m
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {m} {m === 1 ? 'mes' : 'meses'}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={24}
                className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center"
                value={months}
                onChange={e => setMonths(Math.max(1, Math.min(24, +e.target.value || 1)))}
              />
            </div>
          </div>

          <div className="rounded-xl border border-primary-100 bg-primary-50/60 px-3 py-2.5 text-sm flex items-center justify-between">
            <span className="text-gray-700">Total a depositar</span>
            <span className="text-lg font-bold text-gray-900">{formatMoney(totalAmount)}</span>
          </div>

          <p className="text-xs text-gray-500">
            Puedes adjuntar tu comprobante ahora para agilizar la aprobación, o enviar solo la
            solicitud y pagar después desde tu suscripción.
          </p>

          {hub && (
            hub.payment_config.methods.length > 0 ||
            hub.payment_config.bank_accounts.length > 0 ||
            hub.payment_config.yape_qr_url ||
            hub.payment_config.plin_qr_url
          ) && <PaymentMethodsPanel cfg={hub.payment_config} />}

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
