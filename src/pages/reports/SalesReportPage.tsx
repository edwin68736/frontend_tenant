import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { FileDown, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { salesService, type Sale, type SaleListSummary } from '@/services/sales.service'
import { companyService } from '@/services/company.service'
import { cashbankService, type PaymentMethodRecord } from '@/services/cashbank.service'
import { exportTableToPdf } from '@/utils/exportPdf'
import { exportTableToExcel, type ExportColumn as ExcelExportColumn } from '@/utils/exportExcel'
import { formatDisplayDatePeru, getTodayPeru } from '@/utils/datesPeru'

type Branch = { id: number; name: string }
type DocTypeFilter = 'all' | 'notes' | 'facturas_boletas' | 'factura' | 'boleta'
type SaleStatusFilter = 'all' | 'active' | 'cancelled'
type PaymentModeFilter = 'all' | 'mixed' | 'single'
const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  card: 'Tarjeta',
  tarjeta: 'Tarjeta',
  transfer: 'Transferencia',
  transferencia: 'Transferencia',
  credito: 'Crédito',
  credit: 'Crédito',
}

function normalizePaymentMethod(code?: string) {
  return String(code || '').trim().toLowerCase()
}

function formatPaymentMethod(code?: string) {
  const normalized = normalizePaymentMethod(code)
  return PAYMENT_LABELS[normalized] || code || 'No definido'
}

const SALE_STATUS_LABELS: Record<string, string> = {
  paid: 'Pagada',
  draft: 'Borrador',
  cancelled: 'Anulada',
  credit: 'Crédito',
}

function formatSaleStatus(status?: string) {
  const k = String(status || '').trim().toLowerCase()
  return SALE_STATUS_LABELS[k] || status || '—'
}

/** El backend suele guardar `number` como SERIE-00001234; no debe concatenarse serie otra vez. */
function formatSaleComprobante(docType: string, series: string, numberRaw: string | number | undefined): string {
  const s = String(series || '').trim()
  const n = String(numberRaw ?? '').trim()
  if (!n && !s) return String(docType || '').trim()
  if (n.includes('-')) {
    return `${docType} ${n}`.trim()
  }
  if (/^\d+$/.test(n) && s) {
    return `${docType} ${s}-${n.padStart(8, '0')}`.trim()
  }
  if (s) {
    return `${docType} ${s}-${n}`.trim()
  }
  return `${docType} ${n}`.trim()
}

/** Colores reconocibles en las tarjetas de totales por método */
function paymentMethodStatCardClasses(code?: string): { wrap: string; label: string; amount: string } {
  const c = normalizePaymentMethod(code)
  if (c === 'yape') {
    return {
      wrap: 'rounded-2xl border border-purple-300 bg-purple-50 px-4 py-3',
      label: 'text-xs font-semibold uppercase tracking-wide text-purple-700',
      amount: 'text-xl font-bold text-purple-900',
    }
  }
  if (c === 'plin') {
    return {
      wrap: 'rounded-2xl border border-teal-300 bg-teal-50 px-4 py-3',
      label: 'text-xs font-semibold uppercase tracking-wide text-teal-700',
      amount: 'text-xl font-bold text-teal-900',
    }
  }
  return {
    wrap: 'rounded-2xl border border-gray-100 bg-white px-4 py-3',
    label: 'text-xs font-semibold uppercase tracking-wide text-gray-500',
    amount: 'text-xl font-bold text-gray-900',
  }
}

const getCurrentMonthRange = () => {
  const today = getTodayPeru()
  const [year, month] = today.split('-')
  return { from: `${year}-${month}-01`, to: today }
}

/** issue_date en ventas es fecha de negocio; evitar corrimiento UTC->Perú al mostrar. */
function formatIssueDate(v: unknown): string {
  const s = String(v || '').trim()
  if (!s) return ''
  const datePart = s.includes('T') ? s.slice(0, 10) : s
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return formatDisplayDatePeru(datePart)
  }
  return formatDisplayDatePeru(s)
}

const fmtMoneyCell = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : ''
}

/** Columnas PDF (string); Excel puede marcar montos como `excelNumber` para celdas numéricas. */
const COLS: ExcelExportColumn<Sale & { doc_display?: string }>[] = [
  { key: 'issue_date', label: 'Fecha', format: formatIssueDate },
  { key: 'doc_display', label: 'Comprobante', format: (_, r) => formatSaleComprobante((r as Sale).doc_type, (r as Sale).series, (r as Sale).number) },
  { key: 'contact_name', label: 'Cliente' },
  { key: 'subtotal', label: 'Subtotal', format: fmtMoneyCell, excelNumber: true },
  { key: 'tax_amount', label: 'IGV', format: fmtMoneyCell, excelNumber: true },
  { key: 'total', label: 'Total', format: fmtMoneyCell, excelNumber: true },
  { key: 'payment_method', label: 'Método pago', format: (v: unknown) => formatPaymentMethod(String(v || '')) },
  { key: 'status', label: 'Estado', format: (v: unknown) => formatSaleStatus(String(v || '')) },
]

