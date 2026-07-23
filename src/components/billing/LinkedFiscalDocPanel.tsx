import { useState } from 'react'
import { toast } from 'sonner'
import { Archive, Download, Eye, FileCode, RefreshCw, RotateCcw } from 'lucide-react'
import { billingService, type InvoiceInfo, type LinkedFiscalDocSummary, type VoidedDetailInput } from '@/services/billing.service'
import { SunatResponseDetail } from '@/components/billing/SunatResponseDetail'
import { ReversionCreateModal } from '@/components/billing/ReversionCreateModal'
import { FiscalDocumentTimeline, type FiscalTimelineOrigin } from '@/components/billing/FiscalDocumentTimeline'
import { DocumentViewerModal } from '@/components/ui/DocumentViewerModal'
import { createLocalReceiptPdfObjectUrl, downloadLocalReceiptPdf } from '@/utils/localReceiptPdf'
import {
  billingStatusColor,
  billingStatusLabel,
  canShowCdr,
  canShowXmlGenerated,
  canShowXmlSent,
  normalizeBillingStatus,
} from '@/constants/billingStatus'

export type LinkedFiscalDoc = LinkedFiscalDocSummary

type Props = {
  doc: LinkedFiscalDoc
  onStatusRefresh?: (doc: LinkedFiscalDoc) => void
  origin?: FiscalTimelineOrigin
  showTimeline?: boolean
}

function docLabel(kind: LinkedFiscalDoc['doc_kind']) {
  return kind === 'retention' ? 'Comprobante de retención (CRE)' : 'Comprobante de percepción (CPE)'
}

function reversionTipoDoc(kind: LinkedFiscalDoc['doc_kind']) {
  return kind === 'retention' ? '20' : '40'
}

