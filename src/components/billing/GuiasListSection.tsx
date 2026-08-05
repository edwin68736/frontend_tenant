import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { RefreshCw, Plus, Download, Eye, X, FileCode, Archive, Search } from 'lucide-react'
import {
  billingService,
  type SunatDespatch,
  type InvoiceInfo,
} from '@/services/billing.service'
import type { GuiaSunatCode } from '@/utils/despatchSeries'
import { SunatResponseDetail } from '@/components/billing/SunatResponseDetail'
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

function despatchBillingStatus(d: SunatDespatch): string {
  return normalizeBillingStatus(d.billing_status || d.status)
}

/**
 * Listado de guías de remisión de UN solo tipo (09 o 31).
 *
 * Antes remitente y transportista se mezclaban en una sola tabla con una columna extra para
 * distinguirlas; separadas por página no hace falta esa columna — el tipo ya lo dice el título.
 */
export function GuiasListSection({
  guiaSunatCode,
  list,
  loading,
  onRefresh,
  statusLoading,
  setStatusLoading,
  onStatusUpdated,
}: {
  guiaSunatCode: GuiaSunatCode
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
  const [documentViewerName, setDocumentViewerName] = useState<string | null>(null)
  const [viewingPdfSaleId, setViewingPdfSaleId] = useState<number | null>(null)
  const [downloadingPdfSaleId, setDownloadingPdfSaleId] = useState<number | null>(null)
  const [downloadingDoc, setDownloadingDoc] = useState<{ saleId: number; type: 'xml' | 'xml-generated' | 'cdr' } | null>(null)
  const documentViewerUrlRef = useRef<string | null>(null)

  const rows = list.filter((d) => (d.guia_sunat_code || '09') === guiaSunatCode)
  const newGuiaPath = `/billing/docs/despatches/${guiaSunatCode === '31' ? 'transportista' : 'remitente'}/new`
  const sectionTitle = guiaSunatCode === '31' ? 'Guías de remisión — Transportista (31)' : 'Guías de remisión — Remitente (09)'

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
      const { url, fileName } = await createLocalReceiptPdfObjectUrl(saleId, 'a4')
      documentViewerUrlRef.current = url
      setDocumentViewerUrl(url)
      setDocumentViewerName(fileName)
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Error al generar PDF')
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

  const colCount = 8

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
        <h3 className="font-semibold text-gray-800">{sectionTitle}</h3>
        <div className="flex gap-2">
          <button type="button" onClick={onRefresh} disabled={loading} className="p-2 text-gray-500 hover:text-gray-700" title="Actualizar lista">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={() => navigate(newGuiaPath)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
            <Plus size={14} /> Nueva guía
          </button>
        </div>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
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
            ) : rows.length === 0 ? (
              <tr><td colSpan={colCount} className="px-4 py-8 text-center text-gray-400">Sin guías.</td></tr>
            ) : rows.map(d => {
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
                            downloadLocalReceiptPdf(saleId!, 'a4')
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
                <p className="text-xs text-gray-500">{sectionTitle}</p>
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
        downloadName={documentViewerName ?? undefined}
      />
    </div>
  )
}
