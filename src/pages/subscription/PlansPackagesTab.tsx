import { AlertTriangle, Package, RefreshCw, Sparkles } from 'lucide-react'
import type { BillingHub, DocumentPackageCatalog } from '@/services/subscription.service'
import {
  STATUS_LABELS,
  billingCycleLabel,
  docProgressColor,
  formatDate,
  formatMoney,
  statusBadgeClass,
} from './subscriptionUx'

type Props = {
  hub: BillingHub
  onBuyPackage: (pkg: DocumentPackageCatalog) => void
  onRenew: () => void
}

export default function PlansPackagesTab({ hub, onBuyPackage, onRenew }: Props) {
  const sub = hub.subscription
  const docs = hub.documents
  const packages = hub.document_packages ?? []

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Tu plan actual</h3>
        <div className="rounded-2xl border-2 border-primary-200 bg-primary-50/50 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-gray-900">{sub.plan_name || 'Sin plan'}</p>
              <p className="text-sm text-gray-600 mt-0.5">Ciclo {billingCycleLabel(sub.billing_cycle).toLowerCase()}</p>
              <span
                className={`inline-flex mt-2 px-2 py-0.5 rounded-full text-xs font-bold ${statusBadgeClass(sub.status)}`}
              >
                {STATUS_LABELS[sub.status] ?? sub.status}
              </span>
            </div>
            <button
              type="button"
              onClick={onRenew}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700"
            >
              <RefreshCw size={14} />
              Renovar / Cambiar de plan
            </button>
          </div>
        </div>
      </section>

      {docs ? (
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-primary-600" />
            Documentos electrónicos
          </h3>
          {docs.is_unlimited ? (
            <p className="text-sm text-emerald-700 font-medium">Tu plan incluye documentos electrónicos ilimitados.</p>
          ) : (
            <>
              <div className="flex items-end justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Uso del cupo mensual del plan</p>
                  {docs.quota_period_index && docs.quota_period_total ? (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Mes {docs.quota_period_index} de {docs.quota_period_total} de tu suscripción
                    </p>
                  ) : null}
                </div>
                <span className="text-sm font-bold text-gray-800">{docs.usage_percent}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden mb-4">
                <div
                  className={`h-full transition-all rounded-full ${docProgressColor(docs.usage_percent, docs.warning_level)}`}
                  style={{ width: `${Math.min(100, docs.usage_percent)}%` }}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Cupo del mes', value: docs.plan_limit, sub: `${docs.plan_remaining} restantes` },
                  { label: 'Usados', value: docs.plan_used, sub: 'este mes' },
                  { label: 'Paquetes', value: docs.package_remaining, sub: `+${docs.package_bonus} bonus` },
                  { label: 'Disponibles', value: docs.total_available, sub: 'total', highlight: true },
                ].map(c => (
                  <div
                    key={c.label}
                    className={`rounded-xl border p-3 ${c.highlight ? 'border-primary-200 bg-primary-50/50' : 'border-gray-100 bg-gray-50/50'}`}
                  >
                    <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">{c.label}</p>
                    <p className={`text-lg font-bold mt-0.5 ${c.highlight ? 'text-primary-700' : 'text-gray-900'}`}>
                      {c.value}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>
                  </div>
                ))}
              </div>
              {docs.warning_message && (
                <p
                  className={`text-sm mt-3 flex items-start gap-2 ${
                    docs.warning_level === 'exhausted' ? 'text-red-700' : 'text-amber-800'
                  }`}
                >
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  {docs.warning_message}
                </p>
              )}
              {/* Dos fechas distintas y fáciles de confundir: el cupo del plan se renueva cada
                  mes, mientras que los paquetes comprados duran hasta que vence la suscripción. */}
              <div className="mt-2 space-y-0.5">
                {docs.quota_period_end && (
                  <p className="text-xs text-gray-600">
                    Tu cupo de {docs.plan_limit} documentos se renueva el{' '}
                    <span className="font-semibold">{formatDate(docs.quota_period_end)}</span>.
                  </p>
                )}
                {docs.billing_cycle_end && (
                  <p className="text-xs text-gray-500">
                    Los paquetes adicionales vencen al terminar tu suscripción ({formatDate(docs.billing_cycle_end)}).
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      ) : null}

      {!docs?.is_unlimited && packages.length > 0 ? (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Comprar documentos adicionales</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {packages.map(p => (
              <div key={p.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm flex flex-col">
                <Package size={18} className="text-primary-600 mb-2" />
                <p className="font-bold text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{p.documents_qty} documentos</p>
                <p className="text-lg font-bold text-primary-700 mt-2">{formatMoney(p.price, p.currency)}</p>
                <button
                  type="button"
                  onClick={() => onBuyPackage(p)}
                  className="mt-auto pt-3 w-full py-2 rounded-xl border border-primary-200 text-primary-700 text-sm font-semibold hover:bg-primary-50"
                >
                  Comprar
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
