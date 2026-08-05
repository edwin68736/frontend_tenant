import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { RefreshCw, Percent, Receipt, RotateCcw, Plus } from 'lucide-react'
import { billingService, type SunatRetention, type SunatPerception, type SunatReversion, type FiscalAuxListParams } from '@/services/billing.service'
import { FiscalAuxFiltersBar } from '@/components/billing/FiscalAuxFiltersBar'
import { FiscalAuxDocListSection } from '@/components/billing/FiscalAuxDocListSection'
import { ReversionCreateModal } from '@/components/billing/ReversionCreateModal'
import { companyService } from '@/services/company.service'
import RequireModule from '@/components/ui/RequireModule'
import SunatRequiredMessage from '@/components/ui/SunatRequiredMessage'
import { useBillingEvents } from '@/hooks/useBillingEvents'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
  error: 'bg-orange-100 text-orange-700',
}
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  sent: 'Enviado',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  error: 'Error',
}

// Guías de remisión: vistas independientes en /billing/docs/despatches/(remitente|transportista)
// — antes vivían aquí como una pestaña más, mezclando 09 y 31 en una sola tabla.
type DocSubMode = 'retentions' | 'perceptions' | 'reversions'

export default function SunatDocsPage() {
  return (
    <RequireModule moduleKey="billing">
      <SunatDocsContent />
    </RequireModule>
  )
}

