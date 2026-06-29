import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { RefreshCw, Truck, Percent, Receipt, RotateCcw, Plus, Download, Eye, X, FileCode, Archive, Search } from 'lucide-react'
import { billingService, type SunatDespatch, type SunatRetention, type SunatPerception, type SunatReversion, type InvoiceInfo, type FiscalAuxListParams } from '@/services/billing.service'
import { FiscalAuxFiltersBar } from '@/components/billing/FiscalAuxFiltersBar'
import { SunatResponseDetail } from '@/components/billing/SunatResponseDetail'
import { FiscalAuxDocListSection } from '@/components/billing/FiscalAuxDocListSection'
import { ReversionCreateModal } from '@/components/billing/ReversionCreateModal'
import { companyService } from '@/services/company.service'
import RequireModule from '@/components/ui/RequireModule'
import SunatRequiredMessage from '@/components/ui/SunatRequiredMessage'
import { Modal } from '@/components/ui/Modal'
import { DocumentViewerModal } from '@/components/ui/DocumentViewerModal'
import { formatDisplayDatePeru } from '@/utils/datesPeru'
import { useBillingEvents } from '@/hooks/useBillingEvents'
import {
  billingStatusColor,
  billingStatusLabel,
  canShowCdr,
  canShowXmlGenerated,
  canShowXmlSent,
  normalizeBillingStatus,
} from '@/constants/billingStatus'

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

function despatchDocTypeLabel(docType?: string): string {
  const dt = String(docType ?? '').toUpperCase()
  if (dt.includes('TRANSPORT')) return 'Guía transportista (31)'
  if (dt.includes('GUIA')) return 'Guía remitente (09)'
  return 'Guía de remisión'
}

function despatchBillingStatus(d: SunatDespatch): string {
  return normalizeBillingStatus(d.billing_status || d.status)
}

type DocSubMode = 'despatches' | 'retentions' | 'perceptions' | 'reversions'

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
    docType === 'despatches' || docType === 'retentions' || docType === 'perceptions' || docType === 'reversions'
      ? docType
      : 'despatches'
  const [despatches, setDespatches] = useState<SunatDespatch[]>([])
  const [retentions, setRetentions] = useState<SunatRetention[]>([])
  const [perceptions, setPerceptions] = useState<SunatPerception[]>([])
  const [reversions, setReversions] = useState<SunatReversion[]>([])
  const [loading, setLoading] = useState(false)
  const [despatchStatusLoading, setDespatchStatusLoading] = useState<number | null>(null)
  const [reversionStatusLoading, setReversionStatusLoading] = useState<number | null>(null)
  const [auxFilters, setAuxFilters] = useState<FiscalAuxListParams>({})
  const navigateToPurchase = (purchaseId: number) => navigate('/purchases', { state: { openPurchaseId: purchaseId } })
  const navigateToSale = (saleId: number) => navigate('/billing', { state: { openSaleId: saleId } })
  const despatchesRef = useRef(despatches)
  despatchesRef.current = despatches

  const retentionsRef = useRef(retentions)
  retentionsRef.current = retentions
  const perceptionsRef = useRef(perceptions)
  perceptionsRef.current = perceptions

  useBillingEvents(
    (evt) => {
      if (subMode === 'despatches') {
        const d = despatchesRef.current.find((x) => x.sale_id === evt.sale_id)
        if (!d) return
        billingService.getDespatchStatus(d.id)
          .then((updated) => setDespatches((prev) => prev.map((x) => (x.id === updated.id ? updated : x))))
          .catch(() => {})
        return
      }
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
    sunatEnabled === true && (subMode === 'despatches' || subMode === 'retentions' || subMode === 'perceptions'),
  )

  const loadDespatches = () => {
    setLoading(true)
    billingService.listDespatches()
      .then(({ despatches: list }) => setDespatches(list ?? []))
      .catch(() => toast.error('Error al cargar guías'))
      .finally(() => setLoading(false))
  }
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
    if (subMode === 'despatches') loadDespatches()
    else if (subMode === 'retentions') loadRetentions()
    else if (subMode === 'perceptions') loadPerceptions()
    else if (subMode === 'reversions') loadReversions()
  }, [subMode, sunatEnabled])

  if (sunatEnabled === null) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
  if (!sunatEnabled) return <SunatRequiredMessage />

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">Guías de remisión, Retención, Percepción y Reversión</h2>
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'despatches' as DocSubMode, label: 'Guías de remisión', icon: Truck },
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

      {subMode === 'despatches' && (
        <GuiasSection
          list={despatches}
          loading={loading}
          onRefresh={loadDespatches}
          statusLoading={despatchStatusLoading}
          setStatusLoading={setDespatchStatusLoading}
          onStatusUpdated={d => setDespatches(prev => prev.map(x => x.id === d.id ? d : x))}
        />
      )}
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

