import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Crown,
  RefreshCw,
} from 'lucide-react'
import type { BillingHub } from '@/services/subscription.service'
import {
  STATUS_LABELS,
  bannerClass,
  formatDate,
  formatMoney,
  getUrgencyTier,
  nextPaymentDate,
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
  /** Abre el selector de plan (PlanPickerModal): con suscripción activa detecta sola el plan
   *  vigente y salta directo a «Adelantar pago», sin pasar por la grilla — sirve igual para
   *  renovar el mismo plan (con o sin cobro ya emitido) que para cambiarse a otro. */
  onManagePlan: () => void
}

export default function PlanDetailFrame({ hub, onManagePlan }: Props) {
  const sub = hub.subscription
  const ctx = hub.billing_context
  const tier = getUrgencyTier(hub)
  const planAmt = planAmountDisplay(hub)
  const nextPay = nextPaymentDate(sub)
  const hasDebt = Boolean(ctx?.has_real_debt) && (ctx?.display_debt_amount ?? 0) > 0
  // billing_cycle es el del PLAN; los meses contratados pueden ser otros (un plan mensual
  // vendido por 3 meses decía «Mensual» junto a un período de 3 meses).
  const cycleLabel = periodLabel(sub)
  const borderAccent = TIER_BORDER[tier] ?? TIER_BORDER.normal
  const showAlert = ctx?.show_status_banner && hub.status_banner?.message
  // El botón «Renovar ahora» solo tiene sentido para el aviso temprano (aún no hay deuda real
  // — esa ya tiene su propia barra de acción, PendingPaymentBanner): evita ofrecer la misma
  // acción dos veces con textos distintos en la misma pantalla.
  const showRenewCta = showAlert && !hasDebt && tier === 'reminder'

  return (
    <section
      className={`rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden border-l-4 ${borderAccent}`}
      aria-label="Resumen detallado del plan"
    >
      <div className="p-5 space-y-4">
        {/* El bloque del plan y los datos iban en dos filas separadas por un borde, con todo
            el ancho a la derecha del ícono vacío en pantallas anchas. Ahora comparten una
            sola fila: el plan a la izquierda con ancho fijo, los datos ocupando el resto. */}
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
          <div className="flex items-start gap-3 shrink-0 lg:w-56">
            <div className="p-2.5 rounded-xl bg-primary-50 text-primary-700 shrink-0">
              <Crown size={20} />
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
              {/* Siempre visible, a diferencia de «Renovar ahora» (solo aparece cerca del
                  vencimiento): es la única puerta para cambiar o adelantar el plan el resto
                  del tiempo, ahora que ya no vive un botón aparte en el encabezado. */}
              <button
                type="button"
                onClick={onManagePlan}
                className="text-xs font-medium text-primary-600 hover:underline mt-1"
              >
                Cambiar de plan
              </button>
            </div>
          </div>

          {/* Tres datos, no ocho. «Próximo pago» y «Vencimiento» convivían como columnas sueltas
              y se leían como contradictorios —el cobro vence antes que el plan— cuando en
              realidad responden a preguntas distintas: hasta cuándo tengo servicio, y hasta
              cuándo tengo para pagar. Cada bloque responde una sola. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-1 min-w-0">
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

          {/* Antes repetía, con otras palabras, el mismo estado que ya dicen el badge de
              arriba y el aviso de la 4ª columna (2-3 veces la misma información). Ahora
              responde una sola pregunta — ¿cuándo es el próximo cobro? — con la fecha sola. */}
          <DetailCell label="Próximo pago">
            <span className="font-medium">{nextPay ? formatDate(nextPay) : '—'}</span>
            {hasDebt && (sub.is_suspended || sub.tenant_status === 'suspended') && sub.reconnection_fee > 0 ? (
              <span className="block text-xs text-gray-500 mt-0.5">
                Incluye reconexión de {formatMoney(sub.reconnection_fee)}
              </span>
            ) : null}
          </DetailCell>

          {/* El aviso ocupa la cuarta columna cuando los datos van en fila (lg+), y pasa a
              línea completa cuando van apilados debajo del plan (donde antes quedaba un
              hueco). La deuda ya vencida/cobrable HOY tiene su propia barra debajo de esta
              tarjeta (más notoria); acá solo va el aviso de renovación anticipada, con su
              propio botón para adelantarla. */}
          <div className="col-span-2 lg:col-span-1 flex items-start">
            {showAlert ? (
              <div className={`w-full rounded-xl border px-3 py-2.5 flex flex-col gap-2 text-sm ${bannerClass(hub.status_banner.variant)}`}>
                <div className="flex gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <p className="font-medium">{hub.status_banner.message}</p>
                </div>
                {showRenewCta && (
                  <button
                    type="button"
                    onClick={onManagePlan}
                    className="inline-flex items-center justify-center gap-1.5 self-start px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                  >
                    <RefreshCw size={13} />
                    Renovar ahora
                  </button>
                )}
              </div>
            ) : (
              <div className="w-full rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 flex gap-2 text-sm text-emerald-800">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <p className="font-medium">Tu suscripción está al día.</p>
              </div>
            )}
          </div>
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