function SunatDocsContent() {
  const { docType } = useParams<{ docType: string }>()
  const navigate = useNavigate()
  const [sunatEnabled, setSunatEnabled] = useState<boolean | null>(null)
  const subMode: DocSubMode =
    docType === 'retentions' || docType === 'perceptions' || docType === 'reversions'
      ? docType
      : 'retentions'
  const [retentions, setRetentions] = useState<SunatRetention[]>([])
  const [perceptions, setPerceptions] = useState<SunatPerception[]>([])
  const [reversions, setReversions] = useState<SunatReversion[]>([])
  const [loading, setLoading] = useState(false)
  const [reversionStatusLoading, setReversionStatusLoading] = useState<number | null>(null)
  const [auxFilters, setAuxFilters] = useState<FiscalAuxListParams>({})
  const navigateToPurchase = (purchaseId: number) => navigate('/purchases', { state: { openPurchaseId: purchaseId } })
  const navigateToSale = (saleId: number) => navigate('/billing', { state: { openSaleId: saleId } })

  const retentionsRef = useRef(retentions)
  retentionsRef.current = retentions
  const perceptionsRef = useRef(perceptions)
  perceptionsRef.current = perceptions

  useBillingEvents(
    (evt) => {
      if (subMode === 'retentions') {
        const r = retentionsRef.current.find((x) => x.sale_id === evt.sale_id)
        if (!r) return
        billingService.getRetentionStatus(r.id)
          .then((updated) => setRetentions((prev) => prev.map((x) => (x.id === updated.id ? updated : x))))
          .catch(() => {})
        return
      }
      if (subMode === 'perceptions') {
        const p = perceptionsRef.current.find((x) => x.sale_id === evt.sale_id)
        if (!p) return
        billingService.getPerceptionStatus(p.id)
          .then((updated) => setPerceptions((prev) => prev.map((x) => (x.id === updated.id ? updated : x))))
          .catch(() => {})
      }
    },
    sunatEnabled === true && (subMode === 'retentions' || subMode === 'perceptions'),
  )

  const loadRetentions = () => {
    setLoading(true)
    billingService.listRetentions(auxFilters)
      .then(({ retentions: list }) => setRetentions(list ?? []))
      .catch(() => toast.error('Error al cargar retenciones'))
      .finally(() => setLoading(false))
  }
  const loadPerceptions = () => {
    setLoading(true)
    billingService.listPerceptions(auxFilters)
      .then(({ perceptions: list }) => setPerceptions(list ?? []))
      .catch(() => toast.error('Error al cargar percepciones'))
      .finally(() => setLoading(false))
  }
  const loadReversions = () => {
    setLoading(true)
    billingService.listReversions(auxFilters)
      .then(({ reversions: list }) => setReversions(list ?? []))
      .catch(() => toast.error('Error al cargar reversiones'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    companyService.getSunat().then(d => setSunatEnabled(d.sunat_enabled ?? false)).catch(() => setSunatEnabled(false))
  }, [])

  useEffect(() => {
    if (sunatEnabled !== true) return
    if (subMode === 'retentions') loadRetentions()
    else if (subMode === 'perceptions') loadPerceptions()
    else if (subMode === 'reversions') loadReversions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subMode, sunatEnabled])

  if (sunatEnabled === null) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
  if (!sunatEnabled) return <SunatRequiredMessage />

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">Retención, Percepción y Reversión</h2>
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'retentions' as DocSubMode, label: 'Retenciones', icon: Percent },
          { key: 'perceptions' as DocSubMode, label: 'Percepciones', icon: Receipt },
          { key: 'reversions' as DocSubMode, label: 'Reversiones', icon: RotateCcw },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => navigate(`/billing/docs/${key}`)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium ${subMode === key ? 'bg-[rgb(var(--p600))] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-[rgb(var(--p300))]'}`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {subMode === 'retentions' && (
        <>
          <FiscalAuxFiltersBar filters={auxFilters} onChange={setAuxFilters} onSearch={loadRetentions} />
          <FiscalAuxDocListSection
            kind="retention"
            list={retentions}
            loading={loading}
            onRefresh={loadRetentions}
            onCreated={(r) => setRetentions((prev) => [r as SunatRetention, ...prev])}
            onStatusUpdated={(r) => setRetentions((prev) => prev.map((x) => (x.id === r.id ? r as SunatRetention : x)))}
            onNavigateToPurchase={navigateToPurchase}
          />
        </>
      )}
      {subMode === 'perceptions' && (
        <>
          <FiscalAuxFiltersBar filters={auxFilters} onChange={setAuxFilters} onSearch={loadPerceptions} />
          <FiscalAuxDocListSection
            kind="perception"
            list={perceptions}
            loading={loading}
            onRefresh={loadPerceptions}
            onCreated={(p) => setPerceptions((prev) => [p as SunatPerception, ...prev])}
            onStatusUpdated={(p) => setPerceptions((prev) => prev.map((x) => (x.id === p.id ? p as SunatPerception : x)))}
            onNavigateToSale={navigateToSale}
          />
        </>
      )}
      {subMode === 'reversions' && (
        <>
          <FiscalAuxFiltersBar filters={auxFilters} onChange={setAuxFilters} onSearch={loadReversions} showBillingStatus={false} />
          <ReversionsSection
            list={reversions}
            loading={loading}
            onRefresh={loadReversions}
            statusLoading={reversionStatusLoading}
            setStatusLoading={setReversionStatusLoading}
            onCreated={r => setReversions(prev => [r, ...prev])}
            onStatusUpdated={r => setReversions(prev => prev.map(x => x.id === r.id ? r : x))}
          />
        </>
      )}
    </div>
  )
}

function revertedDocTypeLabel(tipo: string) {
  if (tipo === '20') return 'CRE'
  if (tipo === '40') return 'CPE'
  return tipo
}

function ReversionsSection({
  list,
  loading,
  onRefresh,
  statusLoading,
  setStatusLoading,
  onCreated,
  onStatusUpdated,
}: {
  list: SunatReversion[]
  loading: boolean
  onRefresh: () => void
  statusLoading: number | null
  setStatusLoading: (id: number | null) => void
  onCreated: (r: SunatReversion) => void
  onStatusUpdated?: (r: SunatReversion) => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b flex justify-between">
        <h3 className="font-semibold">Comunicaciones de reversión</h3>
        <div className="flex gap-2">
          <button onClick={onRefresh} disabled={loading} className="p-2"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-medium"><Plus size={14} /> Nueva reversión</button>
        </div>
      </div>
      <table className="w-full text-sm min-w-[720px]">
        <thead className="bg-gray-50"><tr>{['Fecha', 'Correlativo', 'Comprobantes revertidos', 'Ticket', 'Estado', 'Acción'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center">Cargando...</td></tr> : list.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin reversiones.</td></tr> : list.map(r => (
            <tr key={r.id} className="border-b border-gray-50">
              <td className="px-4 py-3">{new Date(r.fec_comunicacion).toLocaleString()}</td>
              <td className="px-4 py-3 font-mono">{r.correlativo}</td>
              <td className="px-4 py-3 text-xs space-y-1">
                {(r.details ?? []).length === 0 ? '—' : (r.details ?? []).map((d, i) => (
                  <div key={i} className="font-mono">
                    {revertedDocTypeLabel(d.tipo_doc)} {d.serie}-{d.correlativo}
                    {d.motivo && <span className="block text-gray-500 font-sans">{d.motivo}</span>}
                  </div>
                ))}
              </td>
              <td className="px-4 py-3 text-xs">{r.ticket ?? '—'}</td>
              <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] ?? ''}`}>{STATUS_LABELS[r.status] ?? r.status}</span></td>
              <td className="px-4 py-3">
                {r.ticket && <button onClick={() => { setStatusLoading(r.id); billingService.getReversionStatus(r.id).then(updated => { onStatusUpdated?.(updated); setStatusLoading(null) }).catch(() => setStatusLoading(null)) }} disabled={statusLoading === r.id} className="text-xs px-2 py-1 rounded-lg bg-blue-100 text-blue-800">Consultar estado</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ReversionCreateModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={onCreated} />
    </div>
  )
}
