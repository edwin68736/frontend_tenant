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

/** Meses de cada ciclo, para saber si lo contratado coincide con el ciclo del plan. */
const CYCLE_MONTHS: Record<string, number> = {
  monthly: 1,
  semiannual: 6,
  annual: 12,
  yearly: 12,
}

/**
 * Período contratado. Si los meses pagados coinciden con el ciclo del plan se usa la
 * etiqueta de siempre ("Mensual"); si no, se dice la duración real ("3 meses"), que es lo
 * que determina el próximo pago.
 */
function periodLabel(sub: { billing_cycle: string; contracted_months?: number }): string {
  const cycle = CYCLE_LABELS[sub.billing_cycle] ?? sub.billing_cycle
  const months = sub.contracted_months ?? 0
  if (sub.billing_cycle === 'lifetime' || months <= 0) return cycle
  if (CYCLE_MONTHS[sub.billing_cycle] === months) return cycle
  return months === 1 ? '1 mes' : `${months} meses`
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
  const hasDebt = Boolean(ctx?.has_real_debt) && (ctx?.display_debt_amount ?? 0) > 0
  // billing_cycle es el del PLAN; los meses contratados pueden ser otros (un plan mensual
  // vendido por 3 meses decía «Mensual» junto a un período de 3 meses).
  const cycleLabel = periodLabel(sub)
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
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900 truncate">{sub.plan_name || 'Sin plan'}</h2>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${statusBadgeClass(sub.status)}`}>
                {(STATUS_LABELS[sub.status] ?? sub.status).toUpperCase()}
              </span>
            </div>
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
        {/* Tres datos, no ocho. «Próximo pago» y «Vencimiento» convivían como columnas sueltas
            y se leían como contradictorios —el cobro vence antes que el plan— cuando en
            realidad responden a preguntas distintas: hasta cuándo tengo servicio, y hasta
            cuándo tengo para pagar. Cada bloque responde una sola. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          <DetailCell label="Servicio activo hasta">
            <span className="inline-flex items-center gap-1 font-medium">
              <Calendar size={14} className="text-gray-400 shrink-0" />
              {sub.end_date ? formatDate(sub.end_date) : '—'}
            </span>
            <span
              className={`block text-xs mt-0.5 ${
                sub.days_until_expiry <= 0
                  ? 'text-red-700'
                  : sub.days_until_expiry <= (ctx?.max_reminder_days ?? 7)
                    ? 'text-amber-700'
                    : 'text-gray-500'
              }`}
            >
              {sub.days_until_expiry > 0
                ? `Quedan ${sub.days_until_expiry} día(s)`
                : sub.days_until_expiry === 0
                  ? 'Vence hoy'
                  : 'Vencido'}
            </span>
          </DetailCell>

          <DetailCell label="Importe del período">
            <span className="font-medium">{formatMoney(planAmt)}</span>
            <span className="block text-xs text-gray-500 mt-0.5">
              {sub.start_date && sub.end_date
                ? `${formatDate(sub.start_date)} → ${formatDate(sub.end_date)}`
                : cycleLabel}
            </span>
          </DetailCell>

          <DetailCell label="Pago">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${paymentToneClass(paymentTone)}`}>
              {payShort.icon === 'ok' && <CheckCircle2 size={12} />}
              {payShort.icon !== 'ok' && <AlertTriangle size={12} />}
              {paymentLabel}
            </span>
            {hasDebt && nextPay ? (
              <span className="block text-xs text-gray-500 mt-1">
                Vence el {formatDate(nextPay)}
              </span>
            ) : null}
            {hasDebt && (sub.is_suspended || sub.tenant_status === 'suspended') && sub.reconnection_fee > 0 ? (
              <span className="block text-xs text-gray-500 mt-0.5">
                Incluye reconexión de {formatMoney(sub.reconnection_fee)}
              </span>
            ) : null}
          </DetailCell>

          {/* El aviso ocupa la cuarta columna en pantallas anchas, donde antes quedaba un
              hueco, y pasa a línea completa cuando no cabe. */}
          <div className="sm:col-span-3 xl:col-span-1 flex items-start">
            {showAlert ? (
              <div className={`w-full rounded-xl border px-3 py-2.5 flex gap-2 text-sm ${bannerClass(hub.status_banner.variant)}`}>
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <p className="font-medium">{hub.status_banner.message}</p>
              </div>
            ) : (
              <div className="w-full rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 flex gap-2 text-sm text-emerald-800">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <p className="font-medium">Tu suscripción está al día.</p>
              </div>
            )}
          </div>
        </div>

        {sub.provisional_hours_left != null && sub.provisional_hours_left > 0 && (
          <p className="text-sm text-blue-800 flex items-center gap-2">
            <Clock size={16} className="shrink-0" />
            Acceso provisional: aprox. {sub.provisional_hours_left} h restantes.
          </p>
        )}

        {sub.has_pending_payment_review && (
          <p className="text-sm text-blue-700">Tienes un comprobante en revisión. Te avisaremos al aprobarlo.</p>
        )}
      </div>
    </section>
  )
}