export default function SalesReportPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRecord[]>([])
  const [data, setData] = useState<(Sale & { doc_display?: string })[]>([])
  const [summary, setSummary] = useState<SaleListSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchCustomer, setSearchCustomer] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [total, setTotal] = useState(0)
  const currentMonthRange = getCurrentMonthRange()
  const [filters, setFilters] = useState({
    from: currentMonthRange.from,
    to: currentMonthRange.to,
    branch_id: '' as number | '',
    doc_type_group: 'all' as DocTypeFilter,
    payment_method: '',
    payment_mode: 'all' as PaymentModeFilter,
    sale_status: 'all' as SaleStatusFilter,
  })

  /** Solo filtros de búsqueda (sin paginación). */
  const buildFilterParams = (): Parameters<typeof salesService.list>[0] => {
    const params: Parameters<typeof salesService.list>[0] = {}
    if (filters.from) params.from = filters.from
    if (filters.to) params.to = filters.to
    if (filters.branch_id) params.branch_id = Number(filters.branch_id)
    if (filters.doc_type_group === 'notes') params.sunat_code = '00'
    if (filters.doc_type_group === 'facturas_boletas') params.sunat_code = '01,03'
    if (filters.doc_type_group === 'factura') params.sunat_code = '01'
    if (filters.doc_type_group === 'boleta') params.sunat_code = '03'
    if (filters.payment_method) params.payment_method = filters.payment_method
    if (filters.payment_mode !== 'all') params.payment_mode = filters.payment_mode
    if (searchCustomer.trim()) params.q = searchCustomer.trim()
    if (filters.sale_status === 'active') params.sale_status = 'active'
    if (filters.sale_status === 'cancelled') params.sale_status = 'cancelled'
    return params
  }

  const buildListParams = (pageNum: number, pageSize: number): Parameters<typeof salesService.list>[0] => ({
    ...buildFilterParams(),
    per_page: pageSize,
    page: pageNum,
  })

  const load = async () => {
    setLoading(true)
    try {
      const { data: list, total: t, summary: sum } = await salesService.list(buildListParams(page, perPage))
      const withDoc = (list ?? []).map((s) => ({ ...s, doc_display: formatSaleComprobante(s.doc_type, s.series, s.number) }))
      setData(withDoc)
      setTotal(t ?? 0)
      setSummary(sum ?? null)
    } catch {
      toast.error('Error al cargar ventas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    companyService
      .listBranches()
      .then((b: Branch[]) => setBranches(b ?? []))
      .catch(() => setBranches([]))
  }, [])

  useEffect(() => {
    cashbankService
      .listPaymentMethods(true)
      .then((m) => setPaymentMethods(Array.isArray(m) ? m : []))
      .catch(() => setPaymentMethods([]))
  }, [])

  useEffect(() => {
    void load()
  }, [filters.from, filters.to, filters.branch_id, filters.doc_type_group, filters.payment_method, filters.payment_mode, filters.sale_status, searchCustomer, page, perPage])

  const stats = useMemo(() => {
    const s = summary
    if (!s) {
      return {
        amountTotal: 0,
        amountCancelled: 0,
        amountActive: 0,
        methodCards: [] as { code: string; label: string; total: number }[],
      }
    }
    const methodCards = (s.payment_totals ?? []).slice(0, 5).map((pt) => ({
      code: pt.method,
      label: formatPaymentMethod(pt.method),
      total: pt.total,
    }))
    return {
      amountTotal: s.sum_total,
      amountCancelled: s.sum_cancelled,
      amountActive: s.sum_active,
      methodCards,
    }
  }, [summary])

  const exportPdf = async () => {
    setLoading(true)
    try {
      const { data: rows } = await salesService.list({ ...buildFilterParams(), export_all: '1' })
      const withDoc = (rows ?? []).map((s) => ({ ...s, doc_display: formatSaleComprobante(s.doc_type, s.series, s.number) }))
      exportTableToPdf<Sale & { doc_display?: string }>('Reporte de ventas', COLS, withDoc, `reporte-ventas-${filters.from || 'todo'}-${filters.to || 'todo'}.pdf`)
      toast.success('PDF descargado')
    } catch {
      toast.error('Error al exportar')
    } finally {
      setLoading(false)
    }
  }
  const exportExcel = async () => {
    setLoading(true)
    try {
      const { data: rows } = await salesService.list({ ...buildFilterParams(), export_all: '1' })
      const withDoc = (rows ?? []).map((s) => ({ ...s, doc_display: formatSaleComprobante(s.doc_type, s.series, s.number) }))
      exportTableToExcel<Sale & { doc_display?: string }>('Ventas', COLS, withDoc, `reporte-ventas-${filters.from || 'todo'}-${filters.to || 'todo'}.xlsx`)
      toast.success('Excel descargado')
    } catch {
      toast.error('Error al exportar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.from}
              onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.to}
              onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Sucursal</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.branch_id}
              onChange={e => { setFilters(f => ({ ...f, branch_id: e.target.value ? Number(e.target.value) : '' })); setPage(1) }}
            >
              <option value="">Todas</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Comprobante</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.doc_type_group}
              onChange={e => { setFilters(f => ({ ...f, doc_type_group: e.target.value as DocTypeFilter })); setPage(1) }}
            >
              <option value="all">Todos</option>
              <option value="notes">Notas de venta</option>
              <option value="facturas_boletas">Facturas + boletas</option>
              <option value="factura">Solo facturas</option>
              <option value="boleta">Solo boletas</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Método de pago</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.payment_method}
              onChange={e => { setFilters(f => ({ ...f, payment_method: e.target.value })); setPage(1) }}
            >
              <option value="">Todos</option>
              {paymentMethods.map((pm, idx) => (
                <option key={pm.code ? `${pm.code}-${pm.id || idx}` : `pm-${idx}`} value={pm.code}>{pm.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Modo de pago</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.payment_mode}
              onChange={e => { setFilters(f => ({ ...f, payment_mode: e.target.value as PaymentModeFilter })); setPage(1) }}
            >
              <option value="all">Todos</option>
              <option value="mixed">Solo pago mixto</option>
              <option value="single">Solo un método</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Estado venta</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.sale_status}
              onChange={e => { setFilters(f => ({ ...f, sale_status: e.target.value as SaleStatusFilter })); setPage(1) }}
            >
              <option value="all">Todas</option>
              <option value="active">No anuladas</option>
              <option value="cancelled">Anuladas</option>
            </select>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">El filtro de método y modo de pago usa pagos reales registrados en la venta.</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <div className="relative min-w-[260px] flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
              placeholder="Buscar cliente o documento..."
              value={searchCustomer}
              onChange={e => { setSearchCustomer(e.target.value); setPage(1) }}
            />
          </div>
          <button
            type="button"
            onClick={() => void exportPdf()}
            disabled={total === 0 || loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <FileDown size={14} /> Exportar PDF
          </button>
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={total === 0 || loading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <FileSpreadsheet size={14} /> Exportar Excel
          </button>
        </div>
      </div>

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Total no anuladas</p>
            <p className="text-2xl font-bold text-violet-900">S/ {stats.amountActive.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Total anuladas</p>
            <p className="text-2xl font-bold text-orange-900">S/ {stats.amountCancelled.toFixed(2)}</p>
          </div>
          {stats.methodCards.map((card) => {
            const cl = paymentMethodStatCardClasses(card.code)
            return (
              <div key={card.code || card.label} className={cl.wrap}>
                <p className={cl.label}>{card.label}</p>
                <p className={cl.amount}>S/ {card.total.toFixed(2)}</p>
              </div>
            )
          })}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Total general</p>
            <p className="text-2xl font-bold text-slate-900">S/ {stats.amountTotal.toFixed(2)}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
        </div>
      )}

      {!loading && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {COLS.map(c => (
                    <th key={String(c.key)} className="text-left px-4 py-2 text-xs font-semibold text-gray-500">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length ? data.map((row, i) => (
                  <tr key={row.id ?? i} className="border-b border-gray-50">
                    {COLS.map(col => {
                      const val = col.key === 'doc_display'
                        ? formatSaleComprobante(row.doc_type, row.series, row.number)
                        : row[col.key as keyof typeof row]
                      const text = col.format ? col.format(val, row) : String(val ?? '')
                      return <td key={String(col.key)} className="px-4 py-2">{text}</td>
                    })}
                  </tr>
                )) : (
                  <tr><td colSpan={COLS.length} className="px-4 py-8 text-center text-gray-400">No hay registros para los filtros seleccionados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 py-2 px-1">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-gray-600">
              Mostrando {(page - 1) * perPage + 1}-{Math.min(page * perPage, total)} de {total}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 whitespace-nowrap">Mostrar</span>
              <select
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={perPage}
                onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
              >
                {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="text-sm text-gray-600 whitespace-nowrap">por página</span>
            </div>
          </div>
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
    </div>
  )
}
