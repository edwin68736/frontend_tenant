import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, CalendarClock, Headphones, CreditCard } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useSubscriptionStatus } from '@/contexts/SubscriptionStatusContext'
import {
  planReminderModalKey,
  planReminderTitle,
} from '@/pages/subscription/planNotifications'
import { formatDate, formatMoney, nextPaymentDate } from '@/pages/subscription/subscriptionUx'
import {
  buildSupportWhatsAppHref,
  DEFAULT_SUPPORT_WHATSAPP_MESSAGE,
  openExternalUrl,
} from '@/utils/supportWhatsApp'

const SEEN_STORAGE_KEY = 'tenant_plan_reminder_seen'

function readSeen(): string {
  try {
    return window.localStorage.getItem(SEEN_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function markSeen(key: string) {
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, key)
  } catch {
    /* modo privado o storage lleno: el modal simplemente reaparecerá */
  }
}

/**
 * Aviso modal de vencimiento/mora del plan, montado una vez en el layout.
 *
 * La campana del header es pasiva y mucha gente no la mira; este modal interrumpe una vez por
 * día en cada fecha configurada en «Recordatorios» del panel central, y de nuevo cada vez que
 * el estado empeora. El texto es el que arma el backend con esos mismos ajustes, así que no
 * hay reglas de negocio duplicadas aquí.
 */
export default function PlanReminderModal() {
  const { hub, loading } = useSubscriptionStatus()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [shownKey, setShownKey] = useState<string | null>(null)

  const key = planReminderModalKey(hub)
  // En /subscription el estado ya está a la vista con su banner y el formulario de pago:
  // tapar esa pantalla con el mismo mensaje solo estorba.
  const onSubscriptionPage = location.pathname.startsWith('/subscription')

  useEffect(() => {
    if (loading || !key || onSubscriptionPage) return
    if (readSeen() === key) return
    setShownKey(key)
    setOpen(true)
  }, [key, loading, onSubscriptionPage])

  const close = () => {
    if (shownKey) markSeen(shownKey)
    setOpen(false)
  }

  if (!hub || !shownKey) return null

  const sub = hub.subscription
  const ctx = hub.billing_context
  const tier = ctx?.urgency_tier ?? 'normal'
  const message = ctx?.status_banner_message || hub.status_banner?.message || ''
  const dueIso = nextPaymentDate(sub)
  const debt = ctx?.has_real_debt ? (ctx.display_debt_amount ?? sub.pending_amount) : 0
  const isCritical = tier === 'suspended' || tier === 'blocked' || tier === 'overdue'
  const supportHref = buildSupportWhatsAppHref(hub.support, DEFAULT_SUPPORT_WHATSAPP_MESSAGE)

  return (
    <Modal open={open} onClose={close} contentClassName="max-w-md">
      <div className="flex items-start gap-3">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
            isCritical ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
          }`}
        >
          {isCritical ? <AlertTriangle size={22} /> : <CalendarClock size={22} />}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-800">{planReminderTitle(tier)}</h2>
          <p className="text-sm text-gray-600 mt-1">{message}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50/70 divide-y divide-gray-100 text-sm">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-gray-500">Plan</span>
          <span className="font-semibold text-gray-800">{sub.plan_name || '—'}</span>
        </div>
        {dueIso ? (
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-gray-500">{tier === 'reminder' ? 'Vence el' : tier === 'payment_due' ? 'Vence el pago' : 'Venció el'}</span>
            <span className="font-semibold text-gray-800">{formatDate(dueIso)}</span>
          </div>
        ) : null}
        {debt > 0 ? (
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-gray-500">Monto pendiente</span>
            <span className={`font-bold ${isCritical ? 'text-red-600' : 'text-amber-600'}`}>
              {formatMoney(debt)}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button
          type="button"
          onClick={close}
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Recordarme luego
        </button>
        {/* Bloqueado por strikes: el tenant no puede enviar comprobantes, así que el único
            camino real es hablar con soporte. */}
        {sub.can_submit_payment === false && supportHref ? (
          <button
            type="button"
            onClick={() => {
              close()
              void openExternalUrl(supportHref)
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-semibold hover:bg-[rgb(var(--p700))]"
          >
            <Headphones size={16} />
            Contactar a soporte
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              close()
              navigate('/subscription')
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-semibold hover:bg-[rgb(var(--p700))]"
          >
            <CreditCard size={16} />
            {tier === 'reminder' ? 'Renovar ahora' : tier === 'payment_due' ? 'Pagar ahora' : 'Regularizar pago'}
          </button>
        )}
      </div>
    </Modal>
  )
}
