import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, CreditCard, XCircle } from 'lucide-react'
import { useSubscriptionStatus } from '@/contexts/SubscriptionStatusContext'
import {
  STATUS_LABELS,
  formatDate,
  nextPaymentDate,
  paymentStatusShort,
  paymentToneClass,
} from '@/pages/subscription/subscriptionUx'

function PaymentIcon({ kind }: { kind: 'ok' | 'warn' | 'danger' }) {
  if (kind === 'ok') return <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
  if (kind === 'danger') return <XCircle size={12} className="text-red-600 shrink-0" />
  return <AlertTriangle size={12} className="text-amber-600 shrink-0" />
}

type Props = {
  onClose: () => void
}

/**
 * Plan del tenant dentro del menú de la cuenta. Es la versión móvil de
 * SubscriptionHeaderWidget: en el header no cabe sin truncar el nombre del plan, y aquí
 * hay ancho para mostrarlo entero junto al estado y el próximo pago.
 * Solo se muestra bajo `md`; desde ahí manda el widget del header.
 */
export default function SubscriptionUserMenuItem({ onClose }: Props) {
  const { hub } = useSubscriptionStatus()
  if (!hub?.subscription?.has_subscription) return null

  const sub = hub.subscription
  const pay = paymentStatusShort(hub)
  const dateIso = nextPaymentDate(sub)
  const statusLabel = (STATUS_LABELS[sub.status] ?? sub.status).toUpperCase()

  return (
    <>
      <Link
        to="/subscription"
        onClick={onClose}
        className="mx-1.5 flex items-start gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-primary-50 md:hidden"
      >
        <CreditCard size={16} className="mt-0.5 shrink-0 text-primary-600" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-gray-800">
              {sub.plan_name || 'Plan'}
            </span>
            <span className="shrink-0 rounded bg-gray-100 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-gray-600">
              {statusLabel}
            </span>
          </span>
          <span className="mt-1 flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-bold ${paymentToneClass(
                hub.billing_context?.current_payment_tone ?? 'success',
              )}`}
            >
              <PaymentIcon kind={pay.icon} />
              {pay.label}
            </span>
            {dateIso ? (
              <span className="truncate text-[10px] text-gray-500">
                Próximo: {formatDate(dateIso)}
              </span>
            ) : null}
          </span>
        </span>
      </Link>
      <div className="mx-3 my-1 border-t border-gray-100 md:hidden" aria-hidden />
    </>
  )
}
