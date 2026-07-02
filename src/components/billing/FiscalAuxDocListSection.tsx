import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Plus, RefreshCw, Download, Eye, X, FileCode, Archive, Search, RotateCcw } from 'lucide-react'
import {
  billingService,
  type SunatPerception,
  type SunatRetention,
  type InvoiceInfo,
} from '@/services/billing.service'
import { SunatResponseDetail } from '@/components/billing/SunatResponseDetail'
import { FiscalRetentionPerceptionModal } from '@/components/billing/FiscalRetentionPerceptionModal'
import { ReversionCreateModal } from '@/components/billing/ReversionCreateModal'
import { Modal } from '@/components/ui/Modal'
import { DocumentViewerModal } from '@/components/ui/DocumentViewerModal'
import { createLocalReceiptPdfObjectUrl, downloadLocalReceiptPdf } from '@/utils/localReceiptPdf'
import { formatDisplayDatePeru } from '@/utils/datesPeru'
import {
  billingStatusColor,
  billingStatusLabel,
  canShowCdr,
  canShowXmlGenerated,
  canShowXmlSent,
  normalizeBillingStatus,
} from '@/constants/billingStatus'
import { FiscalDocumentTimeline } from '@/components/billing/FiscalDocumentTimeline'

type AuxKind = 'retention' | 'perception'
type AuxDoc = SunatRetention | SunatPerception

function docBillingStatus(d: AuxDoc): string {
  return normalizeBillingStatus(d.billing_status || d.status)
}

function amountLabel(kind: AuxKind, d: AuxDoc): string {
  if (kind === 'retention') return `S/ ${Number((d as SunatRetention).imp_retenido).toFixed(2)}`
  return `S/ ${Number((d as SunatPerception).imp_percibido).toFixed(2)}`
}

function reversionTipo(kind: AuxKind): string {
  return kind === 'retention' ? '20' : '40'
}

type Props = {
  kind: AuxKind
  list: AuxDoc[]
  loading: boolean
  onRefresh: () => void
  onCreated: (doc: AuxDoc) => void
  onStatusUpdated?: (doc: AuxDoc) => void
  onNavigateToPurchase?: (purchaseId: number) => void
  onNavigateToSale?: (saleId: number) => void
}

