import { AlertCircle, Calendar, CalendarCheck, CheckCircle2, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import type { BillingHub } from '@/services/subscription.service'
import {
  STATUS_LABELS,
  contractedPeriodLabel,
  formatDate,
  formatMoney,
  nextPaymentDate,
  bannerClass,
  paymentStatusShort,
  planAmountDisplay,
  statusBadgeClass,
} from './subscriptionUx'

type Props = { hub: BillingHub }

function DetailCell({
  icon: Icon,
  iconClass,
  label,
  value,
  valueClass,
}: {
  icon: React.ElementType
  iconClass: string
  label: string
  value: React.ReactNode
  valueClass?: string
}) {
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-100 px-2.5 py-2 flex items-center gap-2.5 min-w-0">
      <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${iconClass}`}>
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium leading-none">{label}</p>
        <p className={`text-sm font-semibold mt-0.5 truncate ${valueClass ?? 'text-gray-900'}`}>{value}</p>
      </div>
    </div>
  )
}

export default function CurrentSubscriptionCard({ hub }: Props) {
  const sub = hub.subscription
  const ctx = hub.billing_context
  const pay = paymentStatusShort(hub)
  const nextPay = nextPaymentDate(sub)
  const planAmt = planAmountDisplay(hub)
  const hasDebt = Boolean(ctx?.has_real_debt) && (ctx?.display_debt_amount ?? 0) > 0
  const debtAmount = ctx?.display_debt_amount ?? sub.pending_amount

  return (
    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3.5 sm:px-5 sm:py-4">
        {/* Siempre visible, sin expandir/ocultar: el resumen del plan a la izquierda y sus
            datos (ciclo, inicio, fin, estado de pago) en fila al costado, no debajo. */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-5">
          <div className="min-w-0 lg:w-64 lg:shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Suscripción actual</p>
            <h2 className="text-lg font-bold text-gray-900 truncate mt-0.5">{sub.plan_name || 'Sin plan'}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${statusBadgeClass(sub.status)}`}>
                {STATUS_LABELS[sub.status] ?? sub.status}
              </span>
            </div>
            {/* «Vence» y «Próximo pago» convivían como dos fechas sueltas y se leían como
                contradictorias: la del cobro cae antes que la del plan. Cada línea dice ahora
                de qué fecha habla. */}
            <p className="mt-1.5 text-sm text-gray-600">
              {hasDebt ? (
                <>
                  Pago pendiente:{' '}
                  <span className="font-semibold text-amber-700">{formatMoney(debtAmount)}</span>
                  {nextPay ? <span className="text-gray-500"> · vence {formatDate(nextPay)}</span> : null}
                </>
              ) : (
                <>
                  Cuota del período:{' '}
                  <span className="font-semibold text-gray-900">{formatMoney(planAmt)}</span>
                  <span className="text-emerald-700"> · al día</span>
                </>
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 flex-1 min-w-0">
            <DetailCell
              icon={RefreshCw}
              iconClass="bg-gray-100 text-gray-500"
              label="Ciclo"
              value={contractedPeriodLabel(sub)}
            />
            <DetailCell
              icon={Calendar}
              iconClass="bg-gray-100 text-gray-500"
              label="Inicio"
              value={sub.start_date ? formatDate(sub.start_date) : '—'}
            />
            <DetailCell
              icon={CalendarCheck}
              iconClass={
                sub.days_until_expiry <= 0
                  ? 'bg-red-100 text-red-600'
                  : sub.days_until_expiry <= (ctx?.max_reminder_days ?? 7)
                    ? 'bg-amber-100 text-amber-600'
                    : 'bg-gray-100 text-gray-500'
              }
              label="Fin"
              value={sub.end_date ? formatDate(sub.end_date) : '—'}
              valueClass={sub.days_until_expiry <= 0 ? 'text-red-700' : undefined}
            />
            <DetailCell
              icon={hasDebt ? AlertCircle : CheckCircle2}
              iconClass={hasDebt ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}
              label="Estado de pago"
              value={ctx?.current_payment_label ?? pay.label}
              valueClass={hasDebt ? 'text-amber-700' : 'text-emerald-700'}
            />
          </div>
        </div>

        {(hub.documents || (hub.status_banner?.message && ctx?.show_status_banner)) && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            {hub.documents && !hub.documents.is_unlimited ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5 text-sm">
                <p className="font-semibold text-gray-800">Documentos electrónicos</p>
                <p className="text-gray-600 mt-0.5">
                  {hub.documents.total_available} disponibles · {hub.documents.plan_used} usados del plan
                  {hub.documents.package_remaining > 0 ? ` · ${hub.documents.package_remaining} de paquetes` : ''}
                </p>
              </div>
            ) : hub.documents?.is_unlimited ? (
              <p className="text-sm text-emerald-700 font-medium">Documentos electrónicos ilimitados en tu plan.</p>
            ) : null}

            {/* El aviso toma el color de su gravedad: en ámbar fijo, una cuenta bloqueada se
                leía igual que un recordatorio de renovación. */}
            {hub.status_banner?.message && ctx?.show_status_banner ? (
              <p className={clsx('text-sm rounded-xl border px-3 py-2', bannerClass(hub.status_banner.variant))}>
                {hub.status_banner.message}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}
