import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { History, Loader2, Package, Receipt, RefreshCw } from 'lucide-react'
import PlanPickerModal from '@/components/PlanPickerModal'
import { useSubscriptionStatus } from '@/contexts/SubscriptionStatusContext'
import { subscriptionService, type BillingHub, type BillingInvoice, type DocumentPackageCatalog } from '@/services/subscription.service'
import { bannerClass, isInvoicePayableNow } from './subscriptionUx'
import CurrentSubscriptionCard from './CurrentSubscriptionCard'
import SubscriptionSupportAside from './SubscriptionSupportAside'
import PendingPaymentBanner from './PendingPaymentBanner'
import BillingTab from './BillingTab'
import PlansPackagesTab from './PlansPackagesTab'
import HistoryTab from './HistoryTab'
import PaymentModal from './PaymentModal'
import PackagePurchaseModal from './PackagePurchaseModal'

type TabId = 'facturacion' | 'planes' | 'historial'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'facturacion', label: 'Facturación', icon: Receipt },
  { id: 'planes', label: 'Planes y paquetes', icon: Package },
  { id: 'historial', label: 'Historial', icon: History },
]

const TAB_ACTIVE_CLASS: Record<TabId, string> = {
  facturacion: 'bg-blue-600 text-white shadow-sm shadow-blue-600/25',
  planes: 'bg-primary-600 text-white shadow-sm shadow-primary-600/25',
  historial: 'bg-amber-500 text-white shadow-sm shadow-amber-500/25',
}

export default function SubscriptionPage() {
  const { setHub: setGlobalHub, refresh: refreshGlobal } = useSubscriptionStatus()
  const [hub, setHub] = useState<BillingHub | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('facturacion')
  const [payInvoice, setPayInvoice] = useState<BillingInvoice | null>(null)
  const [buyPackage, setBuyPackage] = useState<DocumentPackageCatalog | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await subscriptionService.getHub()
      setHub(data)
      setGlobalHub(data)
    } catch {
      toast.error('No se pudo cargar la suscripción')
    } finally {
      setLoading(false)
    }
  }, [setGlobalHub])

  useEffect(() => {
    void load()
  }, [load])

  const handleHubUpdate = (next?: BillingHub) => {
    if (next) {
      setHub(next)
      setGlobalHub(next)
    } else void load()
  }

  // Deuda cobrable HOY (pending/overdue): es lo que arma la barra de acción prominente.
  // pending_review no cuenta acá — ya tiene un comprobante esperando aprobación.
  const payableNowInvoices = useMemo(() => hub?.invoices.filter(isInvoicePayableNow) ?? [], [hub])

  if (loading || !hub) {
    return (
      <div className="flex justify-center py-20 text-gray-500 gap-2">
        <Loader2 className="animate-spin" size={22} />
        Cargando suscripción…
      </div>
    )
  }

  const showBanner = hub.billing_context?.show_status_banner && hub.status_banner?.message

  return (
    // El tope de 1280px dejaba media pantalla en blanco a los costados en monitores anchos.
    // 1600 aprovecha el espacio sin que las líneas de texto se vuelvan incómodas de leer.
    <div className="w-full max-w-[1600px] mx-auto space-y-4 pb-10 px-1 sm:px-0">
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
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 shrink-0"
          title="Actualizar"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {showBanner ? (
        <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${bannerClass(hub.status_banner.variant)}`}>
          {hub.status_banner.message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_10.75rem] gap-3 items-stretch">
        <CurrentSubscriptionCard hub={hub} />
        <SubscriptionSupportAside support={hub.support} />
      </div>

      {/* Lo más urgente de la página, justo debajo del resumen: si hay deuda cobrable hoy, se
          ve sin tener que entrar a la pestaña "Facturación". */}
      <PendingPaymentBanner hub={hub} invoices={payableNowInvoices} onPay={inv => setPayInvoice(inv)} />

      <div className="flex gap-1 p-1 rounded-xl bg-gray-100/90 border border-gray-100 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[7.5rem] inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                active ? TAB_ACTIVE_CLASS[tab.id] : 'text-gray-600 hover:bg-white/60 hover:text-gray-800'
              }`}
            >
              <Icon size={16} className={active ? 'text-white' : 'text-gray-400'} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'facturacion' && <BillingTab hub={hub} onPay={inv => setPayInvoice(inv)} />}

      {activeTab === 'planes' && (
        <PlansPackagesTab hub={hub} onBuyPackage={pkg => setBuyPackage(pkg)} onRenew={() => setPickerOpen(true)} />
      )}

      {activeTab === 'historial' && <HistoryTab hub={hub} />}

      <PaymentModal
        open={payInvoice != null}
        onClose={() => setPayInvoice(null)}
        hub={hub}
        invoice={payInvoice}
        onSuccess={handleHubUpdate}
      />

      <PackagePurchaseModal
        open={buyPackage != null}
        onClose={() => setBuyPackage(null)}
        pkg={buyPackage}
        cfg={hub.payment_config}
        onSuccess={() => void load()}
      />

      <PlanPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  )
}