export function LinkedFiscalDocPanel({ doc, onStatusRefresh, origin, showTimeline = true }: Props) {
  const bs = normalizeBillingStatus(doc.billing_status || doc.status)
  const saleId = doc.sale_id
  const [statusLoading, setStatusLoading] = useState(false)
  const [invoice, setInvoice] = useState<InvoiceInfo | null>(null)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfName, setPdfName] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<'pdf' | 'xml' | 'cdr' | null>(null)
  const [reversionOpen, setReversionOpen] = useState(false)

  const showXmlSigned = !!saleId && canShowXmlSent(bs)
  const showXmlGenerated = !!saleId && canShowXmlGenerated(bs)
  const showCdr = !!saleId && canShowCdr(bs)
  const showPdf = !!saleId && (showXmlSigned || showXmlGenerated)
  const canRevert = bs === 'accepted'

  const refreshStatus = () => {
    setStatusLoading(true)
    const req = doc.doc_kind === 'retention'
      ? billingService.getRetentionStatus(doc.id)
      : billingService.getPerceptionStatus(doc.id)
    req
      .then((updated) => {
        onStatusRefresh?.({
          ...doc,
          status: updated.status,
          billing_status: updated.billing_status,
          sunat_code: updated.sunat_code,
          sunat_message: updated.sunat_message,
          sale_id: updated.sale_id ?? doc.sale_id,
        })
      })
      .catch(() => toast.error('Error al consultar estado'))
      .finally(() => setStatusLoading(false))
  }

  const loadInvoice = () => {
    if (!saleId || invoice || invoiceLoading) return
    setInvoiceLoading(true)
    billingService.getInvoice(saleId)
      .then(setInvoice)
      .catch(() => setInvoice(null))
      .finally(() => setInvoiceLoading(false))
  }

  const openPdf = async () => {
    if (!saleId) return
    setPdfOpen(true)
    setPdfUrl(null)
    try {
      const { url, fileName } = await createLocalReceiptPdfObjectUrl(saleId, 'a4')
      setPdfUrl(url)
      setPdfName(fileName)
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Error al generar PDF')
      setPdfOpen(false)
    }
  }

  const reversionPrefill: VoidedDetailInput = {
    tipo_doc: reversionTipoDoc(doc.doc_kind),
    serie: doc.series,
    correlativo: doc.correlative,
    des_motivo_baja: '',
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-emerald-900 uppercase">{docLabel(doc.doc_kind)} emitido</p>
          <p className="font-mono font-bold text-gray-800">{doc.series}-{doc.correlative}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${billingStatusColor(bs)}`}>
          {billingStatusLabel(bs)}
        </span>
      </div>
      {doc.sunat_code && (
        <p className="text-xs text-red-700" title={doc.sunat_message}>SUNAT {doc.sunat_code}</p>
      )}
      {showTimeline && (
        <div className="rounded-lg border border-emerald-100 bg-white/80 p-2">
          <FiscalDocumentTimeline
            compact
            origin={origin}
            fiscalLabel={docLabel(doc.doc_kind)}
            fiscalSeries={doc.series}
            fiscalCorrelative={doc.correlative}
            fiscalBillingStatus={doc.billing_status || doc.status}
            reversion={doc.linked_reversion}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => { setExpanded((v) => !v); if (!expanded) loadInvoice() }}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50"
        >
          {expanded ? 'Ocultar detalle' : 'Ver detalle SUNAT'}
        </button>
        <button
          type="button"
          onClick={refreshStatus}
          disabled={statusLoading}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-100 text-blue-800 hover:bg-blue-200 inline-flex items-center gap-1"
        >
          {statusLoading ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Estado
        </button>
        {showPdf && (
          <>
            <button type="button" onClick={() => void openPdf()} className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 inline-flex items-center gap-1">
              <Eye size={12} /> PDF
            </button>
            <button
              type="button"
              disabled={downloading === 'pdf'}
              onClick={() => {
                setDownloading('pdf')
                downloadLocalReceiptPdf(saleId!, 'a4')
                  .catch((e) => toast.error(e?.message ?? 'Error'))
                  .finally(() => setDownloading(null))
              }}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 inline-flex items-center gap-1"
            >
              {downloading === 'pdf' ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />} PDF
            </button>
          </>
        )}
        {showXmlSigned && (
          <button
            type="button"
            disabled={downloading === 'xml'}
            onClick={() => {
              setDownloading('xml')
              billingService.downloadDocument(saleId!, 'xml')
                .catch((e) => toast.error(e?.message ?? 'Error'))
                .finally(() => setDownloading(null))
            }}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 inline-flex items-center gap-1"
          >
            {downloading === 'xml' ? <RefreshCw size={12} className="animate-spin" /> : <FileCode size={12} />} XML
          </button>
        )}
        {showCdr && (
          <button
            type="button"
            disabled={downloading === 'cdr'}
            onClick={() => {
              setDownloading('cdr')
              billingService.downloadDocument(saleId!, 'cdr')
                .catch((e) => toast.error(e?.message ?? 'Error'))
                .finally(() => setDownloading(null))
            }}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-800 hover:bg-blue-100 inline-flex items-center gap-1"
          >
            {downloading === 'cdr' ? <RefreshCw size={12} className="animate-spin" /> : <Archive size={12} />} CDR
          </button>
        )}
        {canRevert && (
          <button
            type="button"
            onClick={() => setReversionOpen(true)}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-orange-50 text-orange-800 hover:bg-orange-100 inline-flex items-center gap-1"
          >
            <RotateCcw size={12} /> Revertir
          </button>
        )}
      </div>
      {!showPdf && !showXmlSigned && !showCdr && saleId && (
        <p className="text-xs text-gray-500">Descargas disponibles cuando SUNAT responda al comprobante.</p>
      )}
      {expanded && (
        <div className="pt-2 border-t border-emerald-100">
          {invoiceLoading ? (
            <p className="text-xs text-gray-400">Cargando respuesta fiscal…</p>
          ) : (
            <SunatResponseDetail
              billingStatus={bs}
              invoice={invoice}
              statusLabel={billingStatusLabel(bs)}
              statusColorClass={billingStatusColor(bs)}
            />
          )}
        </div>
      )}
      <DocumentViewerModal open={pdfOpen} onClose={() => { setPdfOpen(false); setPdfUrl(null) }} src={pdfUrl} title={docLabel(doc.doc_kind)} downloadName={pdfName ?? undefined} />
      <ReversionCreateModal
        open={reversionOpen}
        onClose={() => setReversionOpen(false)}
        onCreated={() => toast.success('Reversión registrada')}
        prefill={reversionPrefill}
        locked
      />
    </div>
  )
}
