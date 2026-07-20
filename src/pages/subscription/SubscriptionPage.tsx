import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  Clock,
  Download,
  CreditCard,
  ExternalLink,
  FileText,
  FileUp,
  Headphones,
  History,
  Loader2,
  Package,
  RefreshCw,
  Wallet,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useSubscriptionStatus } from '@/contexts/SubscriptionStatusContext'
import {
  assetUrl,
  subscriptionService,
  type BillingHub,
  type BillingInvoice,
  type SupportConfig,
} from '@/services/subscription.service'
import PlanDetailFrame from './PlanDetailFrame'
import {
  STATUS_LABELS,
  billingCyclePaymentTotal,
  docProgressColor,
  formatDate,
  formatMoney,
} from './subscriptionUx'

const inputClass =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white'

/** Estado de cada período, en lenguaje del cliente (no el del backend). */
const INVOICE_STATUS_UI: Record<string, { label: string; className: string }> = {
  pending: { label: 'Por pagar', className: 'bg-amber-100 text-amber-800' },
  overdue: { label: 'Vencido', className: 'bg-red-100 text-red-700' },
  paid: { label: 'Pagado', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Anulado', className: 'bg-gray-100 text-gray-600' },
}

function Section({
  id,
  title,
  icon: Icon,
  children,
}: {
  id?: string
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <section id={id} className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden scroll-mt-24">
      <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2">
        <Icon size={18} className="text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function SupportCard({ support }: { support: SupportConfig }) {
  const wa = support.whatsapp?.replace(/\D/g, '')
  const links = [
    wa && { label: 'WhatsApp', href: `https://wa.me/${wa}`, text: support.whatsapp },
    support.email && { label: 'Email', href: `mailto:${support.email}`, text: support.email },
    support.phone && { label: 'Teléfono', href: `tel:${support.phone}`, text: support.phone },
  ].filter(Boolean) as { label: string; href: string; text: string }[]

  if (links.length === 0) {
    return <p className="text-xs text-gray-500">Contacte a soporte Tukifac.</p>
  }

  return (
    <ul className="space-y-2">
      {links.map(l => (
        <li key={l.label}>
          <a
            href={l.href}
            target={l.label === 'WhatsApp' ? '_blank' : undefined}
            rel="noreferrer"
            className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600 py-1"
          >
            <Headphones size={15} className="shrink-0 text-gray-400" />
            <span>
              <span className="font-medium">{l.label}</span>
              <span className="block text-xs text-gray-500 truncate">{l.text}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

export default function SubscriptionPage() {
  const { setHub: setGlobalHub, refresh: refreshGlobal } = useSubscriptionStatus()
  const [hub, setHub] = useState<BillingHub | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [billingCycleId, setBillingCycleId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [pkgId, setPkgId] = useState('')
  const [pkgReceipt, setPkgReceipt] = useState<File | null>(null)
  const [pkgReference, setPkgReference] = useState('')
  const [pkgSubmitting, setPkgSubmitting] = useState(false)

  /** Deuda que se está pagando; null = formulario cerrado. */
  const [payInvoice, setPayInvoice] = useState<BillingInvoice | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await subscriptionService.getHub()
      setHub(data)
      setGlobalHub(data)
      const pending = data.invoices.find(i => i.status === 'pending' || i.status === 'overdue')
      if (pending) {
        setBillingCycleId(String(pending.id))
        setAmount(String(billingCyclePaymentTotal(pending, data.subscription)))
      }
      const firstMethod = data.payment_config.methods[0]
      if (firstMethod) setPaymentMethod(firstMethod.key)
    } catch {
      toast.error('No se pudo cargar la suscripción')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /** Abre el formulario ya apuntado a la deuda elegida en la fila. */
  const openPayModal = (inv: BillingInvoice) => {
    setBillingCycleId(String(inv.id))
    if (hub?.subscription) {
      setAmount(String(billingCyclePaymentTotal(inv, hub.subscription)))
    }
    setReceipt(null)
    setReference('')
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setPayInvoice(inv)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const sub = hub?.subscription
    if (!sub?.can_submit_payment) {
      toast.error(sub?.support_message ?? 'No puede enviar comprobantes')
      return
    }
    if (!billingCycleId || !paymentMethod || !receipt) {
      toast.error('Complete período, método y comprobante')
      return
    }
    const form = new FormData()
    form.append('billing_cycle_id', billingCycleId)
    form.append('payment_method', paymentMethod)
    form.append('amount', amount)
    form.append('payment_date', paymentDate)
    if (reference.trim()) form.append('reference', reference.trim())
    form.append('receipt', receipt)

    setSubmitting(true)
    try {
      const res = await subscriptionService.submitPayment(form)
      toast.success(res.message ?? 'Pago enviado')
      setReceipt(null)
      setReference('')
      setPayInvoice(null)
      if (res.hub) {
        setHub(res.hub)
        setGlobalHub(res.hub)
      } else await load()
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: string } } }
      toast.error(apiErr?.response?.data?.error ?? 'Error al enviar')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !hub) {
    return (
      <div className="flex justify-center py-20 text-gray-500 gap-2">
        <Loader2 className="animate-spin" size={22} />
        Cargando suscripción…
      </div>
    )
  }

  const sub = hub.subscription
  const cfg = hub.payment_config
  const portalAlt = cfg.portal_url_override?.trim()

  const quickLinks = [
    { id: 'historial-pagos', label: 'Historial de pagos', icon: CreditCard },
    { id: 'gestionar-pago', label: 'Mis pagos y deudas', icon: FileUp },
    { id: 'metodos-pago', label: 'Métodos de pago', icon: Wallet },
    { id: 'historial-suscripcion', label: 'Historial de suscripción', icon: History },
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-10 px-1 sm:px-0">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Suscripción</h1>
          <p className="text-sm text-gray-500 mt-0.5">Pagos, plan y documentos electrónicos</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void load()
            void refreshGlobal()
          }}
          className="p-2 rounded-xl border hover:bg-gray-50"
          title="Actualizar"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <PlanDetailFrame hub={hub} onManagePayment={() => scrollTo('gestionar-pago')} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
        <div className="space-y-5 min-w-0">
          {hub.documents && (
            <Section title="Documentos electrónicos" icon={FileText}>
              {hub.documents.is_unlimited ? (
                <p className="text-sm text-emerald-700 font-medium">Tu plan incluye documentos electrónicos ilimitados.</p>
              ) : (
                <>
                  <div className="flex items-end justify-between gap-2 mb-2">
                    <p className="text-xs text-gray-500">Uso del cupo del plan</p>
                    <span className="text-sm font-bold text-gray-800">{hub.documents.usage_percent}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden mb-4">
                    <div
                      className={`h-full transition-all rounded-full ${docProgressColor(
                        hub.documents.usage_percent,
                        hub.documents.warning_level,
                      )}`}
                      style={{ width: `${Math.min(100, hub.documents.usage_percent)}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Cupo plan', value: hub.documents.plan_limit, sub: `${hub.documents.plan_remaining} restantes` },
                      { label: 'Usados', value: hub.documents.plan_used, sub: 'del plan' },
                      { label: 'Paquetes', value: hub.documents.package_remaining, sub: `+${hub.documents.package_bonus} bonus` },
                      { label: 'Disponibles', value: hub.documents.total_available, sub: 'total', highlight: true },
                    ].map(c => (
                      <div
                        key={c.label}
                        className={`rounded-xl border p-3 ${c.highlight ? 'border-blue-200 bg-blue-50/50' : 'border-gray-100 bg-gray-50/50'}`}
                      >
                        <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">{c.label}</p>
                        <p className={`text-lg font-bold mt-0.5 ${c.highlight ? 'text-blue-700' : 'text-gray-900'}`}>{c.value}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>
                      </div>
                    ))}
                  </div>
                  {hub.documents.warning_message && (
                    <p
                      className={`text-sm mt-3 flex items-start gap-2 ${
                        hub.documents.warning_level === 'exhausted' ? 'text-red-700' : 'text-amber-800'
                      }`}
                    >
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      {hub.documents.warning_message}
                    </p>
                  )}
                  {hub.documents.billing_cycle_end && (
                    <p className="text-xs text-gray-500 mt-2">Los paquetes vencen con el ciclo ({formatDate(hub.documents.billing_cycle_end)}).</p>
                  )}
                </>
              )}
              {!hub.documents.is_unlimited && (hub.document_packages?.length ?? 0) > 0 && (
                <div className="mt-5 pt-5 border-t border-gray-100">
                  <p className="text-sm font-medium text-gray-800 mb-3 flex items-center gap-2">
                    <Package size={16} />
                    Comprar documentos adicionales
                  </p>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                    {hub.document_packages!.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPkgId(String(p.id))}
                        className={`text-left p-3 rounded-xl border transition-colors ${
                          pkgId === String(p.id) ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <p className="font-semibold text-gray-900 text-sm">{p.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{p.documents_qty} documentos</p>
                        <p className="text-sm font-medium text-blue-700 mt-1.5">{formatMoney(p.price, p.currency)}</p>
                      </button>
                    ))}
                  </div>
                  {pkgId && (
                    <form
                      className="space-y-3 max-w-md"
                      onSubmit={async e => {
                        e.preventDefault()
                        if (!pkgReceipt) {
                          toast.error('Adjunte comprobante')
                          return
                        }
                        const form = new FormData()
                        form.append('package_id', pkgId)
                        if (pkgReference.trim()) form.append('reference', pkgReference.trim())
                        form.append('receipt', pkgReceipt)
                        setPkgSubmitting(true)
                        try {
                          await subscriptionService.purchaseDocumentPackage(form)
                          toast.success('Solicitud enviada; pendiente de aprobación')
                          setPkgReceipt(null)
                          await load()
                        } catch (err: unknown) {
                          const apiErr = err as { response?: { data?: { error?: string } } }
                          toast.error(apiErr?.response?.data?.error ?? 'Error')
                        } finally {
                          setPkgSubmitting(false)
                        }
                      }}
                    >
                      <input
                        className={inputClass}
                        placeholder="Referencia de pago"
                        value={pkgReference}
                        onChange={e => setPkgReference(e.target.value)}
                      />
                      <input type="file" accept=".jpg,.jpeg,.png,.pdf,.webp" onChange={e => setPkgReceipt(e.target.files?.[0] ?? null)} />
                      <button
                        type="submit"
                        disabled={pkgSubmitting}
                        className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
                      >
                        {pkgSubmitting ? 'Enviando…' : 'Enviar comprobante de paquete'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </Section>
          )}

          <Section id="gestionar-pago" title="Mis pagos y deudas" icon={FileUp}>
            {hub.invoices.length === 0 ? (
              <p className="text-sm text-gray-500">Aún no hay períodos registrados.</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 pr-3">Período</th>
                      <th className="pb-2 pr-3">Vence</th>
                      <th className="pb-2 pr-3">Monto</th>
                      <th className="pb-2 pr-3">Estado</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {hub.invoices.map(inv => {
                      const payable = inv.status === 'pending' || inv.status === 'overdue'
                      const ui = INVOICE_STATUS_UI[inv.status] ?? {
                        label: inv.status,
                        className: 'bg-gray-100 text-gray-600',
                      }
                      return (
                        <tr key={inv.id} className="border-b border-gray-50">
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            {formatDate(inv.period_start)} → {formatDate(inv.period_end)}
                          </td>
                          <td className="py-2.5 pr-3 whitespace-nowrap">{formatDate(inv.due_date)}</td>
                          <td className="py-2.5 pr-3 font-semibold text-gray-900 tabular-nums">
                            {formatMoney(billingCyclePaymentTotal(inv, sub))}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ui.className}`}
                            >
                              {ui.label}
                            </span>
                          </td>
                          <td className="py-2.5 text-right">
                            {payable && sub.can_submit_payment && (
                              <button
                                type="button"
                                onClick={() => openPayModal(inv)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
                              >
                                <FileUp size={13} /> Pagar
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!sub.can_submit_payment && (
              <p className="text-sm text-red-700 mt-3">
                {sub.support_message ?? 'No puede enviar nuevos comprobantes.'}
              </p>
            )}
            {portalAlt && (
              <a
                href={portalAlt}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 mt-4 text-sm text-blue-600 hover:underline"
              >
                <ExternalLink size={14} /> Portal de pago alternativo
              </a>
            )}
          </Section>

          <Section id="historial-pagos" title="Historial de pagos" icon={CreditCard}>
            {hub.payments.length === 0 ? (
              <p className="text-sm text-gray-500">Sin pagos registrados.</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 pr-3">Fecha</th>
                      <th className="pb-2 pr-3">Monto</th>
                      <th className="pb-2 pr-3">Método</th>
                      <th className="pb-2 pr-3">Estado</th>
                      <th className="pb-2">Comprobante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hub.payments.map(p => (
                      <tr key={p.id} className="border-b border-gray-50">
                        <td className="py-2 pr-3">{formatDate(p.created_at)}</td>
                        <td className="py-2 pr-3">{formatMoney(p.amount)}</td>
                        <td className="py-2 pr-3">{p.payment_method}</td>
                        <td className="py-2 pr-3">
                          <span className="font-medium">{STATUS_LABELS[p.status] ?? p.status}</span>
                          {p.reject_reason && <p className="text-xs text-red-600 mt-0.5">{p.reject_reason}</p>}
                        </td>
                        {/* Boleta/factura que emiten por el pago. Solo aparece cuando la
                            adjuntan desde el panel central. */}
                        <td className="py-2">
                          {p.fiscal_doc_url ? (
                            <a
                              href={assetUrl(p.fiscal_doc_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary-600 hover:underline font-medium"
                            >
                              <Download size={14} /> Descargar
                            </a>
                          ) : (
                            <span className="text-xs text-gray-400">
                              {p.status === 'approved' ? 'Pendiente de emisión' : '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section id="historial-suscripcion" title="Historial de suscripción" icon={History}>
            {hub.events.length === 0 ? (
              <p className="text-sm text-gray-500">Sin eventos registrados.</p>
            ) : (
              <ul className="space-y-3">
                {hub.events.map(ev => (
                  <li key={ev.id} className="flex gap-3 text-sm">
                    <Clock size={16} className="text-gray-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-gray-800">{ev.label}</p>
                      <p className="text-xs text-gray-500">{formatDate(ev.created_at)}</p>
                      {ev.reason && <p className="text-xs text-gray-600 mt-0.5">{ev.reason}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4">
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Acciones rápidas</h3>
            <ul className="space-y-1">
              {quickLinks.map(link => (
                <li key={link.id}>
                  <button
                    type="button"
                    onClick={() => scrollTo(link.id)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50 text-left group"
                  >
                    <link.icon size={16} className="text-gray-400 group-hover:text-gray-600" />
                    <span className="flex-1 font-medium">{link.label}</span>
                    <ChevronRight size={14} className="text-gray-300" />
                  </button>
                </li>
              ))}
            </ul>
            {portalAlt && (
              <a
                href={portalAlt}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50"
              >
                <ExternalLink size={16} />
                Cambiar plan / portal
              </a>
            )}
          </div>

          <div id="metodos-pago" className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden scroll-mt-24">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <CreditCard size={16} className="text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-800">Métodos de pago</h3>
            </div>
            <div className="p-4 space-y-4">
              {(cfg.yape_qr_url || cfg.plin_qr_url) && (
                <div className="flex gap-3 flex-wrap justify-center">
                  {cfg.yape_qr_url && (
                    <PaymentQrImage label="Yape" path={cfg.yape_qr_url} />
                  )}
                  {cfg.plin_qr_url && (
                    <PaymentQrImage label="Plin" path={cfg.plin_qr_url} />
                  )}
                </div>
              )}
              <ul className="flex flex-wrap gap-1.5">
                {cfg.methods.map(m => (
                  <li key={m.key} className="px-2 py-0.5 rounded-md bg-gray-100 text-[11px] font-medium text-gray-700">
                    {m.label}
                  </li>
                ))}
              </ul>
              {cfg.bank_accounts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase flex items-center gap-1">
                    <Building2 size={12} /> Cuentas
                  </p>
                  {cfg.bank_accounts.map((b, i) => (
                    <div key={i} className="rounded-lg bg-gray-50 p-2.5 text-xs text-gray-700">
                      <p className="font-semibold">{b.bank}</p>
                      <p className="truncate">{b.account_number}</p>
                      {b.cci && <p className="text-gray-500">CCI: {b.cci}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Headphones size={14} />
              Soporte
            </h3>
            <SupportCard support={hub.support} />
          </div>
        </aside>
      </div>

      {/* El formulario solo aparece tras elegir la deuda con «Pagar»: antes estaba siempre
          visible con un select de períodos, que obligaba a entender la lista dos veces. */}
      <Modal open={Boolean(payInvoice)} onClose={() => setPayInvoice(null)} contentClassName="max-w-lg">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
          <div>
            <h3 className="font-bold text-gray-800">Pagar período</h3>
            {payInvoice && (
              <p className="text-xs text-gray-500 mt-0.5">
                {formatDate(payInvoice.period_start)} → {formatDate(payInvoice.period_end)} ·{' '}
                <span className="font-semibold text-gray-700">
                  {formatMoney(billingCyclePaymentTotal(payInvoice, sub))}
                </span>
                {sub.is_suspended || sub.tenant_status === 'suspended' ? ' (incl. reconexión)' : ''}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setPayInvoice(null)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600">Método</label>
              <select className={inputClass} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} required>
                {cfg.methods.map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Monto (S/)</label>
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600">Fecha de pago</label>
              <input
                type="date"
                className={inputClass}
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">Referencia / Nº operación</label>
              <input className={inputClass} value={reference} onChange={e => setReference(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600">Comprobante (imagen o PDF)</label>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,.webp"
              className="text-sm mt-1 block w-full"
              onChange={e => setReceipt(e.target.files?.[0] ?? null)}
              required
            />
          </div>
          <p className="text-xs text-gray-500">
            Si tu cuenta está suspendida, tras enviar podrás tener hasta 12 h de acceso provisional (1 vez por ciclo).
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPayInvoice(null)}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
              Enviar comprobante
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function PaymentQrImage({ label, path }: { label: string; path: string }) {
  const [failed, setFailed] = useState(false)
  const src = assetUrl(path)
  if (failed) {
    return (
      <div className="flex h-28 w-28 flex-col items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-2 text-center text-[10px] text-amber-800">
        <span className="font-semibold">{label}</span>
        <span className="mt-1">No se pudo cargar el QR</span>
        <span className="mt-0.5 break-all text-amber-700/80">{src}</span>
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={`QR ${label}`}
      className="h-28 rounded-lg border"
      onError={() => {
        setFailed(true)
        toast.error(`No se pudo cargar el QR de ${label}. Verifique que el API exponga /storage (Nginx → backend).`)
      }}
    />
  )
}
