import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Calendar, Check, ChevronLeft, CreditCard, FileUp, Hash, Loader2, Package, RefreshCw, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useSubscriptionStatus } from '@/contexts/SubscriptionStatusContext'
import { subscriptionService, type PublicPlan } from '@/services/subscription.service'
import { formatMoney } from '@/pages/subscription/subscriptionUx'
import PaymentMethodsPanel from '@/pages/subscription/PaymentMethodsPanel'
import { SUBSCRIPTION_BLOCKED_MODAL_Z } from '@/utils/uiLayers'

const inputClass =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white'

/** Franja de color arriba de cada tarjeta de plan, para distinguirlas a simple vista — cicla
 *  por índice, no representa nada del plan en sí (no hay un campo de "color" en SaasPlan). */
const CARD_ACCENTS = ['border-t-emerald-500', 'border-t-blue-500', 'border-t-amber-500', 'border-t-purple-500']

type Props = {
  open: boolean
  onClose: () => void
}

/**
 * Progreso del flujo (grilla → confirmar y pagar): solo se muestra en el paso 1 (grilla), como
 * referencia de dónde se está — la navegación real («Elegir otro plan», «Volver a mi plan
 * actual») vive en botones aparte, así que acá no hace falta que sea clickeable.
 */
function StepIndicator() {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold shrink-0 bg-primary-600 text-white">
          1
        </span>
        <span className="text-xs font-semibold text-gray-800">Elegir plan</span>
      </div>
      <div className="flex-1 h-px min-w-6 bg-gray-200" />
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold shrink-0 bg-gray-200 text-gray-500">
          2
        </span>
        <span className="text-xs font-semibold text-gray-400">Confirmar y pagar</span>
      </div>
    </div>
  )
}

/**
 * Elegir plan (alta nueva o cambio) con comprobante en el mismo paso — a diferencia del
 * formulario de "Pagar período" (SubscriptionPage), que exige billing_cycle_id, este cubre
 * también el caso sin ciclo aún emitido (renovación anticipada), pero el comprobante es
 * igualmente obligatorio en los dos: sin él no se puede enviar.
 * Cierra un hueco real: antes no había ningún lugar en la app donde el tenant pudiera ver la
 * lista de planes y elegir uno; todo camino de "renovar" llevaba directo al formulario de pago.
 *
 * El ciclo (1/3/6/12 meses) se elige entre los que trae `plan.cycles` — ya no un número de meses
 * libre: cada plan solo permite los ciclos fijos que el panel central habilitó para él, con el
 * precio (bruto y neto tras descuento) que el backend ya calculó. Nunca se recalcula acá.
 *
 * El ciclo se elige en la MISMA tarjeta del plan (grid inicial), no en un paso aparte después:
 * antes había que primero elegir el plan y recién en la pantalla siguiente elegir el ciclo — dos
 * decisiones separadas para una sola elección real. Ahora la tarjeta ya muestra los ciclos con su
 * precio, y "Elegir este plan" confirma los dos juntos; el paso de pago que sigue ya no vuelve a
 * preguntar el ciclo, solo lo muestra como resumen.
 */
