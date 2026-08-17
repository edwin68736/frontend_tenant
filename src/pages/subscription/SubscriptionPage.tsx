import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  Download,
  CreditCard,
  ExternalLink,
  FileText,
  FileUp,
  Headphones,
  History,
  Info,
  Loader2,
  Mail,
  MessageCircle,
  Package,
  Phone,
  RefreshCw,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import PlanPickerModal from '@/components/PlanPickerModal'
import { useSubscriptionStatus } from '@/contexts/SubscriptionStatusContext'
import {
  assetUrl,
  subscriptionService,
  type BillingHub,
  type BillingInvoice,
  type SupportConfig,
} from '@/services/subscription.service'
import PlanDetailFrame from './PlanDetailFrame'
import PendingPaymentBanner from './PendingPaymentBanner'
import PaymentMethodsPanel from './PaymentMethodsPanel'
import {
  STATUS_LABELS,
  billingCyclePaymentTotal,
  docProgressColor,
  formatDate,
  formatMoney,
  invoiceStatusUI,
  isInvoicePayableNow,
} from './subscriptionUx'

const inputClass =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white'

/** Filas que se muestran de entrada en listas largas antes de «Ver historial completo». */
const PREVIEW_ROWS = 5

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

/** Icono y color de marca de cada canal — antes todos usaban el mismo audífono gris y no se
 *  distinguían entre sí a simple vista. */