function GuiasSection({
  list,
  loading,
  onRefresh,
  statusLoading,
  setStatusLoading,
  onStatusUpdated,
}: {
  list: SunatDespatch[]
  loading: boolean
  onRefresh: () => void
  statusLoading: number | null
  setStatusLoading: (id: number | null) => void
  onStatusUpdated?: (d: SunatDespatch) => void
}) {
  const navigate = useNavigate()
  const [detailDespatch, setDetailDespatch] = useState<SunatDespatch | null>(null)
  const [detailInvoice, setDetailInvoice] = useState<InvoiceInfo | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [documentViewerOpen, setDocumentViewerOpen] = useState(false)
  const [documentViewerUrl, setDocumentViewerUrl] = useState<string | null>(null)
  const [viewingPdfSaleId, setViewingPdfSaleId] = useState<number | null>(null)
  const [downloadingPdfSaleId, setDownloadingPdfSaleId] = useState<number | null>(null)
  const [downloadingDoc, setDownloadingDoc] = useState<{ saleId: number; type: 'xml' | 'xml-generated' | 'cdr' } | null>(null)
  const documentViewerUrlRef = useRef<string | null>(null)

  const closeDocumentViewer = () => {
    setDocumentViewerOpen(false)
    setDocumentViewerUrl(null)
    if (documentViewerUrlRef.current) {
      URL.revokeObjectURL(documentViewerUrlRef.current)
      documentViewerUrlRef.current = null
    }
  }

  const openPdfViewer = async (saleId: number) => {
    if (documentViewerUrlRef.current) {
      URL.revokeObjectURL(documentViewerUrlRef.current)
      documentViewerUrlRef.current = null
    }
    setViewingPdfSaleId(saleId)
    setDocumentViewerOpen(true)
    setDocumentViewerUrl(null)
    try {
      const url = await billingService.getPdfObjectUrl(saleId)
      documentViewerUrlRef.current = url
      setDocumentViewerUrl(url)
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Error al cargar PDF')
      setDocumentViewerOpen(false)
    } finally {
      setViewingPdfSaleId(null)
    }
  }

  const openDetail = (d: SunatDespatch) => {
    setDetailDespatch(d)
    setDetailInvoice(null)
    if (!d.sale_id) return
    setDetailLoading(true)
    billingService
      .getInvoice(d.sale_id)
      .then((inv) => setDetailInvoice(inv))
      .catch(() => setDetailInvoice(null))
      .finally(() => setDetailLoading(false))
  }

  const refreshStatus = (d: SunatDespatch) => {
    setStatusLoading(d.id)
    billingService.getDespatchStatus(d.id)
      .then(updated => onStatusUpdated?.(updated))
      .catch(() => toast.error('Error al consultar estado'))
      .finally(() => setStatusLoading(null))
  }

  const colCount = 9

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
        <h3 className="font-semibold text-gray-800">Guías de remisión</h3>
        <div className="flex gap-2">
          <button type="button" onClick={onRefresh} disabled={loading} className="p-2 text-gray-500 hover:text-gray-700" title="Actualizar lista">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={() => navigate('/billing/docs/despatches/new')} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
            <Plus size={14} /> Nueva guía
          </button>
          <button type="button" onClick={() => navigate('/billing/docs/despatches/new?tipo=31')} className="flex items-center gap-1.5 px-3 py-2 border border-blue-200 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-50" title="Guía transportista GRE 31">
            <Truck size={14} /> Guía 31
          </button>
        </div>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Fecha', 'Guía', 'Destinatario', 'Ítems', 'Estado SUNAT', 'PDF', 'XML', 'CDR', 'Acciones'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colCount} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={colCount} className="px-4 py-8 text-center text-gray-400">Sin guías.</td></tr>
            ) : list.map(d => {
              const bs = despatchBillingStatus(d)
              const saleId = d.sale_id
              const showXmlSigned = !!saleId && canShowXmlSent(bs)
              const showXmlGenerated = !!saleId && canShowXmlGenerated(bs)
              const showCdr = !!saleId && canShowCdr(bs)
              const showPdf = !!saleId && (showXmlSigned || showXmlGenerated)
              return (
                <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDisplayDatePeru(d.issue_date)}</td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-gray-400">{despatchDocTypeLabel(d.doc_type)}</p>
                    <p className="font-mono font-bold text-gray-800">{d.series}-{d.correlative}</p>
                    {d.ticket && (
                      <p className="text-[10px] text-gray-400 truncate max-w-[140px]" title={d.ticket}>
                        Ticket: {d.ticket.slice(0, 12)}…
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-800">{d.destinatario_razon ?? '—'}</div>
                    {d.destinatario_ruc && <div className="text-xs text-gray-500 font-mono">{d.destinatario_ruc}</div>}
                    {d.sunat_code && (
                      <div className="text-xs text-red-600 mt-0.5" title={d.sunat_message}>
                        SUNAT {d.sunat_code}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{d.details_count ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${billingStatusColor(bs)}`}>
                      {billingStatusLabel(bs)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {showPdf ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={viewingPdfSaleId === saleId}
                          onClick={() => void openPdfViewer(saleId!)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                          title="Ver PDF"
                        >
                          {viewingPdfSaleId === saleId ? <RefreshCw size={14} className="animate-spin" /> : <Eye size={14} />}
                        </button>
                        <button
                          type="button"
                          disabled={downloadingPdfSaleId === saleId}
                          onClick={() => {
                            setDownloadingPdfSaleId(saleId!)
                            billingService.downloadDocument(saleId!, 'pdf')
                              .catch(e => toast.error(e?.message ?? 'Error al descargar'))
                              .finally(() => setDownloadingPdfSaleId(null))
                          }}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                          title="Descargar PDF"
                        >
                          {downloadingPdfSaleId === saleId ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {showXmlSigned || showXmlGenerated ? (
                      <div className="flex items-center gap-1">
                        {showXmlSigned && (
                          <button
                            type="button"
                            disabled={downloadingDoc?.saleId === saleId && downloadingDoc?.type === 'xml'}
                            onClick={() => {
                              setDownloadingDoc({ saleId: saleId!, type: 'xml' })
                              billingService.downloadDocument(saleId!, 'xml')
                                .catch(e => toast.error(e?.message ?? 'Error al descargar'))
                                .finally(() => setDownloadingDoc(null))
                            }}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg"
                            title="XML firmado enviado a SUNAT"
                          >
                            {(downloadingDoc?.saleId === saleId && downloadingDoc?.type === 'xml') ? (
                              <RefreshCw size={14} className="animate-spin" />
                            ) : (
                              <FileCode size={14} />
                            )}
                          </button>
                        )}
                        {showXmlGenerated && (
                          <button
                            type="button"
                            disabled={downloadingDoc?.saleId === saleId && downloadingDoc?.type === 'xml-generated'}
                            onClick={() => {
                              setDownloadingDoc({ saleId: saleId!, type: 'xml-generated' })
                              billingService.downloadDocument(saleId!, 'xml-generated')
                                .catch(e => toast.error(e?.message ?? 'Error al descargar'))
                                .finally(() => setDownloadingDoc(null))
                            }}
                            className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg"
                            title="XML generado (vista previa)"
                          >
                            {(downloadingDoc?.saleId === saleId && downloadingDoc?.type === 'xml-generated') ? (
                              <RefreshCw size={14} className="animate-spin" />
                            ) : (
                              <Download size={14} />
                            )}
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {showCdr ? (
                      <button
                        type="button"
                        disabled={downloadingDoc?.saleId === saleId && downloadingDoc?.type === 'cdr'}
                        onClick={() => {
                          setDownloadingDoc({ saleId: saleId!, type: 'cdr' })
                          billingService.downloadDocument(saleId!, 'cdr')
                            .catch(e => toast.error(e?.message ?? 'Error al descargar'))
                            .finally(() => setDownloadingDoc(null))
                        }}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Descargar CDR"
                      >
                        {(downloadingDoc?.saleId === saleId && downloadingDoc?.type === 'cdr') ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <Archive size={14} />
                        )}
                      </button>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => openDetail(d)}
                        className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 inline-flex items-center gap-1"
                        title="Ver detalle SUNAT"
                      >
                        <Search size={12} /> Detalle
                      </button>
                      <button
                        type="button"
                        onClick={() => refreshStatus(d)}
                        disabled={statusLoading === d.id}
                        className="text-xs px-2 py-1 rounded-lg bg-blue-100 text-blue-800 hover:bg-blue-200"
                      >
                        {statusLoading === d.id ? '…' : 'Estado'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal open={detailDespatch != null} onClose={() => setDetailDespatch(null)} contentClassName="max-w-lg">
        {detailDespatch && (
          <>
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div>
                <h3 className="font-bold text-gray-800">
                  {detailDespatch.series}-{detailDespatch.correlative}
                </h3>
                <p className="text-xs text-gray-500">{despatchDocTypeLabel(detailDespatch.doc_type)}</p>
              </div>
              <button type="button" onClick={() => setDetailDespatch(null)} className="p-2 rounded-lg hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
              <div>
                <dt className="text-xs text-gray-500">Fecha emisión</dt>
                <dd>{formatDisplayDatePeru(detailDespatch.issue_date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Estado</dt>
                <dd>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${billingStatusColor(despatchBillingStatus(detailDespatch))}`}>
                    {billingStatusLabel(despatchBillingStatus(detailDespatch))}
                  </span>
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-gray-500">Destinatario</dt>
                <dd>{detailDespatch.destinatario_razon ?? '—'} {detailDespatch.destinatario_ruc ? `(${detailDespatch.destinatario_ruc})` : ''}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Ítems</dt>
                <dd>{detailDespatch.details_count ?? 0}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Ticket GRE</dt>
                <dd className="font-mono text-xs break-all">{detailDespatch.ticket ?? '—'}</dd>
              </div>
              {detailDespatch.sunat_code && (
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500">Código SUNAT</dt>
                  <dd className="font-mono">{detailDespatch.sunat_code}</dd>
                </div>
              )}
            </dl>
            {detailLoading ? (
              <p className="text-sm text-gray-400">Cargando respuesta fiscal…</p>
            ) : (
              <SunatResponseDetail
                billingStatus={despatchBillingStatus(detailDespatch)}
                invoice={detailInvoice}
                statusLabel={billingStatusLabel(despatchBillingStatus(detailDespatch))}
                statusColorClass={billingStatusColor(despatchBillingStatus(detailDespatch))}
              />
            )}
            {detailDespatch.sale_id && (
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => void openPdfViewer(detailDespatch.sale_id!)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100"
                >
                  Ver PDF
                </button>
                {canShowXmlSent(despatchBillingStatus(detailDespatch)) && (
                  <button
                    type="button"
                    onClick={() => billingService.downloadDocument(detailDespatch.sale_id!, 'xml').catch(e => toast.error(e.message))}
                    className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100"
                  >
                    Descargar XML
                  </button>
                )}
                {canShowCdr(despatchBillingStatus(detailDespatch)) && (
                  <button
                    type="button"
                    onClick={() => billingService.downloadDocument(detailDespatch.sale_id!, 'cdr').catch(e => toast.error(e.message))}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-800 hover:bg-blue-100"
                  >
                    Descargar CDR
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </Modal>

      <DocumentViewerModal
        open={documentViewerOpen}
        onClose={closeDocumentViewer}
        src={documentViewerUrl}
        title="Guía de remisión (PDF)"
      />
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
