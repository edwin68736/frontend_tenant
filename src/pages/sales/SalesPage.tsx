import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Search, Eye, X, Plus, FileText, ExternalLink, RefreshCw, Download, Ticket, FileDown, ChevronDown } from 'lucide-react'
import { salesService, type Sale, type SaleDetail } from '@/services/sales.service'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { formatDisplayDatePeru, getTodayPeru } from '@/utils/datesPeru'
import { useAuth } from '@/contexts/AuthContext'
import { companyService } from '@/services/company.service'
import { shareReceiptPngViaWhatsApp } from '@/utils/receiptPng'
import { WhatsAppGlyph } from '@/components/icons/WhatsAppGlyph'
import { formatSaleDocumentNumber } from '@/utils/format'
import {
  formatElectronicIssueDocument,
  nvStatusBadgeClass,
  nvStatusEmoji,
  nvStatusKey,
  nvStatusLabel,
  pdfTargetSaleId,
} from '@/utils/saleDisplayDocument'
import { downloadReceiptPdf, openReceiptPdfInNewTab } from '@/utils/receiptPdf'
import { SalePaymentsBreakdown } from '@/components/sales/SalePaymentsBreakdown'
import { formatPaymentMethodLabel } from '@/utils/paymentMethodLabel'
import { formatSaleMoney } from '@/utils/formatMoney'

const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const
const TABLE_SKELETON_ROWS = 6
const getCurrentMonthRange = () => {
  const today = getTodayPeru()
  const [year, month] = today.split('-')
  return { from: `${year}-${month}-01`, to: today }
}

function formatPaymentMethod(code: string) {
  return formatPaymentMethodLabel(code)
}

function rucDigits(docNumber: string) {
  return (docNumber || '').replace(/\D/g, '')
}

function contactHasValidRuc(c?: SaleDetail['contact']) {
  if (!c) return false
  if (String(c.doc_type || '').trim() !== '6') return false
  return rucDigits(c.doc_number || '').length === 11
}

export default function SalesPage() {
  return (
    <RequireModule moduleKey="sales">
      <SalesContent />
    </RequireModule>
  )
}

type SeriesRow = {
  id: number
  series: string
  doc_type: string
  sunat_code?: string
  branch_id: number
}

