import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { Send, Eye, RefreshCw, X, FileText, FileCode, Archive, Download, FileSignature, FileBarChart, Ban, Search, Ticket, FileDown, ChevronDown, Truck, Receipt, MoreVertical } from 'lucide-react'
import { salesService, type Sale, type SaleDetail } from '@/services/sales.service'
import { PrintDocButton } from '@/components/print/PrintDocButton'
import { RowMenu } from '@/components/ui/RowMenu'
import { billingService, type SunatSummary, type SunatVoided, type VoidedDetailInput, type InvoiceStatusResult } from '@/services/billing.service'
import { companyService, type SeriesRow } from '@/services/company.service'
import RequireModule from '@/components/ui/RequireModule'
import SunatRequiredMessage from '@/components/ui/SunatRequiredMessage'
import { Modal } from '@/components/ui/Modal'
import { SunatResponseDetail } from '@/components/billing/SunatResponseDetail'
import { BillingOperationTypeBadge } from '@/components/billing/BillingOperationTypeBadge'
import { BillingDetractionDetail } from '@/components/billing/BillingDetractionDetail'
import { SalePaymentsBreakdown } from '@/components/sales/SalePaymentsBreakdown'
import { BnConfirmationPanel } from '@/components/receivables/BnConfirmationPanel'
import { DespatchFormModal, buildDespatchPrefillFromSaleDetail, type DespatchPrefill } from '@/components/billing/DespatchFormModal'
import { FiscalRetentionPerceptionModal } from '@/components/billing/FiscalRetentionPerceptionModal'
import {
  filterSeriesBySunatCode,
  FISCAL_DOC_SERIES_SETTINGS_PATH,
  fiscalSeriesMissingMessage,
  hasFiscalSeriesForCode,
} from '@/utils/fiscalDocSeries'
import { buildPerceptionPrefillFromSale, type FiscalRetentionPerceptionPrefill } from '@/utils/fiscalRetentionPerceptionPrefill'
import { LinkedFiscalDocPanel, type LinkedFiscalDoc } from '@/components/billing/LinkedFiscalDocPanel'
import { FiscalLinkedDocBadge } from '@/components/billing/FiscalLinkedDocBadge'
import {
  filterAllGuiaSeries,
  guiaSeriesMissingMessage,
  hasGuiaSeriesForCode,
  GUIA_SERIES_SETTINGS_PATH,
  type GuiaSeriesRow,
} from '@/utils/despatchSeries'
import { DocumentViewerModal } from '@/components/ui/DocumentViewerModal'
import { getTodayPeru, formatDisplayDatePeru } from '@/utils/datesPeru'
import { formatSaleDocumentNumber } from '@/utils/format'
import { createLocalReceiptPdfObjectUrl, downloadLocalReceiptPdf } from '@/utils/localReceiptPdf'
import { shareReceiptPngViaWhatsApp } from '@/utils/receiptPng'
import { WhatsAppGlyph } from '@/components/icons/WhatsAppGlyph'
import { useBillingEvents } from '@/hooks/useBillingEvents'
import {
  billingStatusForUI,
  manualBillingMessage,
  normalizeBillingStatus,
  resolveManualBillingStatus,
} from '@/utils/manualBilling'
import {
  BILLING_STATUS_COLORS,
  BILLING_STATUS_FILTER_OPTIONS,
  BILLING_STATUS_LABELS,
  billingStatusColor,
  billingStatusLabel,
  canShowCdr,
  canShowXmlGenerated,
  canShowXmlSent,
} from '@/constants/billingStatus'

const STATUS_COLORS = BILLING_STATUS_COLORS
const STATUS_LABELS = BILLING_STATUS_LABELS
const STATUS_FILTER_OPTIONS = BILLING_STATUS_FILTER_OPTIONS

const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const
const TABLE_SKELETON_ROWS = 6

function normalizeSaleRow(s: Sale): Sale {
  return { ...s, billing_status: normalizeBillingStatus(s.billing_status) }
}

function isSaleCancelled(s: Pick<Sale, 'status'>): boolean {
  return String(s.status ?? '').toLowerCase() === 'cancelled'
}

function canVoidWithCreditNote(s: Sale): boolean {
  return normalizeBillingStatus(s.billing_status) === 'accepted' && !isSaleCancelled(s)
}

const getCurrentMonthRange = () => {
  const today = getTodayPeru()
  const [year, month] = today.split('-')
  return { from: `${year}-${month}-01`, to: today }
}

export default function BillingPage() {
  return <RequireModule moduleKey="billing"><BillingContent /></RequireModule>
}

function BillingContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const [sunatEnabled, setSunatEnabled] = useState<boolean | null>(null)
  const [searchParams] = useSearchParams()
  const [viewMode, setViewMode] = useState<'invoices' | 'credit_notes' | 'summaries_voided'>('invoices')
  const [filterStatus, setFilterStatus] = useState<string>(() => searchParams.get('status') || '')
  const [searchTerm, setSearchTerm] = useState('')
  const [dateRange, setDateRange] = useState(() => getCurrentMonthRange())
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [total, setTotal] = useState(0)
  const [sending, setSending] = useState<number | null>(null)
  const [resending, setResending] = useState<number | null>(null)
  const [voidNcOpen, setVoidNcOpen] = useState(false)
  const [voidNcTarget, setVoidNcTarget] = useState<{ id: number; series: string; number: string } | null>(null)
  const [voidNcReason, setVoidNcReason] = useState('')
  const [voidNcSubmitting, setVoidNcSubmitting] = useState(false)
  const [waBusyId, setWaBusyId] = useState<number | null>(null)
  const [waMenu, setWaMenu] = useState<{ saleId: number; top: number; left: number } | null>(null)
  const [detail, setDetail] = useState<SaleDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [viewingPdfSaleId, setViewingPdfSaleId] = useState<number | null>(null)
  const [downloadingPdfSaleId, setDownloadingPdfSaleId] = useState<number | null>(null)
  const [viewingTicketPdfSaleId, setViewingTicketPdfSaleId] = useState<number | null>(null)
  const [downloadingTicketPdfSaleId, setDownloadingTicketPdfSaleId] = useState<number | null>(null)
  const [guiaModalOpen, setGuiaModalOpen] = useState(false)
  const [guiaPrefill, setGuiaPrefill] = useState<DespatchPrefill | null>(null)
  const [guiaSeries, setGuiaSeries] = useState<GuiaSeriesRow[]>([])
  const [guiaBranches, setGuiaBranches] = useState<{ id: number; name: string }[]>([])
  const [guiaLoadingSaleId, setGuiaLoadingSaleId] = useState<number | null>(null)
  const [cpeModalOpen, setCpeModalOpen] = useState(false)
  const [cpePrefill, setCpePrefill] = useState<FiscalRetentionPerceptionPrefill | null>(null)
  const [cpeSourceSaleId, setCpeSourceSaleId] = useState<number | null>(null)
  const [perceptionSeries, setPerceptionSeries] = useState<SeriesRow[]>([])
  const [downloadingDoc, setDownloadingDoc] = useState<{ saleId: number; type: 'xml' | 'xml-generated' | 'cdr' } | null>(null)
  const [documentViewerOpen, setDocumentViewerOpen] = useState(false)
  const [documentViewerUrl, setDocumentViewerUrl] = useState<string | null>(null)
  const documentViewerUrlRef = useRef<string | null>(null)

  // Resúmenes y comunicaciones de baja
  const [summaries, setSummaries] = useState<SunatSummary[]>([])
  const [voidedList, setVoidedList] = useState<SunatVoided[]>([])
  const [summariesLoading, setSummariesLoading] = useState(false)
  const [voidedLoading, setVoidedLoading] = useState(false)
  const [creatingSummary, setCreatingSummary] = useState(false)
  const [summaryDate, setSummaryDate] = useState(() => getTodayPeru())
  const [summaryStatusLoading, setSummaryStatusLoading] = useState<number | null>(null)
  const [voidedStatusLoading, setVoidedStatusLoading] = useState<number | null>(null)
  const [voidedModalOpen, setVoidedModalOpen] = useState(false)
  const [voidedDetails, setVoidedDetails] = useState<VoidedDetailInput[]>([{ tipo_doc: '03', serie: 'B001', correlativo: '', des_motivo_baja: '' }])
  const [creatingVoided, setCreatingVoided] = useState(false)
  const [invoiceStatusQuery, setInvoiceStatusQuery] = useState({ tipo: '03', serie: 'B001', numero: '' })
  const [invoiceStatusResult, setInvoiceStatusResult] = useState<InvoiceStatusResult | null>(null)
  const [invoiceStatusLoading, setInvoiceStatusLoading] = useState(false)

  const load = () => {
    if (viewMode === 'summaries_voided') {
      setLoading(false)
      return
    }
    setLoading(true)
    if (viewMode === 'credit_notes') {
      return salesService.list({
        doc_type: 'NOTA_CREDITO',
        q: searchTerm.trim() || undefined,
        from: dateRange.from || undefined,
        to: dateRange.to || undefined,
        billing_status: filterStatus || undefined,
        page,
        per_page: perPage,
      })
        .then(({ data, total: t }) => {
          setSales((data ?? []).map(normalizeSaleRow))
          setTotal(t ?? 0)
        })
        .catch(() => toast.error('Error'))
        .finally(() => setLoading(false))
    }
    return salesService.list({
      q: searchTerm.trim() || undefined,
      from: dateRange.from || undefined,
      to: dateRange.to || undefined,
      billing_status: filterStatus || undefined,
      sunat_code: '01,03',
      page,
      per_page: perPage,
    })
      .then(({ data, total: t }) => {
        setSales((data ?? []).map(normalizeSaleRow))
        setTotal(t ?? 0)
      })
      .catch(() => toast.error('Error'))
      .finally(() => setLoading(false))
  }

  const loadSummaries = () => {
    setSummariesLoading(true)
    billingService.listSummaries()
      .then(({ summaries: list }) => setSummaries(list ?? []))
      .catch(() => toast.error('Error al cargar resúmenes'))
      .finally(() => setSummariesLoading(false))
  }
  const loadVoided = () => {
    setVoidedLoading(true)
    billingService.listVoided()
      .then(({ voided: list }) => setVoidedList(list ?? []))
      .catch(() => toast.error('Error al cargar comunicaciones de baja'))
      .finally(() => setVoidedLoading(false))
  }

  useEffect(() => {
    companyService.getSunat().then(d => setSunatEnabled(d.sunat_enabled ?? false)).catch(() => setSunatEnabled(false))
    companyService.listSeries({}).then((data: unknown) => {
      const list = Array.isArray(data) ? data : ((data as { data?: unknown[] })?.data ?? [])
      setGuiaSeries(filterAllGuiaSeries(list as GuiaSeriesRow[]))
      setPerceptionSeries(filterSeriesBySunatCode(list as SeriesRow[], '40'))
    }).catch(() => {})
    companyService.listBranches().then(data => setGuiaBranches(Array.isArray(data) ? data : [])).catch(() => {})
  }, [])

  useEffect(() => {
    const status = searchParams.get('status')
    if (status && ['pending', 'error', 'rejected', 'sent', 'accepted'].includes(status)) setFilterStatus(status)
  }, [searchParams])

  useEffect(() => { load() }, [viewMode, filterStatus, searchTerm, dateRange.from, dateRange.to, page, perPage])

  useEffect(() => {
    const id = (location.state as { openSaleId?: number } | null)?.openSaleId
    if (!id) return
    setViewMode('invoices')
    void salesService.get(id).then((d) => setDetail(d)).catch(() => toast.error('No se pudo abrir la venta'))
  }, [location.state])

  const applyBillingEvent = useCallback((evt: { sale_id: number; status: string }) => {
    const billingStatus = normalizeBillingStatus(evt.status)
    setSales(prev => prev.map(s => (s.id === evt.sale_id ? { ...s, billing_status: billingStatus } : s)))
    setDetail(d => (d && d.sale.id === evt.sale_id
      ? { ...d, sale: { ...d.sale, billing_status: billingStatus } }
      : d))
  }, [])

  useBillingEvents(applyBillingEvent, sunatEnabled === true && viewMode === 'invoices')

  useEffect(() => {
    if (sunatEnabled !== true) return
    if (viewMode === 'summaries_voided') {
      loadSummaries()
      loadVoided()
    }
  }, [viewMode, sunatEnabled])

  useEffect(() => {
    if (!waMenu) return
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('[data-wa-portal-menu]')) return
      if (t.closest(`[data-wa-trigger="${waMenu.saleId}"]`)) return
      setWaMenu(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [waMenu])

  if (sunatEnabled === null) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
  if (!sunatEnabled) return <SunatRequiredMessage />

  const handleSend = async (saleId: number) => {
    setSending(saleId)
    const tid = toast.loading('Enviando a SUNAT…')
    try {
      const res = await billingService.send(saleId)
      const status = resolveManualBillingStatus(res)
      const msg = manualBillingMessage(res)
      if (status === 'accepted' || status === 'already_accepted') toast.success(msg, { id: tid })
      else if (status === 'rejected' || status === 'error') toast.error(msg, { id: tid })
      else toast.info(msg, { id: tid })
      applyBillingEvent({ sale_id: saleId, status: billingStatusForUI(res) })
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? e.message ?? 'Error enviando', { id: tid })
    } finally {
      setSending(null)
    }
  }

  const handleResend = async (saleId: number) => {
    setResending(saleId)
    const tid = toast.loading('Reenviando a SUNAT…')
    try {
      const res = await billingService.resend(saleId)
      const status = resolveManualBillingStatus(res)
      const msg = manualBillingMessage(res)
      if (status === 'accepted' || status === 'already_accepted') toast.success(msg, { id: tid })
      else if (status === 'rejected' || status === 'error') toast.error(msg, { id: tid })
      else toast.info(msg, { id: tid })
      applyBillingEvent({ sale_id: saleId, status: billingStatusForUI(res) })
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? e.message ?? 'Error reenviando', { id: tid })
    } finally {
      setResending(null)
    }
  }

  const openCpeFromSaleDetail = (saleDetail: SaleDetail) => {
    if (!saleDetail.contact?.id && !saleDetail.sale.contact_id) {
      toast.error('La venta no tiene cliente vinculado; complete el contacto antes de emitir percepción')
      return
    }
    if (!hasFiscalSeriesForCode(perceptionSeries, '40')) {
      toast.error(fiscalSeriesMissingMessage('40'), {
        action: {
          label: 'Ir a series',
          onClick: () => navigate(FISCAL_DOC_SERIES_SETTINGS_PATH),
        },
      })
      return
    }
    setCpePrefill(buildPerceptionPrefillFromSale(saleDetail))
    setCpeSourceSaleId(saleDetail.sale.id)
    setCpeModalOpen(true)
  }

  const openGuiaFromSale = async (saleId: number) => {
    if (!hasGuiaSeriesForCode(guiaSeries, '09')) {
      toast.error(guiaSeriesMissingMessage('09'), {
        action: {
          label: 'Ir a series',
          onClick: () => navigate(GUIA_SERIES_SETTINGS_PATH),
        },
      })
      return
    }
    setGuiaLoadingSaleId(saleId)
    try {
      const detailData = await salesService.get(saleId)
      setGuiaPrefill(buildDespatchPrefillFromSaleDetail(detailData))
      setGuiaModalOpen(true)
    } catch {
      toast.error('No se pudo cargar la venta para generar la guía')
    } finally {
      setGuiaLoadingSaleId(null)
    }
  }

  const openVoidNcModal = (sale: Sale) => {
    if (!canVoidWithCreditNote(sale)) return
    setVoidNcTarget({ id: sale.id, series: sale.series, number: sale.number })
    setVoidNcReason('')
    setVoidNcOpen(true)
  }

  const submitVoidWithCreditNote = async () => {
    if (!voidNcTarget) return
    if (!voidNcReason.trim()) {
      toast.error('Indique el motivo de anulación')
      return
    }
    setVoidNcSubmitting(true)
    try {
      const res = await billingService.voidWithCreditNote(voidNcTarget.id, voidNcReason.trim())
      if (res.success) {
        toast.success(res.message ?? 'Nota de crédito encolada')
        setVoidNcOpen(false)
        setVoidNcTarget(null)
        setDetail((d) => (d?.sale.id === voidNcTarget.id ? null : d))
        setViewMode('credit_notes')
        setPage(1)
        load()
      } else {
        toast.error('Error al anular')
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'Error al anular con nota de crédito')
    } finally {
      setVoidNcSubmitting(false)
    }
  }

  const openDetail = async (id: number) => {
    setDetailLoading(true)
    try {
      const d = await salesService.get(id)
      setDetail({
        ...d,
        sale: { ...d.sale, billing_status: normalizeBillingStatus(d.sale.billing_status) },
      })
    }
    catch { toast.error('Error') }
    finally { setDetailLoading(false) }
  }

  const handleWhatsAppReceipt = async (saleId: number, format: 'a4' | 'ticket') => {
    setWaBusyId(saleId)
    const tid = toast.loading(
      format === 'ticket' ? 'Generando imagen ticket para WhatsApp…' : 'Generando imagen A4 para WhatsApp…',
    )
    try {
      const d = await salesService.get(saleId)
      if (!d.print_data) {
        toast.error('No hay datos para generar el comprobante (misma base que el PDF).', { id: tid })
        return
      }
      const label = viewMode === 'credit_notes' ? 'Nota de crédito' : 'Comprobante'
      await shareReceiptPngViaWhatsApp({
        printData: d.print_data,
        format,
        phone: d.contact?.phone,
        message: `${label} ${formatSaleDocumentNumber(d.sale.series, d.sale.number)} (${format === 'ticket' ? 'formato ticket' : 'formato A4'})`,
      })
      toast.success('Imagen lista: complete el envío en WhatsApp (o pegue la imagen si se copió al portapapeles).', {
        id: tid,
      })
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? 'No se pudo generar o compartir el comprobante'
      toast.error(msg, { id: tid })
    } finally {
      setWaBusyId(null)
    }
  }

  const openLocalPdfViewer = async (saleId: number, format: 'a4' | 'ticket' = 'a4') => {
    if (documentViewerUrlRef.current) {
      URL.revokeObjectURL(documentViewerUrlRef.current)
      documentViewerUrlRef.current = null
    }
    if (format === 'ticket') {
      setViewingTicketPdfSaleId(saleId)
    } else {
      setViewingPdfSaleId(saleId)
    }
    setDocumentViewerOpen(true)
    setDocumentViewerUrl(null)
    try {
      const url = await createLocalReceiptPdfObjectUrl(saleId, format)
      documentViewerUrlRef.current = url
      setDocumentViewerUrl(url)
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al generar PDF')
      setDocumentViewerOpen(false)
    } finally {
      if (format === 'ticket') {
        setViewingTicketPdfSaleId(null)
      } else {
        setViewingPdfSaleId(null)
      }
    }
  }

  const downloadLocalPdf = async (saleId: number, format: 'a4' | 'ticket' = 'a4') => {
    if (format === 'ticket') {
      setDownloadingTicketPdfSaleId(saleId)
    } else {
      setDownloadingPdfSaleId(saleId)
    }
    try {
      await downloadLocalReceiptPdf(saleId, format)
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al descargar')
    } finally {
      if (format === 'ticket') {
        setDownloadingTicketPdfSaleId(null)
      } else {
        setDownloadingPdfSaleId(null)
      }
    }
  }

  const closeDocumentViewer = () => {
    if (documentViewerUrlRef.current) {
      URL.revokeObjectURL(documentViewerUrlRef.current)
      documentViewerUrlRef.current = null
    }
    setDocumentViewerUrl(null)
    setDocumentViewerOpen(false)
  }

  if (viewMode === 'summaries_voided') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-bold text-gray-800">Resúmenes y comunicaciones de baja</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => { setViewMode('invoices'); setPage(1) }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:border-[rgb(var(--p300))]">Facturas y boletas</button>
            <button onClick={() => { setViewMode('credit_notes'); setPage(1) }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:border-[rgb(var(--p300))]"><FileSignature size={16} /> Notas de crédito</button>
            <button onClick={() => { setViewMode('summaries_voided') }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-[rgb(var(--p600))] text-white"><FileBarChart size={16} /> Resúmenes y bajas</button>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-gray-800">Resumen diario de boletas</h3>
            <div className="flex items-center gap-2">
              <input type="date" value={summaryDate} onChange={e => setSummaryDate(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <button onClick={() => { setCreatingSummary(true); billingService.createSummary(summaryDate).then(({ summary }) => { toast.success('Resumen enviado'); setSummaries(s => [summary, ...s]); }).catch((e: any) => toast.error(e.response?.data?.error ?? 'Error')).finally(() => setCreatingSummary(false)) }} disabled={creatingSummary} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{creatingSummary ? <RefreshCw size={14} className="animate-spin" /> : <FileBarChart size={14} />} Generar resumen</button>
              <button onClick={loadSummaries} disabled={summariesLoading} className="p-2 text-gray-500 hover:text-gray-700"><RefreshCw size={16} className={summariesLoading ? 'animate-spin' : ''} /></button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100"><tr>{['Fecha resumen', 'Correlativo', 'Ticket', 'Estado', 'Detalles', 'Acción'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr></thead>
            <tbody>
              {summariesLoading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400"><RefreshCw size={20} className="animate-spin inline" /> Cargando...</td></tr> : summaries.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin resúmenes.</td></tr> : summaries.map(s => (
              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3">{formatDisplayDatePeru(s.fec_resumen)}</td>
                <td className="px-4 py-3 font-mono">{s.correlativo}</td>
                <td className="px-4 py-3 text-xs">{s.ticket || '—'}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(STATUS_COLORS as Record<string, string>)[s.status] ?? 'bg-gray-100 text-gray-600'}`}>{(STATUS_LABELS as Record<string, string>)[s.status] ?? s.status}</span></td>
                <td className="px-4 py-3">{s.details_count}</td>
                <td className="px-4 py-3">{s.ticket ? <button onClick={() => { setSummaryStatusLoading(s.id); billingService.getSummaryStatus(s.id).then(updated => { setSummaries(prev => prev.map(x => x.id === updated.id ? updated : x)); }).catch(() => toast.error('Error')).finally(() => setSummaryStatusLoading(null)) }} disabled={summaryStatusLoading === s.id} className="text-xs px-2 py-1 rounded-lg bg-blue-100 text-blue-800 hover:bg-blue-200 disabled:opacity-50">{summaryStatusLoading === s.id ? <RefreshCw size={12} className="animate-spin inline" /> : <Search size={12} className="inline" />} Consultar estado</button> : null}</td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-gray-800">Comunicaciones de baja</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => { setVoidedDetails([{ tipo_doc: '03', serie: 'B001', correlativo: '', des_motivo_baja: '' }]); setVoidedModalOpen(true) }} className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-medium hover:bg-orange-700"><Ban size={14} /> Nueva comunicación de baja</button>
              <button onClick={loadVoided} disabled={voidedLoading} className="p-2 text-gray-500 hover:text-gray-700"><RefreshCw size={16} className={voidedLoading ? 'animate-spin' : ''} /></button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100"><tr>{['Fecha', 'Correlativo', 'Ticket', 'Estado', 'Detalles', 'Acción'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr></thead>
            <tbody>
              {voidedLoading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400"><RefreshCw size={20} className="animate-spin inline" /> Cargando...</td></tr> : voidedList.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin comunicaciones de baja.</td></tr> : voidedList.map(v => (
              <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3">{new Date(v.fec_comunicacion).toLocaleString()}</td>
                <td className="px-4 py-3 font-mono">{v.correlativo}</td>
                <td className="px-4 py-3 text-xs">{v.ticket || '—'}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(STATUS_COLORS as Record<string, string>)[v.status] ?? 'bg-gray-100 text-gray-600'}`}>{(STATUS_LABELS as Record<string, string>)[v.status] ?? v.status}</span></td>
                <td className="px-4 py-3">{v.details_count}</td>
                <td className="px-4 py-3">{v.ticket ? <button onClick={() => { setVoidedStatusLoading(v.id); billingService.getVoidedStatus(v.id).then(updated => { setVoidedList(prev => prev.map(x => x.id === updated.id ? updated : x)); }).catch(() => toast.error('Error')).finally(() => setVoidedStatusLoading(null)) }} disabled={voidedStatusLoading === v.id} className="text-xs px-2 py-1 rounded-lg bg-blue-100 text-blue-800 hover:bg-blue-200 disabled:opacity-50">{voidedStatusLoading === v.id ? <RefreshCw size={12} className="animate-spin inline" /> : <Search size={12} className="inline" />} Consultar estado</button> : null}</td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h3 className="font-semibold text-gray-800 mb-3">Consulta estado comprobante (CDR)</h3>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <select value={invoiceStatusQuery.tipo} onChange={e => setInvoiceStatusQuery(q => ({ ...q, tipo: e.target.value }))} className="border rounded-xl px-3 py-2 text-sm w-24"><option value="01">01 Factura</option><option value="03">03 Boleta</option><option value="07">07 NC</option><option value="08">08 ND</option></select>
            <input type="text" value={invoiceStatusQuery.serie} onChange={e => setInvoiceStatusQuery(q => ({ ...q, serie: e.target.value }))} placeholder="Serie" className="border rounded-xl px-3 py-2 text-sm w-24" />
            <input type="text" value={invoiceStatusQuery.numero} onChange={e => setInvoiceStatusQuery(q => ({ ...q, numero: e.target.value }))} placeholder="Número" className="border rounded-xl px-3 py-2 text-sm w-24" />
            <button onClick={() => { if (!invoiceStatusQuery.numero.trim()) return toast.error('Indique número'); setInvoiceStatusLoading(true); setInvoiceStatusResult(null); billingService.consultInvoiceStatus(invoiceStatusQuery.tipo, invoiceStatusQuery.serie, invoiceStatusQuery.numero.trim()).then(setInvoiceStatusResult).catch((e: any) => { toast.error(e.response?.data?.error ?? 'Error'); setInvoiceStatusResult(null); }).finally(() => setInvoiceStatusLoading(false)); }} disabled={invoiceStatusLoading} className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 text-white rounded-xl text-sm font-medium hover:bg-gray-900 disabled:opacity-50">{invoiceStatusLoading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />} Consultar</button>
          </div>
          {invoiceStatusResult && <div className={`rounded-xl p-4 text-sm ${invoiceStatusResult.success ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'}`}><p className="font-medium">{invoiceStatusResult.success ? 'Consulta exitosa' : 'Error o sin CDR'}</p>{invoiceStatusResult.cdrResponse && <><p>Código: {invoiceStatusResult.cdrResponse.code} — {invoiceStatusResult.cdrResponse.description}</p>{invoiceStatusResult.cdrResponse.accepted && <p className="text-green-700">Aceptado por SUNAT.</p>}</>}{invoiceStatusResult.error && <p>{invoiceStatusResult.error.message}</p>}</div>}
        </div>
        <Modal open={voidedModalOpen} onClose={() => setVoidedModalOpen(false)} contentClassName="max-w-2xl">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4"><h3 className="font-bold text-gray-800">Nueva comunicación de baja</h3><button onClick={() => setVoidedModalOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={16} /></button></div>
          <div className="space-y-3">
            {voidedDetails.map((d, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-2"><select value={d.tipo_doc} onChange={e => setVoidedDetails(prev => prev.map((x, j) => j === i ? { ...x, tipo_doc: e.target.value } : x))} className="w-full border rounded-lg px-2 py-1.5 text-sm"><option value="01">01</option><option value="03">03</option><option value="07">07</option><option value="08">08</option></select></div>
                <div className="col-span-2"><input type="text" value={d.serie} onChange={e => setVoidedDetails(prev => prev.map((x, j) => j === i ? { ...x, serie: e.target.value } : x))} placeholder="Serie" className="w-full border rounded-lg px-2 py-1.5 text-sm" /></div>
                <div className="col-span-2"><input type="text" value={d.correlativo} onChange={e => setVoidedDetails(prev => prev.map((x, j) => j === i ? { ...x, correlativo: e.target.value } : x))} placeholder="Nro" className="w-full border rounded-lg px-2 py-1.5 text-sm" /></div>
                <div className="col-span-4"><input type="text" value={d.des_motivo_baja} onChange={e => setVoidedDetails(prev => prev.map((x, j) => j === i ? { ...x, des_motivo_baja: e.target.value } : x))} placeholder="Motivo baja" className="w-full border rounded-lg px-2 py-1.5 text-sm" /></div>
                <div className="col-span-2"><button type="button" onClick={() => setVoidedDetails(prev => prev.filter((_, j) => j !== i))} className="text-red-600 text-xs">Quitar</button></div>
              </div>
            ))}
            <button type="button" onClick={() => setVoidedDetails(prev => [...prev, { tipo_doc: '03', serie: 'B001', correlativo: '', des_motivo_baja: '' }])} className="text-sm text-[rgb(var(--p600))]">+ Añadir comprobante</button>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
            <button onClick={() => setVoidedModalOpen(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm">Cancelar</button>
            <button onClick={() => { const valid = voidedDetails.every(d => d.serie.trim() && d.correlativo.trim() && d.des_motivo_baja.trim()); if (!valid) { toast.error('Complete todos los campos'); return; } setCreatingVoided(true); billingService.createVoided(voidedDetails).then(({ voided }) => { toast.success('Enviado'); setVoidedList(prev => [voided, ...prev]); setVoidedModalOpen(false); }).catch((e: any) => toast.error(e.response?.data?.error ?? 'Error')).finally(() => setCreatingVoided(false)); }} disabled={creatingVoided} className="px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-medium hover:bg-orange-700 disabled:opacity-50">{creatingVoided ? <RefreshCw size={14} className="animate-spin inline" /> : null} Enviar a SUNAT</button>
          </div>
        </Modal>
        <div className="flex gap-2"><button onClick={() => setViewMode('invoices')} className="text-sm text-gray-500 hover:text-gray-700">← Volver a facturas y boletas</button></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Comprobantes electrónicos</h2>
          <p className="text-sm text-gray-500">
            {viewMode === 'invoices'
              ? 'Facturas y boletas de venta.'
              : 'Notas de crédito (anulaciones)'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setViewMode('invoices'); setPage(1) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium ${viewMode === 'invoices' ? 'bg-[rgb(var(--p600))] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-[rgb(var(--p300))]'}`}
          >
            Facturas y boletas
          </button>
          <button
            onClick={() => { setViewMode('credit_notes'); setPage(1) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium ${viewMode === 'credit_notes' ? 'bg-[rgb(var(--p600))] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-[rgb(var(--p300))]'}`}
          >
            <FileSignature size={16} /> Notas de crédito
          </button>
          <button
            onClick={() => { setViewMode('summaries_voided'); setPage(1) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:border-[rgb(var(--p300))]"
          >
            <FileBarChart size={16} /> Resúmenes y bajas
          </button>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 flex-shrink-0">
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap items-center">
        <select
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm min-w-[180px]"
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value)
            setPage(1)
          }}
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
            placeholder="Buscar por cliente, serie o número..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <input
          type="date"
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
          value={dateRange.from}
          onChange={(e) => {
            setDateRange((prev) => ({ ...prev, from: e.target.value }))
            setPage(1)
          }}
        />
        <input
          type="date"
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
          value={dateRange.to}
          onChange={(e) => {
            setDateRange((prev) => ({ ...prev, to: e.target.value }))
            setPage(1)
          }}
        />
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-gray-600 whitespace-nowrap">Mostrar</span>
          <select
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={perPage}
            onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
          >
            {PER_PAGE_OPTIONS.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span className="text-sm text-gray-600 whitespace-nowrap">por página</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {viewMode === 'credit_notes' ? (
                  <>
                    {['Fecha','Nota de crédito','Doc. afectado','Cliente','Registrado por','Total','Estado SUNAT','PDF','XML','CDR','Detalle'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </>
                ) : (
                  <>
                    {['Fecha','Comprobante','Cliente','Registrado por','Total','Estado SUNAT','CPE','PDF','XML','CDR','Acciones'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
            {loading ? (
              Array.from({ length: TABLE_SKELETON_ROWS }).map((_, idx) => (
                <tr key={`billing-skeleton-${idx}`} className="border-b border-gray-50">
                  <td colSpan={11} className="px-4 py-3">
                    <div className="h-4 w-full max-w-[780px] animate-pulse rounded bg-gray-100" />
                  </td>
                </tr>
              ))
            ) : sales.map(s => {
              const bs = normalizeBillingStatus(s.billing_status)
              const showXmlSigned = canShowXmlSent(bs)
              const showXmlGenerated = canShowXmlGenerated(bs)
              const showCdr = canShowCdr(bs)
              return (
              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500 text-xs">{formatDisplayDatePeru(s.issue_date)}</td>
                <td className="px-4 py-3">
                  <p className="text-xs text-gray-400">{s.doc_type}</p>
                  <p className="font-mono font-bold text-gray-800">
                    {formatSaleDocumentNumber(s.series, s.number)}
                    {isSaleCancelled(s) && (
                      <span className="ml-2 text-[10px] font-semibold uppercase text-red-600 not-italic font-sans">
                        Anulada
                      </span>
                    )}
                  </p>
                  {viewMode === 'invoices' && (
                    <div className="mt-1">
                      <BillingOperationTypeBadge operationTypeCode={s.operation_type_code} />
                    </div>
                  )}
                </td>
                {viewMode === 'credit_notes' && (
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {s.original_sale_id != null ? `Venta #${s.original_sale_id}` : '—'}
                  </td>
                )}
                <td className="px-4 py-3 text-gray-600 text-sm">{s.contact_name ?? 'Sin cliente'}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{s.user_name ?? '—'}</td>
                <td className="px-4 py-3 font-semibold text-gray-800">S/ {Number(s.total).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${billingStatusColor(s.billing_status)}`}>
                    {billingStatusLabel(s.billing_status)}
                  </span>
                </td>
                {viewMode === 'invoices' && (
                  <td className="px-4 py-3">
                    {s.linked_perception ? (
                      <FiscalLinkedDocBadge
                        doc={s.linked_perception}
                        kind="perception"
                        onClick={() => void salesService.get(s.id).then(setDetail)}
                      />
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <RowMenu
                      title="PDF del comprobante"
                      triggerIcon={<FileText size={14} className="text-red-600" />}
                      triggerClassName="inline-flex items-center gap-0.5 p-1.5 text-red-600 hover:bg-red-50 rounded-lg ring-1 ring-red-200/80"
                      items={[
                        { icon: <Eye size={14} className="text-red-600" />, label: 'Ver PDF A4', onClick: () => void openLocalPdfViewer(s.id, 'a4') },
                        { icon: <Download size={14} className="text-red-600" />, label: 'Descargar PDF A4', onClick: () => void downloadLocalPdf(s.id, 'a4') },
                        { icon: <Ticket size={14} className="text-orange-700" />, label: 'Ver PDF ticket', onClick: () => void openLocalPdfViewer(s.id, 'ticket') },
                        { icon: <FileDown size={14} className="text-orange-700" />, label: 'Descargar PDF ticket', onClick: () => void downloadLocalPdf(s.id, 'ticket') },
                      ]}
                    />
                    <PrintDocButton
                      loadPrintData={() => salesService.get(s.id).then((d) => d.print_data)}
                      webFormat="ticket"
                      title="Imprimir (ticketera en app / PDF en web)"
                      className="inline-flex items-center justify-center p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <RowMenu
                    title="XML"
                    triggerIcon={<FileCode size={14} className="text-amber-600" />}
                    triggerClassName="inline-flex items-center gap-0.5 p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg ring-1 ring-amber-200/80"
                    items={[
                      {
                        hidden: !showXmlSigned,
                        icon: <FileCode size={14} className="text-amber-600" />,
                        label: 'XML firmado (SUNAT)',
                        disabled: downloadingDoc?.saleId === s.id && downloadingDoc?.type === 'xml',
                        onClick: () => {
                          setDownloadingDoc({ saleId: s.id, type: 'xml' })
                          billingService.downloadDocument(s.id, 'xml')
                            .catch(e => toast.error(e?.message ?? 'Error al descargar'))
                            .finally(() => setDownloadingDoc(null))
                        },
                      },
                      {
                        hidden: !showXmlGenerated,
                        icon: <Download size={14} className="text-amber-500" />,
                        label: 'XML generado (local)',
                        disabled: downloadingDoc?.saleId === s.id && downloadingDoc?.type === 'xml-generated',
                        onClick: () => {
                          setDownloadingDoc({ saleId: s.id, type: 'xml-generated' })
                          billingService.downloadDocument(s.id, 'xml-generated')
                            .catch(e => toast.error(e?.message ?? 'Error al descargar'))
                            .finally(() => setDownloadingDoc(null))
                        },
                      },
                    ]}
                  />
                </td>
                <td className="px-4 py-3">
                  <RowMenu
                    title="CDR"
                    triggerIcon={<Archive size={14} className="text-blue-600" />}
                    triggerClassName="inline-flex items-center gap-0.5 p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg ring-1 ring-blue-200/80"
                    items={[
                      {
                        hidden: !showCdr,
                        icon: <Archive size={14} className="text-blue-600" />,
                        label: 'Descargar CDR',
                        disabled: downloadingDoc?.saleId === s.id && downloadingDoc?.type === 'cdr',
                        onClick: () => {
                          setDownloadingDoc({ saleId: s.id, type: 'cdr' })
                          billingService.downloadDocument(s.id, 'cdr')
                            .catch(e => toast.error(e?.message ?? 'Error al descargar'))
                            .finally(() => setDownloadingDoc(null))
                        },
                      },
                    ]}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap items-center">
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        data-wa-trigger={s.id}
                        disabled={waBusyId === s.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (waMenu?.saleId === s.id) {
                            setWaMenu(null)
                            return
                          }
                          const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                          const w = 168
                          setWaMenu({
                            saleId: s.id,
                            top: r.bottom + 6,
                            left: Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w)),
                          })
                        }}
                        className="inline-flex items-center gap-0.5 p-1.5 text-green-600 hover:bg-green-50 rounded-lg ring-1 ring-green-200/80 disabled:opacity-40"
                        title="WhatsApp: enviar imagen (elegir A4 o ticket)"
                      >
                        {waBusyId === s.id ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <>
                            <WhatsAppGlyph className="w-5 h-5" />
                            <ChevronDown size={12} className="text-green-700/90" aria-hidden />
                          </>
                        )}
                      </button>
                    </div>
                    <RowMenu
                      title="Más acciones"
                      triggerIcon={<MoreVertical size={16} />}
                      triggerClassName="inline-flex items-center gap-0.5 p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg ring-1 ring-gray-200 disabled:opacity-40"
                      items={[
                        {
                          hidden: !(viewMode === 'invoices' && s.billing_status === 'pending' && !isSaleCancelled(s)),
                          icon: <Send size={14} className="text-blue-600" />,
                          label: 'Enviar a SUNAT',
                          disabled: sending === s.id,
                          onClick: () => void handleSend(s.id),
                        },
                        {
                          hidden: !(viewMode === 'invoices' && canVoidWithCreditNote(s)),
                          icon: <FileSignature size={14} className="text-orange-600" />,
                          label: 'Anular con nota de crédito',
                          danger: true,
                          disabled: voidNcSubmitting && voidNcTarget?.id === s.id,
                          onClick: () => openVoidNcModal(s),
                        },
                        {
                          hidden: !(viewMode === 'invoices' && bs === 'accepted' && !isSaleCancelled(s)),
                          icon: <Truck size={14} className="text-emerald-600" />,
                          label: 'Generar guía de remisión',
                          disabled: guiaLoadingSaleId === s.id,
                          onClick: () => void openGuiaFromSale(s.id),
                        },
                        {
                          hidden: !(s.billing_status === 'error' && !isSaleCancelled(s)),
                          icon: <RefreshCw size={14} className="text-amber-600" />,
                          label: 'Reenviar a SUNAT',
                          disabled: resending === s.id,
                          onClick: () => void handleResend(s.id),
                        },
                        {
                          icon: <Eye size={14} className="text-gray-500" />,
                          label: 'Ver detalle',
                          onClick: () => void openDetail(s.id),
                        },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
        </div>
        {!loading && sales.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">
            {viewMode === 'credit_notes' ? 'Sin notas de crédito para este filtro' : 'Sin comprobantes para este filtro'}
          </div>
        )}
      </div>

      {/* Paginación */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 py-2 px-1">
          <p className="text-sm text-gray-600">
            Mostrando {(page - 1) * perPage + 1}-{Math.min(page * perPage, total)} de {total} {viewMode === 'credit_notes' ? 'notas de crédito' : 'comprobantes'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-600">
              Página {page} de {Math.max(1, Math.ceil(total / perPage))}
            </span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(Math.ceil(total / perPage), p + 1))}
              disabled={page >= Math.ceil(total / perPage)}
              className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Modal de detalle SUNAT */}
      <Modal
        open={detailLoading || !!detail}
        onClose={() => setDetail(null)}
        contentClassName="max-w-4xl"
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h3 className="font-bold text-gray-800">Detalle SUNAT</h3>
          <button
            onClick={() => setDetail(null)}
            className="p-1.5 hover:bg-gray-100 rounded-lg"
          >
            <X size={16} />
          </button>
        </div>
        {detailLoading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
        ) : detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-gray-400">Comprobante</p><p className="font-mono font-bold">{formatSaleDocumentNumber(detail.sale.series, detail.sale.number)}</p></div>
              <div><p className="text-xs text-gray-400">Estado</p><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${billingStatusColor(detail.sale.billing_status)}`}>{billingStatusLabel(detail.sale.billing_status)}</span></div>
              <div><p className="text-xs text-gray-400">Total</p><p className="font-bold">S/ {Number(detail.sale.total).toFixed(2)}</p></div>
              <div><p className="text-xs text-gray-400">Fecha</p><p>{formatDisplayDatePeru(detail.sale.issue_date)}</p></div>
              {detail.sale.doc_type !== 'NOTA_CREDITO' && detail.sale.doc_type !== 'NOTA_DEBITO' && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400">Tipo operación</p>
                  <BillingOperationTypeBadge operationTypeCode={detail.sale.operation_type_code ?? detail.print_data?.operation_type_code} />
                </div>
              )}
            </div>

            <BillingDetractionDetail
              operationTypeCode={detail.sale.operation_type_code ?? detail.print_data?.operation_type_code}
              fiscal={detail.print_data?.fiscal}
              currency={detail.sale.currency}
            />

            <SalePaymentsBreakdown
              payments={detail.payments}
              invoiceTotal={detail.sale.total}
              detractionAmount={
                detail.detraccion?.detraction_amount_pen ??
                detail.print_data?.fiscal?.detraccion_amount
              }
              netPayable={
                detail.detraccion?.net_payable_pen ??
                detail.print_data?.fiscal?.detraccion_net_payable
              }
              currency={detail.sale.currency}
            />

            <BnConfirmationPanel
              saleId={detail.sale.id}
              detraccion={detail.detraccion}
              onUpdated={async () => {
                const refreshed = await salesService.get(detail.sale.id)
                setDetail(refreshed)
              }}
            />

            {detail.invoice ? (
              <>
                {detail.linked_perception && (
                  <LinkedFiscalDocPanel
                    doc={detail.linked_perception as LinkedFiscalDoc}
                    onStatusRefresh={(updated) => setDetail((d) => (d ? { ...d, linked_perception: updated } : d))}
                    origin={{
                      label: formatSaleDocumentNumber(detail.sale.series, detail.sale.number),
                      sublabel: 'Venta origen',
                    }}
                  />
                )}
                <p className="text-xs font-semibold text-gray-600 uppercase">Envío y respuesta SUNAT</p>
                <SunatResponseDetail
                  billingStatus={detail.sale.billing_status}
                  invoice={detail.invoice}
                  statusLabel={billingStatusLabel(detail.sale.billing_status)}
                  statusColorClass={billingStatusColor(detail.sale.billing_status)}
                />
                {detail.sale.billing_status === 'error' && (
                  <button onClick={() => { handleResend(detail.sale.id); setDetail(null) }} disabled={resending === detail.sale.id}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                    {resending === detail.sale.id ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Reenviar a SUNAT
                  </button>
                )}
                {viewMode === 'invoices' && normalizeBillingStatus(detail.sale.billing_status) === 'accepted' && !isSaleCancelled(detail.sale) && !detail.linked_perception && (
                  <button
                    type="button"
                    onClick={() => openCpeFromSaleDetail(detail)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700"
                  >
                    <Receipt size={14} /> Emitir comprobante de percepción
                  </button>
                )}
                {viewMode === 'invoices' && normalizeBillingStatus(detail.sale.billing_status) === 'accepted' && !isSaleCancelled(detail.sale) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!hasGuiaSeriesForCode(guiaSeries, '09')) {
                        toast.error('Configure una serie Guía Remitente (09) en Empresa → Series')
                        return
                      }
                      setGuiaPrefill(buildDespatchPrefillFromSaleDetail(detail))
                      setGuiaModalOpen(true)
                      setDetail(null)
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700"
                  >
                    <Truck size={14} /> Generar guía de remisión
                  </button>
                )}

                {/* Comprobantes electrónicos: lista de botones */}
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-3">Comprobantes electrónicos</p>
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2 flex-wrap">
                      <FileText size={16} className="text-red-600 shrink-0" />
                      <span className="text-sm text-gray-600 w-12 shrink-0">PDF:</span>
                      <button
                        type="button"
                        disabled={viewingPdfSaleId === detail.sale.id}
                        onClick={() => void openLocalPdfViewer(detail.sale.id, 'a4')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-100 text-red-800 hover:bg-red-200 text-xs font-medium disabled:opacity-70 disabled:cursor-wait"
                        title="Abrir PDF (formato local A4)"
                      >
                        {viewingPdfSaleId === detail.sale.id ? <RefreshCw size={14} className="animate-spin" /> : <Eye size={14} />}
                        Ver
                      </button>
                      <button
                        type="button"
                        disabled={downloadingPdfSaleId === detail.sale.id}
                        onClick={() => void downloadLocalPdf(detail.sale.id, 'a4')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-100 text-red-800 hover:bg-red-200 text-xs font-medium disabled:opacity-70 disabled:cursor-wait"
                        title="Descargar PDF (formato local A4)"
                      >
                        {downloadingPdfSaleId === detail.sale.id ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                        Descargar
                      </button>
                      <button
                        type="button"
                        disabled={viewingTicketPdfSaleId === detail.sale.id}
                        onClick={() => void openLocalPdfViewer(detail.sale.id, 'ticket')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-100 text-orange-900 hover:bg-orange-200 text-xs font-medium disabled:opacity-70 disabled:cursor-wait"
                        title="Abrir PDF formato ticket (80 mm)"
                      >
                        {viewingTicketPdfSaleId === detail.sale.id ? <RefreshCw size={14} className="animate-spin" /> : <Ticket size={14} />}
                        Ticket
                      </button>
                      <button
                        type="button"
                        disabled={downloadingTicketPdfSaleId === detail.sale.id}
                        onClick={() => void downloadLocalPdf(detail.sale.id, 'ticket')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-100 text-orange-900 hover:bg-orange-200 text-xs font-medium disabled:opacity-70 disabled:cursor-wait"
                        title="Descargar PDF formato ticket"
                      >
                        {downloadingTicketPdfSaleId === detail.sale.id ? <RefreshCw size={14} className="animate-spin" /> : <FileDown size={14} />}
                        Ticket ↓
                      </button>
                    </li>
                    {(canShowXmlSent(detail.sale.billing_status) || canShowXmlGenerated(detail.sale.billing_status)) && (
                      <li className="flex items-center gap-2 flex-wrap">
                        <FileCode size={16} className="text-amber-600 shrink-0" />
                        <span className="text-sm text-gray-600 w-12 shrink-0">XML:</span>
                        {canShowXmlSent(detail.sale.billing_status) && (
                          <button
                            type="button"
                            onClick={() => billingService.downloadDocument(detail.sale.id, 'xml').catch(e => toast.error(e?.message ?? 'Error al descargar'))}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-900 hover:bg-amber-200 text-xs font-medium"
                            title="XML firmado enviado a SUNAT"
                          >
                            <Download size={14} />
                            Enviado a SUNAT
                          </button>
                        )}
                        {canShowXmlGenerated(detail.sale.billing_status) && (
                          <button
                            type="button"
                            onClick={() => billingService.downloadDocument(detail.sale.id, 'xml-generated').catch(e => toast.error(e?.message ?? 'Error al descargar'))}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-900 hover:bg-amber-200 text-xs font-medium"
                            title="XML generado (vista previa local, sin envío)"
                          >
                            <Download size={14} />
                            Generado (sin envío)
                          </button>
                        )}
                      </li>
                    )}
                    {canShowCdr(detail.sale.billing_status) && (
                      <li className="flex items-center gap-2 flex-wrap">
                        <Archive size={16} className="text-blue-600 shrink-0" />
                        <span className="text-sm text-gray-600 w-12 shrink-0">CDR:</span>
                        <button
                          type="button"
                          onClick={() => billingService.downloadDocument(detail.sale.id, 'cdr').catch(e => toast.error(e?.message ?? 'Error al descargar'))}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-100 text-blue-800 hover:bg-blue-200 text-xs font-medium"
                          title="Descargar CDR (ZIP)"
                        >
                          <Download size={14} />
                          Descargar
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              </>
            ) : (
              <div className="text-center py-6">
                <p className="text-gray-400 text-sm">Sin respuesta SUNAT disponible</p>
                {detail.sale.billing_status === 'pending' && (
                  <button onClick={() => { handleSend(detail.sale.id); setDetail(null) }}
                    className="mt-3 flex items-center gap-2 mx-auto px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
                    <Send size={14} /> Enviar a SUNAT
                  </button>
                )}
                {detail.sale.billing_status === 'error' && (
                  <button onClick={() => { handleResend(detail.sale.id); setDetail(null) }}
                    className="mt-3 flex items-center gap-2 mx-auto px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700"
                    title="Reenviar el mismo comprobante">
                    <RefreshCw size={14} /> Reenviar a SUNAT
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {waMenu &&
        createPortal(
          <div
            data-wa-portal-menu
            className="fixed z-[300] w-[168px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-sm shadow-xl"
            style={{ top: waMenu.top, left: waMenu.left }}
            role="menu"
            aria-label="Enviar por WhatsApp"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-800 hover:bg-gray-50"
              onClick={() => {
                const id = waMenu.saleId
                setWaMenu(null)
                void handleWhatsAppReceipt(id, 'a4')
              }}
            >
              <FileText size={14} className="text-gray-500 shrink-0" aria-hidden />
              Formato A4
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-800 hover:bg-gray-50"
              onClick={() => {
                const id = waMenu.saleId
                setWaMenu(null)
                void handleWhatsAppReceipt(id, 'ticket')
              }}
            >
              <Ticket size={14} className="text-orange-600 shrink-0" aria-hidden />
              Formato ticket
            </button>
          </div>,
          document.body,
        )}

      {/* Modal independiente para visualizar PDF (reutilizable para otros documentos después) */}
      <DocumentViewerModal
        open={documentViewerOpen}
        onClose={closeDocumentViewer}
        src={documentViewerUrl}
        title={viewMode === 'credit_notes' ? 'Nota de crédito (PDF)' : 'Comprobante PDF'}
      />

      <Modal open={voidNcOpen} onClose={() => !voidNcSubmitting && setVoidNcOpen(false)} contentClassName="max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800">Anular con nota de crédito</h3>
          <button
            type="button"
            onClick={() => setVoidNcOpen(false)}
            disabled={voidNcSubmitting}
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>
        {voidNcTarget && (
          <p className="text-sm text-gray-600 mb-3">
            Comprobante{' '}
            <span className="font-mono font-semibold text-gray-800">
              {formatSaleDocumentNumber(voidNcTarget.series, voidNcTarget.number)}
            </span>
          </p>
        )}
        <p className="text-sm text-gray-600 mb-3">
          El sistema tomará los datos del comprobante aceptado por SUNAT y generará la nota de crédito automáticamente.
        </p>
        <label className="block text-xs font-medium text-gray-600 mb-1">Motivo de anulación (SUNAT) *</label>
        <textarea
          value={voidNcReason}
          onChange={(e) => setVoidNcReason(e.target.value)}
          rows={3}
          placeholder="Ej. Error en el monto, devolución del producto…"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none mb-4"
          disabled={voidNcSubmitting}
        />
        <button
          type="button"
          disabled={voidNcSubmitting}
          onClick={() => void submitVoidWithCreditNote()}
          className="w-full py-2.5 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 disabled:opacity-50"
        >
          {voidNcSubmitting ? 'Procesando…' : 'Generar nota de crédito'}
        </button>
      </Modal>

      <DespatchFormModal
        open={guiaModalOpen}
        onClose={() => { setGuiaModalOpen(false); setGuiaPrefill(null) }}
        onCreated={() => toast.success('Guía encolada. Consulte en Documentos → Guías de remisión.')}
        series={guiaSeries}
        branches={guiaBranches}
        mainBranchId={guiaBranches.find(b => b.name === 'Principal')?.id ?? guiaBranches[0]?.id ?? 1}
        prefill={guiaPrefill}
        title="Generar guía desde comprobante"
      />

      <FiscalRetentionPerceptionModal
        mode="perception"
        open={cpeModalOpen}
        prefill={cpePrefill}
        onClose={() => { setCpeModalOpen(false); setCpePrefill(null) }}
        onCreated={() => {
          setCpeModalOpen(false)
          setCpePrefill(null)
          const sid = cpeSourceSaleId ?? detail?.sale.id
          setCpeSourceSaleId(null)
          toast.success('Percepción encolada. Consulte el estado en Documentos → Percepciones.')
          if (sid) {
            void salesService.get(sid).then((d) => { setDetail(d); load() })
          } else {
            load()
          }
        }}
      />
    </div>
  )
}
