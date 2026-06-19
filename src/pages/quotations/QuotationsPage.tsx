import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  FileText,
  Receipt,
  Zap,
  ChevronDown,
  Eye,
  Download,
  Ticket,
  FileDown,
  Mail,
  RefreshCw,
  UserPlus,
} from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { QuickContactCreateModal } from '@/components/contacts/QuickContactCreateModal'
import { quotationsService, type Quotation, type QuotationConvertTarget } from '@/services/quotations.service'
import { companyService } from '@/services/company.service'
import { contactsService, type Contact } from '@/services/contacts.service'
import { useAuth } from '@/contexts/AuthContext'
import { useBranch } from '@/contexts/BranchContext'
import { formatDisplayDatePeru, getTodayPeru } from '@/utils/datesPeru'
import { formatSaleDocumentNumber } from '@/utils/format'
import { getTipoComprobanteLabel, SUNAT_RUC_LENGTH } from '@/constants/sunat'
import { downloadReceiptPdf, openReceiptPdfInNewTab, printDataToPdfBlob } from '@/utils/receiptPdf'
import type { PrintData } from '@/types/printData'

const PER_PAGE_OPTIONS = [10, 25, 50] as const

const getCurrentMonthRange = () => {
  const today = getTodayPeru()
  const [year, month] = today.split('-')
  return { from: `${year}-${month}-01`, to: today }
}

type SeriesRow = {
  id: number
  series: string
  doc_type: string
  sunat_code?: string
  branch_id: number
}

function statusLabel(status: string) {
  if (status === 'converted') return 'Convertida'
  if (status === 'draft') return 'Borrador'
  return status
}

function rucDigits(docNumber: string) {
  return (docNumber || '').replace(/\D/g, '')
}

function contactHasValidRuc(c?: Contact | null) {
  if (!c) return false
  if (String(c.doc_type || '').trim() !== '6') return false
  return rucDigits(c.doc_number || '').length === SUNAT_RUC_LENGTH
}

export default function QuotationsPage() {
  return (
    <RequireModule moduleKey="sales">
      <QuotationsContent />
    </RequireModule>
  )
}

