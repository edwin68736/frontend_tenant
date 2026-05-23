import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Shield,
  Wallet,
} from 'lucide-react'
import type { BillingHub } from '@/services/subscription.service'
import {
  STATUS_LABELS,
  bannerClass,
  formatDate,
  formatMoney,
  getUrgencyTier,
  nextPaymentDate,
  paymentStatusShort,
  paymentToneClass,
  planAmountDisplay,
  statusBadgeClass,
} from './subscriptionUx'

const CYCLE_LABELS: Record<string, string> = {
  monthly: 'Mensual',
  semiannual: 'Semestral',
  annual: 'Anual',
  yearly: 'Anual',
  lifetime: 'Vitalicio',
}

const TIER_BORDER: Record<string, string> = {
  normal: 'border-l-emerald-500',
  reminder: 'border-l-amber-500',
  grace: 'border-l-amber-500',
  overdue: 'border-l-red-500',
  suspended: 'border-l-red-600',
  blocked: 'border-l-slate-700',
  provisional: 'border-l-blue-500',
  review: 'border-l-blue-500',
}

function DetailCell({
  label,
  children,
  className = '',
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl bg-gray-50/80 border border-gray-100/80 px-3 py-2.5 ${className}`}>
      <p className="text-[10px] uppercase tracking-wide font-medium text-gray-500">{label}</p>
      <div className="mt-1 text-sm font-semibold text-gray-900">{children}</div>
    </div>
  )
}

type Props = {
  hub: BillingHub
  onManagePayment: () => void
}

export default function PlanDetailFrame({ hub, onManagePayment }: Props) {
  const sub = hub.subscription
  const ctx = hub.billing_context
  const tier = getUrgencyTier(hub)
  const payShort = paymentStatusShort(hub)
  const paymentLabel = ctx?.current_payment_label ?? 'Pagado'
  const paymentTone = ctx?.current_payment_tone ?? 'success'
  const planAmt = planAmountDisplay(hub)
  const nextPay = nextPaymentDate(sub)
  const cycleLabel = CYCLE_LABELS[sub.billing_cycle] ?? sub.billing_cycle
  const borderAccent = TIER_BORDER[tier] ?? TIER_BORDER.normal
  const showAlert = ctx?.show_status_banner && hub.status_banner?.message

  return (
    <section
      className={`rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden border-l-4 ${borderAccent}`}
      aria-label="Resumen detallado del plan"
    >
      <div className="px-5 py-4 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-primary-50 text-primary-700 shrink-0">
            <Shield size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tu plan actual</p>
            <h2 className="text-xl font-bold text-gray-900 truncate">{sub.plan_name || 'Sin plan'}</h2>
            <p className="text-sm text-gray-500 mt-0.5">Ciclo {cycleLabel.toLowerCase()}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onManagePayment}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 transition-colors"
        >
          <Wallet size={16} />
          Gestionar pago
          <ChevronRight size={14} className="text-gray-400" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <DetailCell label="Estado de suscripción">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${statusBadgeClass(sub.status)}`}>
              {(STATUS_LABELS[sub.status] ?? sub.status).toUpperCase()}
            </span>
          </DetailCell>

          <DetailCell label="Pago actual">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${paymentToneClass(paymentTone)}`}>
              {payShort.icon === 'ok' && <CheckCircle2 size={12} />}
              {payShort.icon === 'warn' && <AlertTriangle size={12} />}
              {payShort.icon === 'danger' && <AlertTriangle size={12} />}
              {paymentLabel}
            </span>
          </DetailCell>

          <DetailCell label="Monto del plan">{formatMoney(planAmt)}</DetailCell>

          <DetailCell label="Próximo pago">
            <span className="inline-flex items-center gap-1 font-medium">
              <Calendar size={14} className="text-gray-400 shrink-0" />
              {nextPay ? formatDate(nextPay) : '—'}
            </span>
          </DetailCell>

          <DetailCell label="Inicio del período">
            {sub.start_date ? formatDate(sub.start_date) : '—'}
          </DetailCell>

          <DetailCell label="Vencimiento">
            {sub.end_date ? formatDate(sub.end_date) : '—'}
          </DetailCell>

          <DetailCell label="Días restantes">
            <span
              className={
                sub.days_until_expiry <= (ctx?.max_reminder_days ?? 7) && sub.days_until_expiry > 0
                  ? 'text-amber-700'
                  : sub.days_until_expiry <= 0
                    ? 'text-red-700'
                    : 'text-emerald-700'
              }
            >
              {sub.days_until_expiry >= 0 ? `${sub.days_until_expiry} días` : 'Vencido'}
            </span>
          </DetailCell>

          <DetailCell label="Ciclo de facturación">{cycleLabel}</DetailCell>
        </div>

        {(ctx?.has_real_debt && (ctx.display_debt_amount ?? 0) > 0) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Monto pendiente del ciclo actual</p>
            <p className="text-lg font-bold mt-0.5">{formatMoney(ctx.display_debt_amount ?? 0)}</p>
            {(sub.is_suspended || sub.tenant_status === 'suspended') && sub.reconnection_fee > 0 && (
              <p className="text-xs mt-1 opacity-90">
                Puede incluir cargo de reconexión (S/ {sub.reconnection_fee.toFixed(2)}) por suspensión.
              </p>
            )}
          </div>
        )}

        {sub.provisional_hours_left != null && sub.provisional_hours_left > 0 && (
          <p className="text-sm text-blue-800 flex items-center gap-2">
            <Clock size={16} className="shrink-0" />
            Acceso provisional: aprox. {sub.provisional_hours_left} h restantes.
          </p>
        )}

        {sub.has_pending_payment_review && (
          <p className="text-sm text-blue-700">Tienes un comprobante en revisión. Te avisaremos al aprobarlo.</p>
        )}

        {showAlert && (
          <div className={`rounded-xl border px-3 py-2.5 flex gap-2 text-sm ${bannerClass(hub.status_banner.variant)}`}>
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p className="font-medium">{hub.status_banner.message}</p>
          </div>
        )}

        {!ctx?.has_real_debt && tier === 'normal' && sub.status === 'active' && !showAlert && (
          <p className="text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            Tu suscripción está al día.
          </p>
        )}
      </div>
    </section>
  )
}