function SalesContent() {
  const { hasModule, hasPermission } = useAuth()
  const canEmit = hasModule('billing') && hasPermission('sales.create')

  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [dateRange, setDateRange] = useState(() => getCurrentMonthRange())
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [total, setTotal] = useState(0)
  const [detail, setDetail] = useState<SaleDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [emitOpen, setEmitOpen] = useState(false)
  const [emitRow, setEmitRow] = useState<Sale | null>(null)
  const [emitDetail, setEmitDetail] = useState<SaleDetail | null>(null)
  const [emitLoading, setEmitLoading] = useState(false)
  const [emitSubmitting, setEmitSubmitting] = useState(false)
  const [emitDocKind, setEmitDocKind] = useState<'01' | '03'>('03')
  const [emitSeriesId, setEmitSeriesId] = useState<string>('')
  const [emitIssueDate, setEmitIssueDate] = useState(() => getTodayPeru())
  const [emitSeriesList, setEmitSeriesList] = useState<SeriesRow[]>([])
  const [waBusyId, setWaBusyId] = useState<number | null>(null)
  const [waMenu, setWaMenu] = useState<{ saleId: number; top: number; left: number } | null>(null)
  const [pdfPreviewBusyId, setPdfPreviewBusyId] = useState<number | null>(null)
  const [pdfDownloadBusyId, setPdfDownloadBusyId] = useState<number | null>(null)
  const [pdfTicketPreviewBusyId, setPdfTicketPreviewBusyId] = useState<number | null>(null)
  const [pdfTicketDownloadBusyId, setPdfTicketDownloadBusyId] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    return salesService
      .list({
        q: q.trim() || undefined,
        from: dateRange.from || undefined,
        to: dateRange.to || undefined,
        sunat_code: '00',
        page,
        per_page: perPage,
      })
      .then(({ data, total: t }) => {
        setSales(data ?? [])
        setTotal(t ?? 0)
      })
      .catch(() => toast.error('Error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void load()
  }, [q, dateRange.from, dateRange.to, page, perPage])

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

  const openDetail = async (id: number) => {
    setDetailLoading(true)
    try {
      setDetail(await salesService.get(id))
    } catch {
      toast.error('Error cargando detalle')
    } finally {
      setDetailLoading(false)
    }
  }

  const openEmit = async (row: Sale) => {
    if (!canEmit) {
      toast.error('No tiene permiso o falta el módulo de facturación')
      return
    }
    if (row.electronic_issue_sale_id) {
      toast.info('Esta nota ya tiene comprobante electrónico emitido')
      return
    }
    setEmitRow(row)
    setEmitOpen(true)
    setEmitDocKind('03')
    setEmitSeriesId('')
    setEmitIssueDate(getTodayPeru())
    setEmitDetail(null)
    setEmitLoading(true)
    try {
      const [det, rawSeries] = await Promise.all([
        salesService.get(row.id),
        companyService.listSeries({ branch_id: row.branch_id, category: 'venta' }),
      ])
      setEmitDetail(det)
      const sl = (rawSeries as SeriesRow[]) ?? []
      setEmitSeriesList(sl.filter((s) => String(s.sunat_code || '').trim() === '01' || String(s.sunat_code || '').trim() === '03'))
    } catch {
      toast.error('No se pudieron cargar los datos para emitir')
      setEmitOpen(false)
      setEmitRow(null)
    } finally {
      setEmitLoading(false)
    }
  }

  const filteredSeriesForEmit = useMemo(
    () => emitSeriesList.filter((s) => String(s.sunat_code || '').trim() === emitDocKind),
    [emitSeriesList, emitDocKind],
  )

  const emitCurrency = emitDetail?.sale.currency ?? 'PEN'
  const fmtEmit = (n: number) => formatSaleMoney(n, emitCurrency)

  const submitEmit = async () => {
    if (!emitRow || !emitDetail) return
    if (emitDocKind === '01' && !contactHasValidRuc(emitDetail.contact)) {
      toast.error('Para factura el cliente debe tener RUC (tipo de documento 6) y 11 dígitos')
      return
    }
    const sid = Number(emitSeriesId)
    if (!sid) {
      toast.error('Seleccione una serie de factura o boleta')
      return
    }
    setEmitSubmitting(true)
    try {
      const res = await salesService.issueElectronicFromNota(emitRow.id, {
        series_id: sid,
        issue_date: emitIssueDate.trim() || undefined,
      })
      toast.success(
        `Comprobante generado: ${res.sale?.doc_type ?? ''} ${formatSaleDocumentNumber(res.sale?.series ?? '', res.sale?.number ?? '')}. Envíelo a SUNAT desde Facturación.`,
      )
      setEmitOpen(false)
      setEmitRow(null)
      setEmitDetail(null)
      void load()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'No se pudo emitir el comprobante')
    } finally {
      setEmitSubmitting(false)
    }
  }

  const openNotaPdfPreview = async (saleId: number) => {
    setPdfPreviewBusyId(saleId)
    try {
      const d = await salesService.get(saleId)
      if (!d.print_data) {
        toast.error('No hay datos para generar el PDF del comprobante.')
        return
      }
      await openReceiptPdfInNewTab(d.print_data, 'a4')
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'No se pudo abrir el PDF')
    } finally {
      setPdfPreviewBusyId(null)
    }
  }

  const downloadNotaPdf = async (saleId: number) => {
    setPdfDownloadBusyId(saleId)
    try {
      const d = await salesService.get(saleId)
      if (!d.print_data) {
        toast.error('No hay datos para generar el PDF del comprobante.')
        return
      }
      await downloadReceiptPdf(d.print_data, 'a4')
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'No se pudo descargar el PDF')
    } finally {
      setPdfDownloadBusyId(null)
    }
  }

  const openNotaPdfTicketPreview = async (saleId: number) => {
    setPdfTicketPreviewBusyId(saleId)
    try {
      const d = await salesService.get(saleId)
      if (!d.print_data) {
        toast.error('No hay datos para generar el PDF del comprobante.')
        return
      }
      await openReceiptPdfInNewTab(d.print_data, 'ticket')
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'No se pudo abrir el PDF ticket')
    } finally {
      setPdfTicketPreviewBusyId(null)
    }
  }

  const downloadNotaPdfTicket = async (saleId: number) => {
    setPdfTicketDownloadBusyId(saleId)
    try {
      const d = await salesService.get(saleId)
      if (!d.print_data) {
        toast.error('No hay datos para generar el PDF del comprobante.')
        return
      }
      await downloadReceiptPdf(d.print_data, 'ticket')
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'No se pudo descargar el PDF ticket')
    } finally {
      setPdfTicketDownloadBusyId(null)
    }
  }

  const sendNotaReceiptWhatsApp = async (saleId: number, format: 'a4' | 'ticket') => {
    setWaBusyId(saleId)
    const tid = toast.loading(
      format === 'ticket' ? 'Generando imagen ticket para WhatsApp…' : 'Generando imagen A4 para WhatsApp…',
    )
    try {
      const d = await salesService.get(saleId)
      if (!d.print_data) {
        toast.error('No hay datos para generar el comprobante (print_data).', { id: tid })
        return
      }
      await shareReceiptPngViaWhatsApp({
        printData: d.print_data,
        format,
        phone: d.contact?.phone,
        message: `Le envío la nota de venta ${formatSaleDocumentNumber(d.sale.series, d.sale.number)} (${format === 'ticket' ? 'formato ticket' : 'formato A4'})`,
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

  useEffect(() => {
    if (!emitOpen) return
    const first = filteredSeriesForEmit[0]
    setEmitSeriesId((prev) => {
      if (prev && filteredSeriesForEmit.some((s) => String(s.id) === prev)) return prev
      return first ? String(first.id) : ''
    })
  }, [emitOpen, emitDocKind, emitSeriesList])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Notas de venta</h2>
          <p className="text-sm text-gray-500">
            Comprobantes internos.
          </p>
        </div>
        <Link
          to="/sales/nota-venta"
          className="flex items-center gap-2 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
        >
          <Plus size={16} /> Nueva venta
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
            placeholder="Buscar por cliente, serie o número..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
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
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 whitespace-nowrap">Mostrar</span>
          <select
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value))
              setPage(1)
            }}
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-600 whitespace-nowrap">por página</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Fecha', 'Comprobante', 'Cliente', 'Registrado por', 'Total', 'PDF', 'Estado', 'Acciones'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: TABLE_SKELETON_ROWS }).map((_, idx) => (
                  <tr key={`sales-skeleton-${idx}`} className="border-b border-gray-50">
                    <td colSpan={8} className="px-4 py-3">
                      <div className="h-4 w-full max-w-[680px] animate-pulse rounded bg-gray-100" />
                    </td>
                  </tr>
                ))
              ) : sales.map((s) => {
                const nvKey = nvStatusKey(s)
                const issuedDoc = formatElectronicIssueDocument(s)
                const pdfId = pdfTargetSaleId(s)
                return (
                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDisplayDatePeru(s.issue_date)}</td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs text-gray-700">{s.doc_type}</p>
                    <p className="font-bold text-gray-800 text-sm">
                      {formatSaleDocumentNumber(s.series, s.number)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.contact_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{s.user_name ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">S/ {Number(s.total).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={pdfPreviewBusyId === pdfId}
                        onClick={() => void openNotaPdfPreview(pdfId)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40"
                        title="Ver PDF A4"
                      >
                        {pdfPreviewBusyId === pdfId ? <RefreshCw size={14} className="animate-spin" /> : <Eye size={14} />}
                      </button>
                      <button
                        type="button"
                        disabled={pdfDownloadBusyId === pdfId}
                        onClick={() => void downloadNotaPdf(pdfId)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40"
                        title="Descargar PDF A4"
                      >
                        {pdfDownloadBusyId === pdfId ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                      </button>
                      <button
                        type="button"
                        disabled={pdfTicketPreviewBusyId === pdfId}
                        onClick={() => void openNotaPdfTicketPreview(pdfId)}
                        className="p-1.5 text-orange-700 hover:bg-orange-50 rounded-lg disabled:opacity-40"
                        title="Ver PDF formato ticket (80 mm)"
                      >
                        {pdfTicketPreviewBusyId === pdfId ? <RefreshCw size={14} className="animate-spin" /> : <Ticket size={14} />}
                      </button>
                      <button
                        type="button"
                        disabled={pdfTicketDownloadBusyId === pdfId}
                        onClick={() => void downloadNotaPdfTicket(pdfId)}
                        className="p-1.5 text-orange-700 hover:bg-orange-50 rounded-lg disabled:opacity-40"
                        title="Descargar PDF formato ticket"
                      >
                        {pdfTicketDownloadBusyId === pdfId ? <RefreshCw size={14} className="animate-spin" /> : <FileDown size={14} />}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${nvStatusBadgeClass(nvKey)}`}>
                      <span aria-hidden>{nvStatusEmoji(nvKey)}</span>
                      {nvStatusLabel(nvKey)}
                    </span>
                    {issuedDoc && s.electronic_issue_sale_id ? (
                      <Link
                        to="/billing"
                        state={{ highlightSaleId: s.electronic_issue_sale_id }}
                        className="mt-1 block font-mono text-xs font-semibold text-[rgb(var(--p600))] hover:underline leading-tight"
                        title="Ver comprobante en Facturación"
                      >
                        {issuedDoc}
                      </Link>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-1">
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
                          title="WhatsApp: enviar imagen del comprobante (elegir A4 o ticket)"
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
                      <button
                        type="button"
                        onClick={() => void openDetail(s.id)}
                        className="p-1.5 text-gray-400 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg"
                        title="Ver detalle"
                      >
                        <Eye size={14} />
                      </button>
                      {canEmit && !s.electronic_issue_sale_id && (
                        <button
                          type="button"
                          onClick={() => void openEmit(s)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-[rgb(var(--p600))] border border-[rgb(var(--p200))] hover:bg-[rgb(var(--p50))]"
                          title="Emitir factura o boleta"
                        >
                          <FileText size={14} /> Emitir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
        {!loading && sales.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">Sin notas de venta registradas</div>}
      </div>

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
                const row = sales.find((x) => x.id === waMenu.saleId)
                const id = row ? pdfTargetSaleId(row) : waMenu.saleId
                setWaMenu(null)
                void sendNotaReceiptWhatsApp(id, 'a4')
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
                const row = sales.find((x) => x.id === waMenu.saleId)
                const id = row ? pdfTargetSaleId(row) : waMenu.saleId
                setWaMenu(null)
                void sendNotaReceiptWhatsApp(id, 'ticket')
              }}
            >
              <Ticket size={14} className="text-orange-600 shrink-0" aria-hidden />
              Formato ticket
            </button>
          </div>,
          document.body,
        )}

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 py-2 px-1">
          <p className="text-sm text-gray-600">
            Mostrando {(page - 1) * perPage + 1}-{Math.min(page * perPage, total)} de {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
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
              onClick={() => setPage((p) => Math.min(Math.ceil(total / perPage), p + 1))}
              disabled={page >= Math.ceil(total / perPage)}
              className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      <Modal
        open={emitOpen}
        onClose={() => {
          if (!emitSubmitting) {
            setEmitOpen(false)
            setEmitRow(null)
            setEmitDetail(null)
          }
        }}
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <FileText size={18} /> Emitir comprobante electrónico
          </h3>
          <button
            type="button"
            disabled={emitSubmitting}
            onClick={() => (setEmitOpen(false), setEmitRow(null), setEmitDetail(null))}
            className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>
        {emitLoading || !emitRow ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 max-h-[80vh] overflow-y-auto text-sm">
            <p className="text-xs text-gray-500">
              Nota de venta{' '}
              <span className="font-mono font-semibold text-gray-800">
                {formatSaleDocumentNumber(emitRow.series, emitRow.number)}
              </span>
              . Se registra el comprobante electrónico (misma operación): no se vuelve a descontar{' '}
              <strong>stock ni seriales</strong> y no se duplican movimientos de <strong>caja o bancos</strong>.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Tipo</p>
                <div className="flex gap-3">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="emit-kind" checked={emitDocKind === '03'} onChange={() => setEmitDocKind('03')} />
                    Boleta (03)
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="emit-kind" checked={emitDocKind === '01'} onChange={() => setEmitDocKind('01')} />
                    Factura (01)
                  </label>
                </div>
                {emitDocKind === '01' && (
                  <p className="text-xs text-amber-800 mt-2 bg-amber-50 rounded-lg px-2 py-1.5">
                    Factura: el cliente debe tener <strong>RUC</strong> (tipo doc. 6, 11 dígitos).{' '}
                    {!emitDetail?.contact
                      ? 'Esta venta no tiene cliente asignado.'
                      : !contactHasValidRuc(emitDetail.contact)
                        ? 'El cliente actual no cumple con RUC válido.'
                        : 'Cliente OK para factura.'}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Fecha de emisión</p>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={emitIssueDate}
                  onChange={(e) => setEmitIssueDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Serie y correlativo</p>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={emitSeriesId}
                onChange={(e) => setEmitSeriesId(e.target.value)}
              >
                <option value="">— Seleccione —</option>
                {filteredSeriesForEmit.map((ser) => (
                  <option key={ser.id} value={String(ser.id)}>
                    {ser.series} — {ser.doc_type} ({ser.sunat_code})
                  </option>
                ))}
              </select>
              {filteredSeriesForEmit.length === 0 && (
                <p className="text-xs text-red-600 mt-1">No hay series {emitDocKind === '01' ? 'factura' : 'boleta'} para esta sucursal.</p>
              )}
            </div>

            {emitDetail && (
              <>
                <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase">Comercial</p>
                  <div className="text-xs text-gray-700 flex flex-wrap gap-x-4 gap-y-1">
                    <p>
                      <span className="text-gray-400">Moneda:</span>{' '}
                      {emitCurrency === 'USD' ? 'Dólares (USD)' : 'Soles (PEN)'}
                    </p>
                    {emitCurrency === 'USD' && (
                      <p>
                        <span className="text-gray-400">Tipo de cambio:</span>{' '}
                        {emitDetail.sale.exchange_rate != null && emitDetail.sale.exchange_rate > 0
                          ? Number(emitDetail.sale.exchange_rate).toFixed(3)
                          : '— (obligatorio para emitir)'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase">Cliente</p>
                  {emitDetail.contact ? (
                    <div className="text-xs text-gray-700 space-y-0.5">
                      <p>
                        <span className="text-gray-400">Nombre:</span>{' '}
                        {emitDetail.contact.business_name || emitDetail.contact.trade_name || '—'}
                      </p>
                      <p>
                        <span className="text-gray-400">Doc.:</span> {emitDetail.contact.doc_type || '—'}{' '}
                        {emitDetail.contact.doc_number || '—'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">Sin cliente (válido solo para boleta según montos SUNAT).</p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Ítems</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-100 rounded-xl">
                    {(emitDetail.items ?? []).map((item, i) => (
                      <div key={i} className="flex justify-between gap-2 px-3 py-2 border-b border-gray-50 text-xs">
                        <div>
                          <p className="font-medium text-gray-800">{item.description}</p>
                          <p className="text-gray-400">
                            {item.quantity} × {fmtEmit(Number(item.unit_price))}
                          </p>
                        </div>
                        <p className="font-semibold text-gray-700">{fmtEmit(Number(item.total))}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between font-bold text-gray-900 mt-2 px-1">
                    <span>Total</span>
                    <span>{fmtEmit(Number(emitDetail.sale.total))}</span>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Pagos registrados en la nota</p>
                  <ul className="text-xs space-y-1">
                    {(emitDetail.payments ?? []).length === 0 ? (
                      <li className="text-gray-400">—</li>
                    ) : (
                      (emitDetail.payments ?? []).map((p) => (
                        <li key={p.id} className="flex justify-between border border-gray-100 rounded-lg px-2 py-1">
                          <span>{formatPaymentMethod(p.method)}</span>
                          <span className="font-mono">{fmtEmit(Number(p.amount))}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </>
            )}

            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
              <Link
                to="/billing"
                className="inline-flex items-center gap-1 text-xs text-[rgb(var(--p600))] hover:underline"
                onClick={() => {
                  setEmitOpen(false)
                  setEmitRow(null)
                  setEmitDetail(null)
                }}
              >
                Ir a Facturación <ExternalLink size={12} />
              </Link>
            </div>

            <button
              type="button"
              disabled={
                emitSubmitting
                || !emitSeriesId
                || (emitDocKind === '01' && !contactHasValidRuc(emitDetail?.contact))
                || (emitCurrency === 'USD' && !(emitDetail?.sale.exchange_rate != null && emitDetail.sale.exchange_rate > 0))
              }
              onClick={() => void submitEmit()}
              className="w-full py-2.5 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-medium hover:opacity-95 disabled:opacity-50"
            >
              {emitSubmitting ? 'Generando…' : 'Generar comprobante'}
            </button>
          </div>
        )}
      </Modal>

      <Modal open={detailLoading || !!detail} onClose={() => setDetail(null)}>
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h3 className="font-bold text-gray-800">Detalle de nota de venta</h3>
          <button type="button" onClick={() => setDetail(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={16} />
          </button>
        </div>
        {detailLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          detail && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-gray-400">Tipo</p>
                  <p className="font-medium">{detail.sale.doc_type}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">N°</p>
                  <p className="font-mono font-medium">
                    {formatSaleDocumentNumber(detail.sale.series, detail.sale.number)}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-400">Fecha</p>
                  <p>{formatDisplayDatePeru(detail.sale.issue_date)}</p>
                </div>
              </div>
              <div className="mt-2">
                <p className="text-xs text-gray-400">Comprobante electrónico (SUNAT)</p>
                {detail.sale.electronic_issue_sale_id ? (
                  <p className="text-xs text-emerald-800 bg-emerald-50 rounded-lg px-2 py-1.5 mt-0.5">
                    <span className="font-semibold">
                      {nvStatusEmoji('convertida')} Convertida →{' '}
                      {formatElectronicIssueDocument(detail.sale) ?? `#${detail.sale.electronic_issue_sale_id}`}
                    </span>
                    . Consulte o envíe el comprobante en{' '}
                    <Link to="/billing" className="underline font-medium">
                      Facturación
                    </Link>
                    .
                  </p>
                ) : (
                  <p className="text-xs text-amber-900 bg-amber-50 rounded-lg px-2 py-1.5 mt-0.5">
                    Aún no hay factura ni boleta electrónica para esta nota. Use <strong>Emitir factura o boleta</strong>{' '}
                    abajo. El inventario y los seriales ya se registraron con esta nota; al emitir el comprobante electrónico{' '}
                    <strong>no se vuelve a descontar stock ni seriales</strong>.
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Ítems</p>
                <div className="space-y-1">
                  {(detail.items ?? []).map((item, i) => (
                    <div key={i} className="flex justify-between py-1.5 border-b border-gray-50">
                      <div>
                        <p className="font-medium text-gray-800">{item.description}</p>
                        <p className="text-xs text-gray-400">
                          {item.quantity} × S/ {Number(item.unit_price).toFixed(2)}
                        </p>
                      </div>
                      <p className="font-semibold text-gray-700">S/ {Number(item.total).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
                <div className="pt-2 space-y-1">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>S/ {Number(detail.sale.subtotal).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>IGV</span>
                    <span>S/ {Number(detail.sale.tax_amount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-800">
                    <span>Total</span>
                    <span>S/ {Number(detail.sale.total).toFixed(2)}</span>
                  </div>
                </div>
              </div>
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
              {canEmit && !detail.sale.electronic_issue_sale_id && (
                <button
                  type="button"
                  onClick={() => {
                    const row = detail.sale
                    setDetail(null)
                    void openEmit(row)
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-95"
                >
                  <FileText size={14} /> Emitir factura o boleta
                </button>
              )}
            </div>
          )
        )}
      </Modal>
    </div>
  )
}