function QuotationsContent() {
  const navigate = useNavigate()
  const { hasModule, hasPermission } = useAuth()
  const { activeBranchId } = useBranch()
  const canCreate = hasPermission('sales.create')
  const canEmit = hasModule('billing') && canCreate

  const [rows, setRows] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [dateRange, setDateRange] = useState(getCurrentMonthRange)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [total, setTotal] = useState(0)
  const [actionsMenu, setActionsMenu] = useState<{ quotationId: number; top: number; left: number } | null>(null)

  const [convertOpen, setConvertOpen] = useState(false)
  const [convertRow, setConvertRow] = useState<Quotation | null>(null)
  const [convertTarget, setConvertTarget] = useState<QuotationConvertTarget>('nota_venta')
  const [convertSeriesId, setConvertSeriesId] = useState('')
  const [convertIssueDate, setConvertIssueDate] = useState(getTodayPeru)
  const [convertSeriesList, setConvertSeriesList] = useState<SeriesRow[]>([])
  const [convertLoading, setConvertLoading] = useState(false)
  const [convertSubmitting, setConvertSubmitting] = useState(false)
  const [convertCustomers, setConvertCustomers] = useState<Contact[]>([])
  const [convertContactId, setConvertContactId] = useState<number | null>(null)
  const [convertAddClientOpen, setConvertAddClientOpen] = useState(false)

  const [pdfPreviewBusyId, setPdfPreviewBusyId] = useState<number | null>(null)
  const [pdfDownloadBusyId, setPdfDownloadBusyId] = useState<number | null>(null)
  const [pdfTicketPreviewBusyId, setPdfTicketPreviewBusyId] = useState<number | null>(null)
  const [pdfTicketDownloadBusyId, setPdfTicketDownloadBusyId] = useState<number | null>(null)

  const [emailOpen, setEmailOpen] = useState(false)
  const [emailRow, setEmailRow] = useState<Quotation | null>(null)
  const [emailAddress, setEmailAddress] = useState('')
  const [emailFormat, setEmailFormat] = useState<'a4' | 'ticket'>('a4')
  const [emailSubmitting, setEmailSubmitting] = useState(false)

  const fetchPrintData = async (id: number): Promise<PrintData | null> => {
    const d = await quotationsService.get(id)
    if (!d.print_data) {
      toast.error('No hay datos para generar el PDF de la cotización.')
      return null
    }
    return d.print_data
  }

  const openQuotationPdfPreview = async (id: number) => {
    setPdfPreviewBusyId(id)
    try {
      const pd = await fetchPrintData(id)
      if (pd) await openReceiptPdfInNewTab(pd, 'a4')
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'No se pudo abrir el PDF')
    } finally {
      setPdfPreviewBusyId(null)
    }
  }

  const downloadQuotationPdf = async (id: number) => {
    setPdfDownloadBusyId(id)
    try {
      const pd = await fetchPrintData(id)
      if (pd) await downloadReceiptPdf(pd, 'a4')
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'No se pudo descargar el PDF')
    } finally {
      setPdfDownloadBusyId(null)
    }
  }

  const openQuotationPdfTicketPreview = async (id: number) => {
    setPdfTicketPreviewBusyId(id)
    try {
      const pd = await fetchPrintData(id)
      if (pd) await openReceiptPdfInNewTab(pd, 'ticket')
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'No se pudo abrir el PDF ticket')
    } finally {
      setPdfTicketPreviewBusyId(null)
    }
  }

  const downloadQuotationPdfTicket = async (id: number) => {
    setPdfTicketDownloadBusyId(id)
    try {
      const pd = await fetchPrintData(id)
      if (pd) await downloadReceiptPdf(pd, 'ticket')
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'No se pudo descargar el PDF ticket')
    } finally {
      setPdfTicketDownloadBusyId(null)
    }
  }

  const openEmailModal = async (row: Quotation) => {
    setEmailRow(row)
    setEmailFormat('a4')
    setEmailAddress('')
    setEmailOpen(true)
    try {
      const d = await quotationsService.get(row.id)
      setEmailAddress(d.print_data?.client?.email?.trim() ?? '')
    } catch {
      toast.error('No se pudo cargar el correo del cliente')
    }
  }

  const submitEmail = async () => {
    if (!emailRow) return
    const to = emailAddress.trim()
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      toast.error('Ingrese un correo válido')
      return
    }
    setEmailSubmitting(true)
    try {
      const pd = await fetchPrintData(emailRow.id)
      if (!pd) return
      const blob = await printDataToPdfBlob(pd, emailFormat)
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const result = reader.result
          if (typeof result !== 'string') {
            reject(new Error('No se pudo leer el PDF'))
            return
          }
          const b64 = result.split(',')[1]
          if (!b64) reject(new Error('PDF inválido'))
          else resolve(b64)
        }
        reader.onerror = () => reject(reader.error ?? new Error('Error al leer PDF'))
        reader.readAsDataURL(blob)
      })
      await quotationsService.sendReceiptEmail(emailRow.id, to, base64, emailFormat)
      toast.success('Cotización enviada por correo')
      setEmailOpen(false)
      setEmailRow(null)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'No se pudo enviar el correo')
    } finally {
      setEmailSubmitting(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await quotationsService.list({
        branch_id: activeBranchId || undefined,
        q: q.trim() || undefined,
        from: dateRange.from,
        to: dateRange.to,
        limit: perPage,
        offset: (page - 1) * perPage,
      })
      setRows(res.data ?? [])
      setTotal(res.total ?? 0)
    } catch {
      toast.error('No se pudieron cargar las cotizaciones')
    } finally {
      setLoading(false)
    }
  }, [activeBranchId, q, dateRange.from, dateRange.to, page, perPage])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!actionsMenu) return
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('[data-quotation-actions-portal]')) return
      if (t.closest(`[data-quotation-actions-trigger="${actionsMenu.quotationId}"]`)) return
      setActionsMenu(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [actionsMenu])

  const actionsMenuRow = useMemo(
    () => (actionsMenu ? rows.find((r) => r.id === actionsMenu.quotationId) ?? null : null),
    [actionsMenu, rows],
  )

  const openConvertDirect = async (row: Quotation) => {
    if (!canCreate) {
      toast.error('No tiene permiso para convertir cotizaciones')
      return
    }
    if (row.status === 'converted') {
      toast.info('Esta cotización ya fue convertida')
      return
    }
    setConvertRow(row)
    setConvertTarget('nota_venta')
    setConvertSeriesId('')
    setConvertIssueDate(getTodayPeru())
    setConvertContactId(null)
    setConvertCustomers([])
    setConvertOpen(true)
    setConvertLoading(true)
    try {
      const [raw, detail, customerList] = await Promise.all([
        companyService.listSeries({ branch_id: row.branch_id, category: 'venta' }),
        quotationsService.get(row.id),
        contactsService.list('', 'customer'),
      ])
      setConvertSeriesList((raw as SeriesRow[]) ?? [])
      const customers = Array.isArray(customerList) ? customerList : []
      setConvertCustomers(customers)
      const initialContactId = detail.quotation.contact_id ?? null
      setConvertContactId(initialContactId)
    } catch {
      toast.error('No se pudieron cargar las series')
      setConvertOpen(false)
      setConvertRow(null)
    } finally {
      setConvertLoading(false)
    }
  }

  const filteredSeriesForConvert = useMemo(() => {
    if (convertTarget === 'nota_venta') {
      return convertSeriesList.filter((s) => String(s.sunat_code || '').trim() === '00')
    }
    return convertSeriesList.filter((s) => String(s.sunat_code || '').trim() === convertTarget)
  }, [convertSeriesList, convertTarget])

  const convertCustomersWithRuc = useMemo(
    () => convertCustomers.filter((c) => contactHasValidRuc(c)),
    [convertCustomers],
  )

  const convertCustomerOptions = useMemo(
    () => (convertTarget === '01' ? convertCustomersWithRuc : convertCustomers),
    [convertTarget, convertCustomersWithRuc, convertCustomers],
  )

  const selectedConvertContact = useMemo(
    () => convertCustomers.find((c) => c.id === convertContactId) ?? null,
    [convertCustomers, convertContactId],
  )

  const convertContactOk =
    convertContactId != null &&
    convertContactId > 0 &&
    (convertTarget !== '01' || contactHasValidRuc(selectedConvertContact))

  const convertAddClientDefaultDocType = convertTarget === '01' ? '6' : '1'

  useEffect(() => {
    if (!convertOpen || convertTarget !== '01') return
    if (contactHasValidRuc(selectedConvertContact)) return
    const firstRuc = convertCustomersWithRuc[0]
    setConvertContactId(firstRuc?.id ?? null)
  }, [convertOpen, convertTarget, convertCustomersWithRuc, selectedConvertContact])

  useEffect(() => {
    if (!convertOpen) return
    const first = filteredSeriesForConvert[0]
    setConvertSeriesId((prev) => {
      if (prev && filteredSeriesForConvert.some((s) => String(s.id) === prev)) return prev
      return first ? String(first.id) : ''
    })
  }, [convertOpen, convertTarget, filteredSeriesForConvert])

  const submitConvertDirect = async () => {
    if (!convertRow) return
    const sid = Number(convertSeriesId)
    if (!sid) {
      toast.error('Seleccione una serie')
      return
    }
    if (convertTarget === '01' && !contactHasValidRuc(selectedConvertContact)) {
      toast.error(`La factura requiere un cliente con RUC de ${SUNAT_RUC_LENGTH} dígitos`)
      return
    }
    if (!convertContactId || convertContactId <= 0) {
      toast.error('Seleccione un cliente para la venta')
      return
    }
    setConvertSubmitting(true)
    try {
      const res = await quotationsService.convert(convertRow.id, {
        target: convertTarget,
        series_id: sid,
        issue_date: convertIssueDate.trim() || undefined,
        contact_id: convertContactId,
      })
      const sale = res.sale
      toast.success(
        `Venta generada: ${sale?.doc_type ?? ''} ${formatSaleDocumentNumber(sale?.series ?? '', sale?.number ?? '')}`,
      )
      setConvertOpen(false)
      setConvertRow(null)
      void load()
      if (convertTarget === '01' || convertTarget === '03') {
        navigate('/billing')
      } else {
        navigate('/sales')
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'No se pudo convertir la cotización')
    } finally {
      setConvertSubmitting(false)
    }
  }

  const handleDelete = async (row: Quotation) => {
    if (!canCreate) return
    if (row.status === 'converted') {
      toast.error('No se puede eliminar una cotización convertida')
      return
    }
    if (!window.confirm(`¿Eliminar permanentemente la cotización ${row.number}?`)) return
    try {
      await quotationsService.delete(row.id)
      toast.success('Cotización eliminada')
      void load()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'No se pudo eliminar')
    }
  }

  const openInForm = (row: Quotation, target: 'nota_venta' | 'comprobante') => {
    if (row.status === 'converted') {
      toast.info('Esta cotización ya fue convertida')
      return
    }
    const path =
      target === 'nota_venta'
        ? `/sales/nota-venta?from_quotation=${row.id}`
        : `/sales/register?from_quotation=${row.id}`
    navigate(path)
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Cotizaciones</h2>
          <p className="text-sm text-gray-500">Pre venta — no afectan inventario hasta convertir a venta.</p>
        </div>
        {canCreate && (
          <Link
            to="/quotations/new"
            className="flex items-center gap-2 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
          >
            <Plus size={16} /> Nueva cotización
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
            placeholder="Buscar número o notas..."
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
            setDateRange((p) => ({ ...p, from: e.target.value }))
            setPage(1)
          }}
        />
        <input
          type="date"
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
          value={dateRange.to}
          onChange={(e) => {
            setDateRange((p) => ({ ...p, to: e.target.value }))
            setPage(1)
          }}
        />
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
              {n} / pág.
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Fecha', 'Número', 'Cliente', 'Total', 'Estado', 'PDF', 'Acciones'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50 animate-pulse">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-600">{formatDisplayDatePeru(row.issue_date)}</td>
                      <td className="px-4 py-3 font-mono text-gray-800">{row.number}</td>
                      <td className="px-4 py-3 text-gray-600">{row.contact_name ?? '—'}</td>
                      <td className="px-4 py-3 font-semibold">
                        {row.currency === 'USD' ? '$' : 'S/'} {Number(row.total).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium ${
                            row.status === 'converted'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={pdfPreviewBusyId === row.id}
                            onClick={() => void openQuotationPdfPreview(row.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40"
                            title="Ver PDF A4"
                          >
                            {pdfPreviewBusyId === row.id ? (
                              <RefreshCw size={14} className="animate-spin" />
                            ) : (
                              <Eye size={14} />
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={pdfDownloadBusyId === row.id}
                            onClick={() => void downloadQuotationPdf(row.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40"
                            title="Descargar PDF A4"
                          >
                            {pdfDownloadBusyId === row.id ? (
                              <RefreshCw size={14} className="animate-spin" />
                            ) : (
                              <Download size={14} />
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={pdfTicketPreviewBusyId === row.id}
                            onClick={() => void openQuotationPdfTicketPreview(row.id)}
                            className="p-1.5 text-orange-700 hover:bg-orange-50 rounded-lg disabled:opacity-40"
                            title="Ver PDF ticket"
                          >
                            {pdfTicketPreviewBusyId === row.id ? (
                              <RefreshCw size={14} className="animate-spin" />
                            ) : (
                              <Ticket size={14} />
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={pdfTicketDownloadBusyId === row.id}
                            onClick={() => void downloadQuotationPdfTicket(row.id)}
                            className="p-1.5 text-orange-700 hover:bg-orange-50 rounded-lg disabled:opacity-40"
                            title="Descargar PDF ticket"
                          >
                            {pdfTicketDownloadBusyId === row.id ? (
                              <RefreshCw size={14} className="animate-spin" />
                            ) : (
                              <FileDown size={14} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void openEmailModal(row)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="Enviar por correo"
                          >
                            <Mail size={14} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative inline-block">
                          <button
                            type="button"
                            data-quotation-actions-trigger={row.id}
                            disabled={row.status === 'converted'}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (actionsMenu?.quotationId === row.id) {
                                setActionsMenu(null)
                                return
                              }
                              const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                              const menuW = 224
                              setActionsMenu({
                                quotationId: row.id,
                                top: r.bottom + 6,
                                left: Math.min(window.innerWidth - menuW - 8, Math.max(8, r.right - menuW)),
                              })
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                          >
                            Acciones <ChevronDown size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {!loading && rows.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">Sin cotizaciones registradas</div>
        )}
      </div>

      {actionsMenu &&
        actionsMenuRow &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-quotation-actions-portal
            className="fixed z-[300] w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-sm shadow-xl"
            style={{ top: actionsMenu.top, left: actionsMenu.left }}
            role="menu"
            aria-label="Acciones de cotización"
          >
            {canCreate && (
              <>
                <Link
                  to={`/quotations/${actionsMenuRow.id}/edit`}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-800"
                  role="menuitem"
                  onClick={() => setActionsMenu(null)}
                >
                  <Pencil size={14} /> Editar
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 hover:bg-gray-50 text-red-600"
                  onClick={() => {
                    setActionsMenu(null)
                    void handleDelete(actionsMenuRow)
                  }}
                >
                  <Trash2 size={14} /> Eliminar
                </button>
                <div className="border-t border-gray-100 my-1" />
                <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-400">Convertir directo</p>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-800"
                  onClick={() => {
                    setActionsMenu(null)
                    void openConvertDirect(actionsMenuRow)
                  }}
                >
                  <Zap size={14} /> Conversión directa…
                </button>
                <div className="border-t border-gray-100 my-1" />
                <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-400">Abrir formulario</p>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-800"
                  onClick={() => {
                    setActionsMenu(null)
                    openInForm(actionsMenuRow, 'nota_venta')
                  }}
                >
                  <Receipt size={14} /> Nota de venta
                </button>
                {canEmit && (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-800"
                    onClick={() => {
                      setActionsMenu(null)
                      openInForm(actionsMenuRow, 'comprobante')
                    }}
                  >
                    <FileText size={14} /> Comprobante
                  </button>
                )}
              </>
            )}
          </div>,
          document.body,
        )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-600 self-center">
            Pág. {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}

      <Modal open={convertOpen} onClose={() => setConvertOpen(false)} contentClassName="max-w-md">
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900">Conversión directa</h3>
          <p className="text-sm text-gray-600">
            {convertRow ? `Cotización ${convertRow.number}` : ''} — se creará la venta con los ítems actuales.
          </p>
          {convertLoading ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo destino</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={convertTarget}
                  onChange={(e) => setConvertTarget(e.target.value as QuotationConvertTarget)}
                >
                  <option value="nota_venta">Nota de venta (00)</option>
                  {canEmit && <option value="03">Boleta (03)</option>}
                  {canEmit && <option value="01">Factura (01)</option>}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Serie</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
                  value={convertSeriesId}
                  onChange={(e) => setConvertSeriesId(e.target.value)}
                >
                  <option value="">Seleccionar...</option>
                  {filteredSeriesForConvert.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.series} — {getTipoComprobanteLabel(String(s.sunat_code || ''))}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha emisión</label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={convertIssueDate}
                  onChange={(e) => setConvertIssueDate(e.target.value)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-medium text-gray-600">
                    Cliente
                    {convertTarget === '01' && (
                      <span className="text-red-600"> (RUC obligatorio)</span>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={() => setConvertAddClientOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--p600))] hover:underline"
                  >
                    <UserPlus size={14} /> Nuevo cliente
                  </button>
                </div>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={convertContactId ?? ''}
                  onChange={(e) => setConvertContactId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">
                    {convertTarget === '01' ? 'Seleccionar cliente con RUC…' : 'Seleccionar cliente…'}
                  </option>
                  {convertCustomerOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.business_name || c.trade_name}
                      {c.doc_number ? ` — ${c.doc_type === '6' ? 'RUC' : 'Doc.'} ${c.doc_number}` : ''}
                    </option>
                  ))}
                </select>
                {convertTarget === '01' && convertCustomersWithRuc.length === 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    No hay clientes con RUC válido. Registre uno con «Nuevo cliente».
                  </p>
                )}
                {convertTarget === '01' && convertContactId != null && !contactHasValidRuc(selectedConvertContact) && (
                  <p className="text-xs text-red-600 mt-1">
                    La factura requiere un cliente con RUC válido de {SUNAT_RUC_LENGTH} dígitos.
                  </p>
                )}
                {convertTarget !== '01' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Por defecto el cliente de la cotización; puede elegir otro o registrar uno nuevo.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConvertOpen(false)}
                  className="px-4 py-2 rounded-xl border text-sm text-gray-600"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={convertSubmitting || !convertSeriesId || !convertContactOk}
                  onClick={() => void submitConvertDirect()}
                  className="px-4 py-2 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-medium disabled:opacity-50"
                >
                  {convertSubmitting ? 'Convirtiendo…' : 'Convertir'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <QuickContactCreateModal
        open={convertAddClientOpen}
        onClose={() => setConvertAddClientOpen(false)}
        defaultDocType={convertAddClientDefaultDocType}
        stacked
        onCreated={(contact) => {
          setConvertCustomers((prev) => [...prev.filter((c) => c.id !== contact.id), contact])
          setConvertContactId(contact.id)
          setConvertAddClientOpen(false)
          if (convertTarget === '01' && !contactHasValidRuc(contact)) {
            toast.error(`Registre un RUC de ${SUNAT_RUC_LENGTH} dígitos para facturar`)
          } else {
            toast.success('Cliente registrado')
          }
        }}
      />

      <Modal open={emailOpen} onClose={() => setEmailOpen(false)} contentClassName="max-w-md">
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900">Enviar cotización por correo</h3>
          <p className="text-sm text-gray-600">
            {emailRow ? formatSaleDocumentNumber(emailRow.series, emailRow.number) : ''}
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Correo destino</label>
            <input
              type="email"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
              placeholder="cliente@correo.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Formato PDF</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={emailFormat}
              onChange={(e) => setEmailFormat(e.target.value as 'a4' | 'ticket')}
            >
              <option value="a4">A4</option>
              <option value="ticket">Ticket (80 mm)</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEmailOpen(false)}
              className="px-4 py-2 rounded-xl border text-sm text-gray-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={emailSubmitting || !emailAddress.trim()}
              onClick={() => void submitEmail()}
              className="px-4 py-2 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-medium disabled:opacity-50"
            >
              {emailSubmitting ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