const SUPPORT_CHANNELS: Record<string, { icon: React.ElementType; iconClass: string }> = {
  WhatsApp: { icon: MessageCircle, iconClass: 'bg-emerald-100 text-emerald-600' },
  Email: { icon: Mail, iconClass: 'bg-blue-100 text-blue-600' },
  Teléfono: { icon: Phone, iconClass: 'bg-indigo-100 text-indigo-600' },
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
    <ul className="space-y-1">
      {links.map(l => {
        const channel = SUPPORT_CHANNELS[l.label]
        const Icon = channel?.icon ?? Headphones
        return (
          <li key={l.label}>
            <a
              href={l.href}
              target={l.label === 'WhatsApp' ? '_blank' : undefined}
              rel="noreferrer"
              className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className={`p-2 rounded-lg shrink-0 ${channel?.iconClass ?? 'bg-gray-100 text-gray-500'}`}>
                <Icon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{l.label}</span>
                <span className="block text-xs text-gray-500 truncate">{l.text}</span>
              </span>
              <ChevronRight size={14} className="text-gray-300 shrink-0" />
            </a>
          </li>
        )
      })}
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
  const [pickerOpen, setPickerOpen] = useState(false)
  /** Listas largas empiezan colapsadas (ver PREVIEW_ROWS): «Ver historial completo» las abre. */
  const [showAllInvoices, setShowAllInvoices] = useState(false)
  const [showAllEvents, setShowAllEvents] = useState(false)

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

  // Deuda cobrable HOY (vencida, o pendiente cuyo plazo ya llegó): es lo que arma la barra de
  // acción prominente. Un cobro emitido por adelantado para el próximo período no cuenta acá
  // (ese es "por vencer", su acción es "Renovar ahora" en el resumen del plan, no esta barra).
  const payableNowInvoices = useMemo(
    () => hub?.invoices.filter(isInvoicePayableNow) ?? [],
    [hub],
  )

  // «Renovar ahora» / «Cambiar de plan» abren el mismo modal: si la suscripción está activa y
  // el plan sigue en el catálogo, PlanPickerModal lo detecta solo y salta directo a «Adelantar
  // pago» (sin pasar por la grilla) — es el camino correcto tanto si ya existe un cobro emitido
  // para el próximo período como si aún no existe ninguno (ahí no hay billing_cycle_id que
  // pagar: se envía como solicitud de renovación, ver SubmitRenewalRequest en el backend).
  const handleManagePlan = () => setPickerOpen(true)

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

  return (
    // El tope de 1280px dejaba media pantalla en blanco a los costados en monitores anchos.
    // 1600 aprovecha el espacio sin que las líneas de texto se vuelvan incómodas de leer.
    <div className="w-full max-w-[1600px] mx-auto space-y-4 pb-10 px-1 sm:px-0">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Suscripción</h1>
          <p className="text-sm text-gray-500 mt-0.5">Pagos, plan y documentos electrónicos</p>
        </div>
        {/* El botón «Gestionar plan» de acá duplicaba, con otro nombre, la misma acción que ya
            ofrecen «Renovar ahora» (resumen del plan) y «Cambiar de plan» (junto al ciclo, ahí
            mismo): dos entradas al mismo modal ya alcanzan, una tercera en el encabezado solo
            sumaba confusión sobre cuál usar. */}
        <button
          type="button"
          onClick={() => {
            void load()
            void refreshGlobal()
          }}
          className="p-2 rounded-xl border hover:bg-gray-50 shrink-0"
          title="Actualizar"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <PlanDetailFrame hub={hub} onManagePlan={handleManagePlan} />

      {/* Lo más urgente de la página, justo debajo del resumen: si hay deuda cobrable hoy, se
          ve sin tener que bajar a la tabla. */}
      <PendingPaymentBanner hub={hub} invoices={payableNowInvoices} onPay={openPayModal} />

      {/* La columna de referencia (cómo pagar, soporte) acompaña al contenido en pantallas
          anchas y pasa debajo en las estrechas. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {/* Primera del contenido: es la sección que el tenant más necesita — saber qué debe
              y poder pagarlo — no algo a lo que hay que bajar. */}
          <Section id="mis-pagos" title="Mis pagos y deudas" icon={FileUp}>
            {/* Esta tabla lista deudas ya emitidas (saas_billing_cycles), no cada intento de
                pago — una solicitud de renovación anticipada sin ciclo previo (ver
                PlanPickerModal) no genera una deuda hasta que se aprueba, así que mientras está
                en revisión no hay fila que mostrar acá. Sin este aviso, un comprobante recién
                enviado parecía haberse perdido: el banner de arriba avisa "en revisión" pero
                esta tabla seguía exactamente igual que antes de enviarlo. */}
            {sub.has_pending_payment_review && (
              <p className="text-sm text-blue-700 bg-blue-50/70 border border-blue-100 rounded-xl px-3 py-2.5 mb-4 flex items-start gap-2">
                <Info size={16} className="shrink-0 mt-0.5" />
                Tu comprobante está en revisión — el nuevo período aparecerá aquí recién cuando se
                apruebe. Puedes ver el envío en «Historial de pagos», más abajo.
              </p>
            )}
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
                    {(showAllInvoices ? hub.invoices : hub.invoices.slice(0, PREVIEW_ROWS)).map(inv => {
                      const payableNow = isInvoicePayableNow(inv)
                      const ui = invoiceStatusUI(inv)
                      return (
                        <tr key={inv.id} className={`border-b border-gray-50 ${payableNow ? 'bg-amber-50/60' : ''}`}>
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            {formatDate(inv.period_start)} → {formatDate(inv.period_end)}
                          </td>
                          <td className="py-2.5 pr-3 whitespace-nowrap">{formatDate(inv.due_date)}</td>
                          <td className="py-2.5 pr-3 font-semibold text-gray-900 tabular-nums">
                            {formatMoney(billingCyclePaymentTotal(inv, sub))}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ui.className}`}
                              >
                                {ui.label}
                              </span>
                              {/* Comprobante del PERÍODO, no del pago: si tuvo un intento
                                  rechazado antes del que finalmente lo pagó, esto siempre
                                  apunta al pago que realmente lo saldó. */}
                              {inv.status === 'paid' && inv.fiscal_doc_url && (
                                <a
                                  href={assetUrl(inv.fiscal_doc_url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline font-medium"
                                  title="Descargar comprobante"
                                >
                                  <Download size={12} /> Descargar
                                </a>
                              )}
                            </span>
                          </td>
                          <td className="py-2.5 text-right">
                            {payableNow && sub.can_submit_payment && (
                              <button
                                type="button"
                                onClick={() => openPayModal(inv)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
                              >
                                <FileUp size={13} /> Pagar ahora
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
            {hub.invoices.length > PREVIEW_ROWS && (
              <button
                type="button"
                onClick={() => setShowAllInvoices(v => !v)}
                className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-primary-600 hover:underline"
              >
                {showAllInvoices ? 'Ver menos' : 'Ver historial completo'}
                <ChevronRight size={14} className={showAllInvoices ? '-rotate-90 transition-transform' : 'transition-transform'} />
              </button>
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

          {hub.documents && (
            <Section title="Documentos electrónicos" icon={FileText}>
              {hub.documents.is_unlimited ? (
                <p className="text-sm text-emerald-700 font-medium">Tu plan incluye documentos electrónicos ilimitados.</p>
              ) : (
                <>
                  <div className="flex items-end justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500">Uso del cupo mensual del plan</p>
                      {hub.documents.quota_period_index && hub.documents.quota_period_total ? (
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Mes {hub.documents.quota_period_index} de {hub.documents.quota_period_total} de tu suscripción
                        </p>
                      ) : null}
                    </div>
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
                      { label: 'Cupo del mes', value: hub.documents.plan_limit, sub: `${hub.documents.plan_remaining} restantes` },
                      { label: 'Usados', value: hub.documents.plan_used, sub: 'este mes' },
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
                  {/* Dos fechas distintas y fáciles de confundir: el cupo del plan se
                      renueva cada mes, mientras que los paquetes comprados duran hasta
                      que vence la suscripción. */}
                  <div className="mt-2 space-y-0.5">
                    {hub.documents.quota_period_end && (
                      <p className="text-xs text-gray-600">
                        Tu cupo de {hub.documents.plan_limit} documentos se renueva el{' '}
                        <span className="font-semibold">{formatDate(hub.documents.quota_period_end)}</span>.
                      </p>
                    )}
                    {hub.documents.billing_cycle_end && (
                      <p className="text-xs text-gray-500">
                        Los paquetes adicionales vencen al terminar tu suscripción ({formatDate(hub.documents.billing_cycle_end)}).
                      </p>
                    )}
                  </div>
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
                      <th className="pb-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* El comprobante (boleta/factura) ya no va acá: es del PERÍODO que un pago
                        saldó, no del intento de pago en sí — un período puede tener varios
                        intentos (rechazados, anulados) antes del que lo pagó de verdad. Vive en
                        «Mis pagos y deudas», junto al estado de cada período. */}
                    {hub.payments.map(p => (
                      <tr key={p.id} className="border-b border-gray-50">
                        <td className="py-2 pr-3">{formatDate(p.created_at)}</td>
                        <td className="py-2 pr-3">{formatMoney(p.amount)}</td>
                        <td className="py-2 pr-3">{p.payment_method}</td>
                        <td className="py-2">
                          <span className="font-medium">{STATUS_LABELS[p.status] ?? p.status}</span>
                          {p.reject_reason && <p className="text-xs text-red-600 mt-0.5">{p.reject_reason}</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4">
          {/* La lista plana de nombres de métodos no llevaba a ningún lado (ni QR ni cuenta):
              el QR/cuenta real de cada uno solo aparece al elegirlo en el formulario de pago.
              Se quitó en vez de arreglarla — ya está esa referencia en el momento en que
              hace falta, no acá donde no hacía nada. */}
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Headphones size={14} />
              Soporte y ayuda
            </h3>
            <SupportCard support={hub.support} />
          </div>

          {/* Es auditoría, no algo que se consulte para decidir un pago — por eso va al final
              de la barra lateral, compacto, en vez de competir por espacio en la columna
              principal junto a las tablas de pagos. */}
          <div id="historial-suscripcion" className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 scroll-mt-24">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <History size={14} />
              Historial de suscripción
            </h3>
            {hub.events.length === 0 ? (
              <p className="text-sm text-gray-500">Sin eventos registrados.</p>
            ) : (
              <>
                <ul className="space-y-3">
                  {(showAllEvents ? hub.events : hub.events.slice(0, PREVIEW_ROWS)).map((ev, i) => (
                    <li key={ev.id} className="flex gap-2.5 text-sm">
                      <span className="relative shrink-0 mt-0.5">
                        <Clock size={14} className="text-gray-400" />
                        {i === 0 && (
                          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium text-gray-800 text-xs">{ev.label}</p>
                          {i === 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                              Actual
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500">{formatDate(ev.created_at)}</p>
                        {ev.reason && <p className="text-[11px] text-gray-600 mt-0.5">{ev.reason}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
                {hub.events.length > PREVIEW_ROWS && (
                  <button
                    type="button"
                    onClick={() => setShowAllEvents(v => !v)}
                    className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-primary-600 hover:underline"
                  >
                    {showAllEvents ? 'Ver menos' : 'Ver historial completo'}
                    <ChevronRight size={12} className={showAllEvents ? '-rotate-90 transition-transform' : 'transition-transform'} />
                  </button>
                )}
              </>
            )}
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

          {paymentMethod && <PaymentMethodsPanel cfg={cfg} selectedMethodKey={paymentMethod} />}

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

      <PlanPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  )
}