export function FiscalAuxDocListSection({ kind, list, loading, onRefresh, onCreated, onStatusUpdated, onNavigateToPurchase, onNavigateToSale }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [statusLoading, setStatusLoading] = useState<number | null>(null)
  const [detail, setDetail] = useState<AuxDoc | null>(null)
  const [detailInvoice, setDetailInvoice] = useState<InvoiceInfo | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [documentViewerOpen, setDocumentViewerOpen] = useState(false)
  const [documentViewerUrl, setDocumentViewerUrl] = useState<string | null>(null)
  const [viewingPdfSaleId, setViewingPdfSaleId] = useState<number | null>(null)
  const [downloadingPdfSaleId, setDownloadingPdfSaleId] = useState<number | null>(null)
  const [downloadingDoc, setDownloadingDoc] = useState<{ saleId: number; type: 'xml' | 'xml-generated' | 'cdr' } | null>(null)
  const [reversionOpen, setReversionOpen] = useState(false)
  const [reversionTarget, setReversionTarget] = useState<AuxDoc | null>(null)
  const documentViewerUrlRef = useRef<string | null>(null)

  const title = kind === 'retention' ? 'Comprobantes de retención' : 'Comprobantes de percepción'
  const partyLabel = kind === 'retention' ? 'Proveedor' : 'Sujeto percibido'
  const amountCol = kind === 'retention' ? 'Retenido' : 'Percibido'
  const colCount = 11

  const originLabel = (d: AuxDoc) =>
    kind === 'retention'
      ? (d as SunatRetention).origin_purchase_label
      : (d as SunatPerception).origin_sale_label

  const originId = (d: AuxDoc) =>
    kind === 'retention'
      ? (d as SunatRetention).purchase_id
      : (d as SunatPerception).source_sale_id

  const closeDocumentViewer = () => {
    setDocumentViewerOpen(false)
    setDocumentViewerUrl(null)
    if (documentViewerUrlRef.current) {
      URL.revokeObjectURL(documentViewerUrlRef.current)
      documentViewerUrlRef.current = null
    }
  }

  const openPdfViewer = async (saleId: number) => {
    if (documentViewerUrlRef.current) URL.revokeObjectURL(documentViewerUrlRef.current)
    setViewingPdfSaleId(saleId)
    setDocumentViewerOpen(true)
    setDocumentViewerUrl(null)
    try {
      const url = await createLocalReceiptPdfObjectUrl(saleId, 'a4')
      documentViewerUrlRef.current = url
      setDocumentViewerUrl(url)
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Error al generar PDF')
      setDocumentViewerOpen(false)
    } finally {
      setViewingPdfSaleId(null)
    }
  }

  const openDetail = (d: AuxDoc) => {
    setDetail(d)
    setDetailInvoice(null)
    if (!d.sale_id) return
    setDetailLoading(true)
    billingService.getInvoice(d.sale_id)
      .then(setDetailInvoice)
      .catch(() => setDetailInvoice(null))
      .finally(() => setDetailLoading(false))
  }

  const refreshStatus = (d: AuxDoc) => {
    setStatusLoading(d.id)
    const req = kind === 'retention'
      ? billingService.getRetentionStatus(d.id)
      : billingService.getPerceptionStatus(d.id)
    req
      .then((updated) => onStatusUpdated?.(updated))
      .catch(() => toast.error('Error al consultar estado'))
      .finally(() => setStatusLoading(null))
  }

  const openReversion = (d: AuxDoc) => {
    setReversionTarget(d)
    setReversionOpen(true)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <div className="flex gap-2">
          <button type="button" onClick={onRefresh} disabled={loading} className="p-2 text-gray-500 hover:text-gray-700" title="Actualizar lista">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
            <Plus size={14} /> {kind === 'retention' ? 'Nueva retención' : 'Nueva percepción'}
          </button>
        </div>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Fecha', 'Serie-Nro', 'Origen', partyLabel, amountCol, 'Estado SUNAT', 'RR', 'PDF', 'XML', 'CDR', 'Acciones'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colCount} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={colCount} className="px-4 py-8 text-center text-gray-400">Sin registros.</td></tr>
            ) : list.map((d) => {
              const bs = docBillingStatus(d)
              const saleId = d.sale_id
              const showXmlSigned = !!saleId && canShowXmlSent(bs)
              const showXmlGenerated = !!saleId && canShowXmlGenerated(bs)
              const showCdr = !!saleId && canShowCdr(bs)
              const showPdf = !!saleId && (showXmlSigned || showXmlGenerated)
              return (
                <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDisplayDatePeru(d.fecha_emision)}</td>
                  <td className="px-4 py-3 font-mono font-bold text-gray-800">{d.series}-{d.correlative}</td>
                  <td className="px-4 py-3 text-xs">
                    {originLabel(d) ? (
                      <button
                        type="button"
                        className="font-mono text-[rgb(var(--p600))] hover:underline"
                        onClick={() => {
                          const oid = originId(d)
                          if (!oid) return
                          if (kind === 'retention') onNavigateToPurchase?.(oid)
                          else onNavigateToSale?.(oid)
                        }}
                      >
                        {originLabel(d)}
                      </button>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-800">{d.proveedor_razon ?? '—'}</div>
                    {d.proveedor_ruc && <div className="text-xs text-gray-500 font-mono">{d.proveedor_ruc}</div>}
                    {d.sunat_code && <div className="text-xs text-red-600 mt-0.5" title={d.sunat_message}>SUNAT {d.sunat_code}</div>}
                  </td>
                  <td className="px-4 py-3">{amountLabel(kind, d)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${billingStatusColor(bs)}`}>{billingStatusLabel(bs)}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {d.linked_reversion ? (
                      <span className="font-mono" title={d.linked_reversion.motivo}>
                        RR {d.linked_reversion.correlativo}
                        <span className="block text-gray-500">{d.linked_reversion.status === 'accepted' ? 'Aceptada' : d.linked_reversion.status}</span>
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {showPdf ? (
                      <div className="flex items-center gap-1">
                        <button type="button" disabled={viewingPdfSaleId === saleId} onClick={() => void openPdfViewer(saleId!)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title="Ver PDF">
                          {viewingPdfSaleId === saleId ? <RefreshCw size={14} className="animate-spin" /> : <Eye size={14} />}
                        </button>
                        <button type="button" disabled={downloadingPdfSaleId === saleId} onClick={() => {
                          setDownloadingPdfSaleId(saleId!)
                          downloadLocalReceiptPdf(saleId!, 'a4').catch((e) => toast.error(e?.message ?? 'Error')).finally(() => setDownloadingPdfSaleId(null))
                        }} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title="Descargar PDF">
                          {downloadingPdfSaleId === saleId ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                        </button>
                      </div>
                    ) : <span className="text-gray-300 text-xs" title="Disponible tras emisión">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {showXmlSigned || showXmlGenerated ? (
                      <div className="flex items-center gap-1">
                        {showXmlSigned && (
                          <button type="button" disabled={downloadingDoc?.saleId === saleId && downloadingDoc?.type === 'xml'} onClick={() => {
                            setDownloadingDoc({ saleId: saleId!, type: 'xml' })
                            billingService.downloadDocument(saleId!, 'xml').catch((e) => toast.error(e?.message ?? 'Error')).finally(() => setDownloadingDoc(null))
                          }} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="XML firmado">
                            {(downloadingDoc?.saleId === saleId && downloadingDoc?.type === 'xml') ? <RefreshCw size={14} className="animate-spin" /> : <FileCode size={14} />}
                          </button>
                        )}
                        {showXmlGenerated && (
                          <button type="button" disabled={downloadingDoc?.saleId === saleId && downloadingDoc?.type === 'xml-generated'} onClick={() => {
                            setDownloadingDoc({ saleId: saleId!, type: 'xml-generated' })
                            billingService.downloadDocument(saleId!, 'xml-generated').catch((e) => toast.error(e?.message ?? 'Error')).finally(() => setDownloadingDoc(null))
                          }} className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg" title="XML generado">
                            {(downloadingDoc?.saleId === saleId && downloadingDoc?.type === 'xml-generated') ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                          </button>
                        )}
                      </div>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {showCdr ? (
                      <button type="button" disabled={downloadingDoc?.saleId === saleId && downloadingDoc?.type === 'cdr'} onClick={() => {
                        setDownloadingDoc({ saleId: saleId!, type: 'cdr' })
                        billingService.downloadDocument(saleId!, 'cdr').catch((e) => toast.error(e?.message ?? 'Error')).finally(() => setDownloadingDoc(null))
                      }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Descargar CDR">
                        {(downloadingDoc?.saleId === saleId && downloadingDoc?.type === 'cdr') ? <RefreshCw size={14} className="animate-spin" /> : <Archive size={14} />}
                      </button>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <button type="button" onClick={() => openDetail(d)} className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 inline-flex items-center gap-1"><Search size={12} /> Detalle</button>
                      <button type="button" onClick={() => refreshStatus(d)} disabled={statusLoading === d.id} className="text-xs px-2 py-1 rounded-lg bg-blue-100 text-blue-800 hover:bg-blue-200">{statusLoading === d.id ? '…' : 'Estado'}</button>
                      {bs === 'accepted' && (
                        <button type="button" onClick={() => openReversion(d)} className="text-xs px-2 py-1 rounded-lg bg-orange-100 text-orange-800 hover:bg-orange-200 inline-flex items-center gap-1"><RotateCcw size={12} /> Revertir</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <FiscalRetentionPerceptionModal
        mode={kind}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(doc) => { onCreated(doc as AuxDoc); setModalOpen(false) }}
      />

      <Modal open={detail != null} onClose={() => setDetail(null)} contentClassName="max-w-lg">
        {detail && (
          <>
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="font-bold text-gray-800">{detail.series}-{detail.correlative}</h3>
              <button type="button" onClick={() => setDetail(null)} className="p-2 rounded-lg hover:bg-gray-100"><X size={16} /></button>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
              <div><dt className="text-xs text-gray-500">Fecha</dt><dd>{formatDisplayDatePeru(detail.fecha_emision)}</dd></div>
              <div><dt className="text-xs text-gray-500">Estado</dt><dd><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${billingStatusColor(docBillingStatus(detail))}`}>{billingStatusLabel(docBillingStatus(detail))}</span></dd></div>
              <div className="col-span-2"><dt className="text-xs text-gray-500">{partyLabel}</dt><dd>{detail.proveedor_razon ?? '—'}</dd></div>
            </dl>
            {detailLoading ? <p className="text-sm text-gray-400">Cargando respuesta fiscal…</p> : (
              <SunatResponseDetail billingStatus={docBillingStatus(detail)} invoice={detailInvoice} statusLabel={billingStatusLabel(docBillingStatus(detail))} statusColorClass={billingStatusColor(docBillingStatus(detail))} />
            )}
            <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Historial</p>
              <FiscalDocumentTimeline
                compact
                origin={originLabel(detail) ? {
                  label: originLabel(detail)!,
                  onNavigate: () => {
                    const oid = originId(detail)
                    if (!oid) return
                    if (kind === 'retention') onNavigateToPurchase?.(oid)
                    else onNavigateToSale?.(oid)
                  },
                } : undefined}
                fiscalLabel={kind === 'retention' ? 'CRE' : 'CPE'}
                fiscalSeries={detail.series}
                fiscalCorrelative={detail.correlative}
                fiscalBillingStatus={docBillingStatus(detail)}
                reversion={detail.linked_reversion}
              />
            </div>
            {detail.sale_id && bsActions(detail)}
          </>
        )}
      </Modal>

      <DocumentViewerModal open={documentViewerOpen} onClose={closeDocumentViewer} src={documentViewerUrl} title={title} />

      {reversionTarget && (
        <ReversionCreateModal
          open={reversionOpen}
          onClose={() => { setReversionOpen(false); setReversionTarget(null) }}
          onCreated={() => toast.success('Reversión registrada')}
          prefill={{ tipo_doc: reversionTipo(kind), serie: reversionTarget.series, correlativo: reversionTarget.correlative, des_motivo_baja: '' }}
          locked
        />
      )}
    </div>
  )

  function bsActions(d: AuxDoc) {
    const bs = docBillingStatus(d)
    return (
      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
        <button type="button" onClick={() => void openPdfViewer(d.sale_id!)} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100">Ver PDF</button>
        {canShowXmlSent(bs) && <button type="button" onClick={() => billingService.downloadDocument(d.sale_id!, 'xml').catch((e) => toast.error(e.message))} className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100">Descargar XML</button>}
        {canShowCdr(bs) && <button type="button" onClick={() => billingService.downloadDocument(d.sale_id!, 'cdr').catch((e) => toast.error(e.message))} className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-800 hover:bg-blue-100">Descargar CDR</button>}
        {bs === 'accepted' && <button type="button" onClick={() => openReversion(d)} className="text-xs px-3 py-1.5 rounded-lg bg-orange-50 text-orange-800 hover:bg-orange-100">Revertir</button>}
      </div>
    )
  }
}

export function applyAuxDocBillingEvent<T extends { id: number; sale_id?: number }>(
  list: T[],
  saleId: number,
  fetchStatus: (id: number) => Promise<T>,
): Promise<T | null> {
  const row = list.find((x) => x.sale_id === saleId)
  if (!row) return Promise.resolve(null)
  return fetchStatus(row.id)
}