export default function PlanPickerModal({ open, onClose }: Props) {
  const { hub, setHub, refresh } = useSubscriptionStatus()
  const [plans, setPlans] = useState<PublicPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [selected, setSelected] = useState<PublicPlan | null>(null)
  // true cuando el plan elegido es el MISMO que el tenant ya tiene activo: es un adelanto de
  // pago, no un cambio de plan — se salta el grid y cambia el copy para que quede claro.
  const [advancingCurrentPlan, setAdvancingCurrentPlan] = useState(false)
  const [months, setMonths] = useState(1)
  // Ciclo elegido por tarjeta, mientras el tenant todavía está mirando el grid (antes de
  // confirmar con "Elegir este plan"). Vive aparte de `months` porque `months` es la elección ya
  // CONFIRMADA del plan seleccionado; esto es solo la selección en progreso en cada tarjeta.
  const [cardMonths, setCardMonths] = useState<Record<number, number>>({})
  const [paymentMethod, setPaymentMethod] = useState('')
  const [reference, setReference] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [receipt, setReceipt] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const receiptRef = useRef<HTMLInputElement>(null)

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

  // Ciclos elegibles de un plan: para "lifetime" (pago único) solo tiene sentido el de 1 — no se
  // le ofrece "3/6/12 meses" a un plan que no vence.
  const cyclesOf = (plan: PublicPlan) => plan.cycles.filter(c => plan.billing_cycle !== 'lifetime' || c.months === 1)
  const isLifetime = selected?.billing_cycle === 'lifetime'
  const availableCycles = selected ? cyclesOf(selected) : []
  const selectedCycle = availableCycles.find(c => c.months === months)
  const totalAmount = selectedCycle?.net_amount ?? 0
  // Plan que el tenant ya tiene activo, si está en el catálogo — mismo criterio que el
  // auto-select del useEffect. Sirve para el atajo «Volver a mi plan actual» en la grilla.
  const currentPlan = plans.find(p => Boolean(hub?.subscription.can_operate) && p.name === hub?.subscription.plan_name)

  // Ciclo que la tarjeta de `plan` tiene elegido AHORA MISMO en el grid (antes de confirmar).
  const cardCycle = (plan: PublicPlan) => {
    const cycles = cyclesOf(plan)
    const chosen = cardMonths[plan.id]
    return cycles.find(c => c.months === chosen) ?? cycles[0]
  }

  const selectPlan = (plan: PublicPlan, months?: number) => {
    setSelected(plan)
    setMonths(months ?? cardCycle(plan)?.months ?? 1)
    setAdvancingCurrentPlan(Boolean(hub?.subscription.can_operate) && plan.name === hub?.subscription.plan_name)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !selectedCycle) return
    // El comprobante ya es obligatorio para renovar — antes se podía enviar solo la solicitud
    // y pagar después, ahora no.
    if (!receipt) {
      toast.error('Adjunta tu comprobante de pago para continuar')
      return
    }
    const form = new FormData()
    form.append('plan_id', String(selected.id))
    form.append('period_months', String(months))
    form.append('amount', String(totalAmount))
    form.append('receipt', receipt)
    // El método/fecha/referencia siguen siendo opcionales: lo único que ahora se exige es el
    // comprobante en sí.
    if (paymentMethod) form.append('payment_method', paymentMethod)
    if (paymentDate) form.append('payment_date', paymentDate)
    if (reference.trim()) form.append('reference', reference.trim())

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

  const goBackToGrid = () => { setSelected(null); setAdvancingCurrentPlan(false) }

  return (
    <Modal
      open={open}
      onClose={onClose}
      contentClassName={selected ? 'max-w-2xl' : 'max-w-4xl'}
      zClassName={SUBSCRIPTION_BLOCKED_MODAL_Z}
    >
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
        <div className="flex items-start gap-3 min-w-0">
          {selected && (
            <span className="p-2 rounded-xl bg-primary-50 text-primary-700 shrink-0">
              {advancingCurrentPlan ? <RefreshCw size={18} /> : <Package size={18} />}
            </span>
          )}
          <div className="min-w-0">
            {/* «Adelantar pago» no decía qué se está pagando — el mismo modal cubre tanto
                renovar cerca del vencimiento como adelantar meses sin urgencia, así que el
                título habla de lo que es siempre cierto en los dos casos: se está renovando. */}
            <h3 className="font-bold text-gray-800 truncate">
              {advancingCurrentPlan ? 'Renovar suscripción' : selected ? selected.name : 'Elegir plan'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {advancingCurrentPlan
                ? `Adelanta el pago de tu plan ${selected?.name} sin esperar a que venza`
                : selected
                  ? 'Confirma el cambio de plan'
                  : 'Elige el plan y por cuánto tiempo quieres pagarlo'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      {!selected ? (
        <div className="pt-4 space-y-3">
          {/* Solo el paso 1 tiene sentido acá: en el paso 2 (confirmar y pagar) ya está el
              botón «Elegir otro plan» para volver, mostrar el mismo indicador ahí encima era
              redundante — dos formas de decir "estás en el paso 2" en la misma pantalla. */}
          <StepIndicator />

          {/* Camino de vuelta simétrico a «Elegir otro plan»: si el tenant llegó acá y no
              quiere cambiar de plan, tiene que poder volver a renovar el que ya tiene sin
              tener que buscarlo y volver a elegirlo en la grilla. */}
          {currentPlan && (
            <button
              type="button"
              onClick={() => selectPlan(currentPlan)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-50 text-primary-700 text-xs font-semibold hover:bg-primary-100 transition-colors"
            >
              <ChevronLeft size={14} /> Volver a mi plan actual
            </button>
          )}

          {loadingPlans ? (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
              <Loader2 className="animate-spin" size={20} />
              Cargando planes…
            </div>
          ) : plans.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No hay planes disponibles por ahora.</p>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 max-h-[65vh] overflow-y-auto pr-1">
              {plans.map((p, i) => {
                const cycles = cyclesOf(p)
                const chosen = cardCycle(p)
                const discountPct =
                  chosen && chosen.gross_amount > 0 && chosen.net_amount !== chosen.gross_amount
                    ? Math.round((1 - chosen.net_amount / chosen.gross_amount) * 100)
                    : 0
                // Es dato real (el plan que ya tiene contratado), no una etiqueta de marketing
                // inventada — a diferencia de un "más popular" que no hay cómo respaldar con
                // los datos del plan.
                const isCurrentPlan = Boolean(hub?.subscription.can_operate) && p.name === hub?.subscription.plan_name
                return (
                  <div
                    key={p.id}
                    className={`text-left rounded-2xl border bg-white p-4 hover:shadow-md transition-shadow flex flex-col border-t-4 ${
                      isCurrentPlan ? 'border-primary-200 ring-1 ring-primary-100' : 'border-gray-200'
                    } ${CARD_ACCENTS[i % CARD_ACCENTS.length]}`}
                  >
                    {/* En flujo, no superpuesta al borde: como badge flotante (-top-2.5) se
                        recortaba contra el contenedor con scroll (overflow-y-auto) de la
                        grilla en la fila de arriba. */}
                    {isCurrentPlan && (
                      <span className="self-start mb-2 px-2 py-0.5 rounded-full bg-primary-600 text-white text-[10px] font-bold uppercase tracking-wide">
                        Tu plan actual
                      </span>
                    )}
                    <div className="flex items-center gap-2 mb-1">
                      <Package size={16} className="text-primary-600" />
                      <span className="font-semibold text-gray-800">{p.name}</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">
                      {chosen ? formatMoney(chosen.net_amount) : formatMoney(p.price)}
                      <span className="text-xs font-normal text-gray-500">
                        {' '}
                        /{chosen ? (chosen.months === 1 ? 'mes' : `${chosen.months} meses`) : billingCycleShort(p.billing_cycle)}
                      </span>
                    </p>
                    {chosen && chosen.net_amount !== chosen.gross_amount && (
                      <p className="flex items-center gap-1.5 -mt-1">
                        <span className="text-xs text-gray-400 line-through">{formatMoney(chosen.gross_amount)}</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                          -{discountPct}%
                        </span>
                      </p>
                    )}
                    {p.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description}</p>}

                    {cycles.length > 1 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {cycles.map(c => (
                          <button
                            key={c.months}
                            type="button"
                            onClick={() => setCardMonths(m => ({ ...m, [p.id]: c.months }))}
                            className={`px-2 py-1 rounded-lg text-[11px] font-medium border ${
                              chosen?.months === c.months
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            {c.months}m
                          </button>
                        ))}
                      </div>
                    )}

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

                    <button
                      type="button"
                      onClick={() => selectPlan(p, chosen?.months)}
                      className={`mt-4 w-full px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                        isCurrentPlan
                          ? 'bg-primary-600 text-white hover:bg-primary-700'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {isCurrentPlan ? 'Renovar este plan' : 'Elegir este plan'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {/* Botón, no enlace suelto: es la acción de retroceder del paso 2, así que pesa
              visualmente como tal — mismo color primario que el resto de acciones de este
              flujo (StepIndicator, «Cambiar de plan» del resumen del plan). */}
          <button
            type="button"
            onClick={goBackToGrid}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-50 text-primary-700 text-xs font-semibold hover:bg-primary-100 transition-colors"
          >
            <ChevronLeft size={14} /> Elegir otro plan
          </button>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3.5 py-3 flex items-center gap-3">
              <span className="p-2 rounded-lg bg-white border border-gray-100 text-primary-600 shrink-0">
                <Package size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-800 text-sm truncate">{selected.name}</p>
                {!isLifetime && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {months} {months === 1 ? 'mes' : 'meses'} de renovación
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-primary-100 bg-primary-50/60 px-3.5 py-3 flex items-center gap-3">
              <span className="p-2 rounded-lg bg-white text-primary-600 shrink-0">
                <CreditCard size={16} />
              </span>
              <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
                <span className="text-sm text-gray-700">Total a depositar</span>
                <span className="text-lg font-bold text-gray-900 shrink-0">
                  {selectedCycle && selectedCycle.net_amount !== selectedCycle.gross_amount && (
                    <span className="text-sm font-normal text-gray-400 line-through mr-2">{formatMoney(selectedCycle.gross_amount)}</span>
                  )}
                  {formatMoney(totalAmount)}
                </span>
              </div>
            </div>
          </div>

          {!selectedCycle && (
            <p className="text-xs text-amber-600">Este plan no tiene ciclos disponibles por ahora — contacta a soporte.</p>
          )}

          {/* El comprobante ya es obligatorio para renovar (antes se podía enviar solo la
              solicitud y pagar después) — agrupado en una sola tarjeta igual que antes, pero el
              copy y el color ahora dejan claro que este paso no es opcional. */}
          <div className="rounded-xl border border-gray-100 p-3.5 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Comprobante de pago
            </p>
            <p className="text-xs text-red-600 font-medium -mt-2">
              Adjunta tu comprobante de pago para poder enviar la renovación.
            </p>

            {hub && hub.payment_config.methods.length > 0 && (
              <div>
                <label className="text-xs text-gray-600">Método de pago</label>
                <select className={inputClass} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  <option value="">Elige un método para ver cómo pagar…</option>
                  {hub.payment_config.methods.map(m => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
              </div>
            )}

            {hub && paymentMethod && <PaymentMethodsPanel cfg={hub.payment_config} selectedMethodKey={paymentMethod} />}

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 flex items-center gap-1">
                  <Calendar size={12} className="text-gray-400" /> Fecha de pago
                </label>
                <input
                  type="date"
                  className={inputClass}
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 flex items-center gap-1">
                  <Hash size={12} className="text-gray-400" /> Referencia / Nº operación
                </label>
                <input className={inputClass} value={reference} onChange={e => setReference(e.target.value)} placeholder="Opcional" />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-600">
                Comprobante <span className="text-red-600">*</span>
              </label>
              <div
                className={`mt-1 border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-colors ${
                  receipt
                    ? 'border-gray-200 hover:border-primary-400 hover:bg-primary-50/30'
                    : 'border-red-200 bg-red-50/40 hover:border-red-300 hover:bg-red-50/70'
                }`}
                onClick={() => receiptRef.current?.click()}
              >
                <input
                  ref={receiptRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,.webp"
                  className="hidden"
                  onChange={e => setReceipt(e.target.files?.[0] ?? null)}
                />
                {receipt ? (
                  <p className="flex items-center justify-center gap-1.5 text-primary-600 text-sm font-medium">
                    <FileUp size={14} /> {receipt.name}
                  </p>
                ) : (
                  <p className="flex items-center justify-center gap-1.5 text-red-600 text-sm font-medium">
                    <Upload size={14} /> Clic para adjuntar imagen o PDF
                  </p>
                )}
              </div>
            </div>
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
              disabled={submitting || !selectedCycle || !receipt}
              className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
              {advancingCurrentPlan ? 'Enviar renovación' : 'Enviar solicitud'}
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
