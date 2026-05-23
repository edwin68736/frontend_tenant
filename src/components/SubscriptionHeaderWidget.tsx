import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, CreditCard, Loader2, XCircle } from 'lucide-react'
import { useSubscriptionStatus } from '@/contexts/SubscriptionStatusContext'
import {
  STATUS_LABELS,
  formatDate,
  getUrgencyTier,
  nextPaymentDate,
  paymentStatusShort,
  paymentToneClass,
  widgetAccentClass,
  widgetTooltip,
} from '@/pages/subscription/subscriptionUx'

function PaymentIcon({ kind }: { kind: 'ok' | 'warn' | 'danger' }) {
  if (kind === 'ok') return <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
  if (kind === 'danger') return <XCircle size={12} className="text-red-600 shrink-0" />
  return <AlertTriangle size={12} className="text-amber-600 shrink-0" />
}

export default function SubscriptionHeaderWidget() {
  const { hub, loading } = useSubscriptionStatus()

  if (loading && !hub) {
    return (
      <div className="hidden sm:flex items-center px-2 py-0.5 rounded-lg border border-gray-100 bg-gray-50/80 shrink-0">
        <Loader2 size={14} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (!hub?.subscription?.has_subscription) return null

  const sub = hub.subscription
  const tier = getUrgencyTier(hub)
  const pay = paymentStatusShort(hub)
  const dateIso = nextPaymentDate(sub)
  const dateLabel = dateIso ? formatDate(dateIso) : '—'
  const statusLabel = (STATUS_LABELS[sub.status] ?? sub.status).toUpperCase()
  const accent = widgetAccentClass(tier, sub.is_blocked)
  const isDark = tier === 'blocked' || sub.is_blocked
  const tooltip = widgetTooltip(hub)

  return (
    <Link
      to="/subscription"
      title={tooltip}
      className={`group flex items-center gap-1.5 sm:gap-2 rounded-lg border px-2 py-0.5 sm:px-2.5 sm:py-1 text-left transition-colors min-w-0 max-w-[min(100%,280px)] md:max-w-none shrink-0 ${accent}`}
    >
      {/* Mobile: icono + badge pago */}
      <span className="flex sm:hidden items-center gap-1">
        <CreditCard size={16} className={isDark ? 'text-slate-200' : 'text-gray-500'} />
        <span
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide ${paymentToneClass(
            hub.billing_context?.current_payment_tone ?? 'success',
          )}`}
        >
          <PaymentIcon kind={pay.icon} />
          {pay.label}
        </span>
      </span>

      {/* Tablet+ */}
      <span className="hidden sm:flex flex-col min-w-0 leading-tight">
        <span className={`text-[10px] font-bold uppercase tracking-wide truncate max-w-[88px] md:max-w-[120px] ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {sub.plan_name || 'Plan'}
        </span>
        <span
          className={`inline-flex items-center gap-0.5 mt-0.5 w-fit px-1 py-px rounded text-[9px] font-bold ${paymentToneClass(
            hub.billing_context?.current_payment_tone ?? 'success',
          )}`}
        >
          <PaymentIcon kind={pay.icon} />
          {pay.label}
        </span>
      </span>

      <span className={`hidden md:block w-px h-6 self-center ${isDark ? 'bg-slate-600' : 'bg-gray-200/90'}`} aria-hidden />

      <span className={`hidden md:flex flex-col text-[10px] leading-tight min-w-0 ${isDark ? 'text-slate-200' : 'text-gray-600'}`}>
        <span className={`font-medium ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>Próximo</span>
        <span className={`font-semibold truncate ${isDark ? 'text-white' : 'text-gray-800'}`}>{dateLabel}</span>
      </span>

      <span className={`hidden lg:inline-flex text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white/80 text-gray-600 border border-gray-200/80'}`}>
        {statusLabel}
      </span>
    </Link>
  )
}
