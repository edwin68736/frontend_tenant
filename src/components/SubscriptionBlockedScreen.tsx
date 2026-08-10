import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { AlertTriangle, CreditCard, Headphones, Lock, Package } from 'lucide-react'
import { useSubscriptionStatus } from '@/contexts/SubscriptionStatusContext'
import { planReminderTitle } from '@/pages/subscription/planNotifications'
import { formatMoney } from '@/pages/subscription/subscriptionUx'
import PlanPickerModal from '@/components/PlanPickerModal'
import {
  buildSupportWhatsAppHref,
  DEFAULT_SUPPORT_WHATSAPP_MESSAGE,
  openExternalUrl,
} from '@/utils/supportWhatsApp'
import { BARCODE_SCANNER_Z } from '@/utils/uiLayers'

/**
 * Reemplaza el <Outlet/> del ERP cuando `can_operate=false` (plan vencido fuera de gracia,
 * suspendido o bloqueado). Antes de esto, las pantallas seguían montadas y cada una fallaba en
 * silencio contra el 402 del backend (listas vacías, toasts genéricos) sin decir nunca la causa.
 *
 * A diferencia de `PlanReminderModal` (dismisseable, una vez por día), esta pantalla no se
 * puede cerrar: se mantiene mientras `can_operate` siga en false, porque el backend tampoco
 * deja operar ninguna otra ruta mientras tanto.
 */
export default function SubscriptionBlockedScreen() {
  const { hub } = useSubscriptionStatus()
  const navigate = useNavigate()
  const [pickerOpen, setPickerOpen] = useState(false)
  if (!hub) return null

  const sub = hub.subscription
  const ctx = hub.billing_context
  const tier = ctx?.urgency_tier ?? 'suspended'
  const message =
    ctx?.status_banner_message ||
    hub.status_banner?.message ||
    'Tu suscripción no está activa. Regulariza tu plan para seguir usando el sistema.'
  const debt = ctx?.has_real_debt ? (ctx.display_debt_amount ?? sub.pending_amount) : 0
  const canSubmitPayment = sub.can_submit_payment !== false
  const supportHref = buildSupportWhatsAppHref(hub.support, DEFAULT_SUPPORT_WHATSAPP_MESSAGE)

  return (
    <div
      className={`fixed inset-0 ${BARCODE_SCANNER_Z} flex items-center justify-center bg-gray-950/60 p-4 pt-safe pb-safe`}
      role="alertdialog"
      aria-modal="true"
      aria-label="Suscripción no activa"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
            {tier === 'blocked' ? <Lock size={22} /> : <AlertTriangle size={22} />}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-800">{planReminderTitle(tier)}</h2>
            <p className="mt-1 text-sm text-gray-600">{message}</p>
          </div>
        </div>

        <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50/70 text-sm">
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-gray-500">Plan</span>
            <span className="font-semibold text-gray-800">{sub.plan_name || '—'}</span>
          </div>
          {debt > 0 ? (
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="text-gray-500">Monto pendiente</span>
              <span className="font-bold text-red-600">{formatMoney(debt)}</span>
            </div>
          ) : null}
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Tus datos están a salvo; el acceso se restablece apenas se regularice el pago.
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {!canSubmitPayment && supportHref ? (
            <button
              type="button"
              onClick={() => void openExternalUrl(supportHref)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[rgb(var(--p600))] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[rgb(var(--p700))]"
            >
              <Headphones size={16} />
              Contactar a soporte
            </button>
          ) : (
            <>
              {debt > 0 ? (
                <button
                  type="button"
                  onClick={() => navigate('/subscription')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <CreditCard size={16} />
                  Pagar mi deuda actual
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[rgb(var(--p600))] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[rgb(var(--p700))]"
              >
                <Package size={16} />
                Elegir plan
              </button>
            </>
          )}
        </div>
      </div>
      <PlanPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  )
}
