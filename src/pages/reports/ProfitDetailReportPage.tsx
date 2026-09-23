import { useEffect, useMemo, useState } from 'react'
import { FileDown, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { salesService, type ProfitDetailRow, type ProfitDetailSummary } from '@/services/sales.service'
import { productsService } from '@/services/products.service'
import { companyService } from '@/services/company.service'
import { exportTableToPdf } from '@/utils/exportPdf'
import { exportTableToExcel } from '@/utils/exportExcel'
import type { ExportColumn } from '@/utils/exportPdf'
import { formatDisplayDatePeru, getTodayPeru } from '@/utils/datesPeru'

type Branch = { id: number; name: string }

const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const

const getCurrentMonthRange = () => {
  const today = getTodayPeru()
  const [year, month] = today.split('-')
  return { from: `${year}-${month}-01`, to: today }
}

function fmtMoney(n: unknown): string {
  const x = typeof n === 'number' ? n : Number(n)
  const safe = Number.isFinite(x) ? x : 0
  return `S/ ${safe.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtQty(n: unknown): string {
  const x = typeof n === 'number' ? n : Number(n)
  const safe = Number.isFinite(x) ? x : 0
  return safe.toLocaleString('es-PE', { maximumFractionDigits: 3 })
}

/** "F002" + "F002-00000366" → "F002-00000366" (el backend ya devuelve `number` con la serie
 *  incluida cuando aplica — ver formatSaleComprobante en SalesReportPage.tsx, mismo criterio). */
function formatSeries(series: string, numberRaw: string): string {
  const s = String(series || '').trim()
  const n = String(numberRaw || '').trim()
  if (n.includes('-')) return n
  if (s && n) return `${s}-${n}`
  return n || s
}

const EXPORT_COLS: ExportColumn<ProfitDetailRow>[] = [
  { key: 'issue_date', label: 'Fecha', format: (v: unknown) => formatDisplayDatePeru(String(v ?? '')) },
  { key: 'doc_type', label: 'Comprobante' },
  { key: 'series', label: 'Serie', format: (_v: unknown, row: ProfitDetailRow) => formatSeries(row.series, row.number) },
  { key: 'contact_doc_number', label: 'Ruc/Dni', format: (v: unknown) => String(v ?? '') || '—' },
  { key: 'contact_name', label: 'Comercial' },
  { key: 'product_name', label: 'Detalle' },
  { key: 'quantity', label: 'Cantidad', format: (v: unknown) => fmtQty(v) },
  { key: 'purchase_price', label: 'Precio compra', format: (v: unknown) => Number(v).toFixed(2) },
  { key: 'sale_price', label: 'Precio venta', format: (v: unknown) => Number(v).toFixed(2) },
  { key: 'profit_unit', label: 'Ganancia unidad', format: (v: unknown) => Number(v).toFixed(2) },
  { key: 'profit_total', label: 'Ganancia total', format: (v: unknown) => Number(v).toFixed(2) },
]

export default function ProfitDetailReportPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([])
  const [data, setData] = useState<ProfitDetailRow[]>([])
  const [summary, setSummary] = useState<ProfitDetailSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const currentMonthRange = getCurrentMonthRange()
  const [filters, setFilters] = useState({
    from: currentMonthRange.from,
    to: currentMonthRange.to,
    branch_id: '' as number | '',
    category_id: '' as number | '',
    q: '',
  })
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)

  useEffect(() => {
    Promise.all([
      companyService.listBranches().then((b: Branch[]) => b ?? []),
      productsService.listCategories().then((c) => c ?? []),
    ]).then(([b, c]) => {
      setBranches(b)
      setCategories(c)
    })
  }, [])

  useEffect(() => {
    void load()
    setPage(1)
  }, [filters.from, filters.to, filters.branch_id, filters.category_id, filters.q])

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(data.length / perPage))
    setPage(p => (p > tp ? tp : p))
  }, [data.length, perPage])

  const load = async () => {
    setLoading(true)
    try {
      const params: { from?: string; to?: string; branch_id?: number; category_id?: number; q?: string } = {}
      if (filters.from) params.from = filters.from
      if (filters.to) params.to = filters.to
      if (filters.branch_id) params.branch_id = Number(filters.branch_id)
      if (filters.category_id) params.category_id = Number(filters.category_id)
      if (filters.q.trim()) params.q = filters.q.trim()
      const { data: list, summary: sm } = await salesService.listProfitDetail(params)
      setData(list ?? [])
      setSummary(sm ?? null)
    } catch {
      setData([])
      setSummary(null)
      toast.error('Error al cargar el reporte de utilidades')
    } finally {
      setLoading(false)
    }
  }

  const periodLabel = useMemo(() => {
    const a = filters.from ? formatDisplayDatePeru(filters.from) : '—'
    const b = filters.to ? formatDisplayDatePeru(filters.to) : '—'
    return `${a} → ${b}`
  }, [filters.from, filters.to])

  const totalRows = data.length
  const totalPages = Math.max(1, Math.ceil(totalRows / perPage))
  const effectivePage = Math.min(page, totalPages)

  const pagedData = useMemo(() => {
    const start = (effectivePage - 1) * perPage
    return data.slice(start, start + perPage)
  }, [data, effectivePage, perPage])

  const exportPdf = () => {
    exportTableToPdf<ProfitDetailRow>(
      'Utilidades detallado',
      EXPORT_COLS,
      data,
      `utilidades-detallado-${filters.from || 'todo'}-${filters.to || 'todo'}.pdf`
    )
    toast.success('PDF descargado')
  }

  const exportExcel = async () => {
    try {
      await exportTableToExcel<ProfitDetailRow>(
        'Utilidades',
        EXPORT_COLS,
        data,
        `utilidades-detallado-${filters.from || 'todo'}-${filters.to || 'todo'}.xlsx`
      )
      toast.success('Excel descargado')
    } catch {
      toast.error('Error al exportar Excel')
    }
  }

  const tableCols = 11

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
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
              onChange={e =>
                setFilters(f => ({ ...f, branch_id: e.target.value ? Number(e.target.value) : '' }))
              }
            >
              <option value="">Todas</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Categoría</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.category_id}
              onChange={e =>
                setFilters(f => ({
                  ...f,
                  category_id: e.target.value ? Number(e.target.value) : '',
                }))
              }
            >
              <option value="">Todas</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Buscar producto</label>
            <input
              type="text"
              placeholder="Código o nombre..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.q}
              onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Ganancia = precio de venta − costo del producto al momento de la venta (si no tiene costo registrado, la
          ganancia es el precio de venta completo). Ventas anteriores a esta actualización muestran el costo actual
          del catálogo, no el histórico. Solo ventas no anuladas.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={exportPdf}
            disabled={data.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <FileDown size={14} /> Exportar PDF
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={data.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <FileSpreadsheet size={14} /> Exportar Excel
          </button>
        </div>
      </div>

      {!loading && summary && (
        <>
          <div className="rounded-xl border border-gray-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Resumen del período</p>
            <p className="text-sm text-gray-700 mt-1">{periodLabel}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Total vendido</p>
              <p className="text-xl font-bold text-violet-950">{fmtMoney(summary.total_sales)}</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Ganancia total</p>
              <p className="text-xl font-bold text-emerald-950">{fmtMoney(summary.total_profit)}</p>
            </div>
            <div className="rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Comprobantes</p>
              <p className="text-xl font-bold text-teal-950">{summary.distinct_sales ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Líneas de detalle</p>
              <p className="text-xl font-bold text-amber-950">{summary.line_items ?? 0}</p>
            </div>
          </div>
        </>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
        </div>
      )}

      {!loading && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">#</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Fecha</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Comprobante</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Serie</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Ruc/Dni</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Comercial</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Detalle</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Cantidad</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">P. compra</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">P. venta</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Gan. unidad</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Gan. total</th>
                </tr>
              </thead>
              <tbody>
                {data.length ? (
                  pagedData.map((row, i) => (
                    <tr key={row.sale_item_id} className="border-b border-gray-50 hover:bg-gray-50/80">
                      <td className="px-4 py-2 text-gray-400">{(effectivePage - 1) * perPage + i + 1}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatDisplayDatePeru(row.issue_date)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{row.doc_type}</td>
                      <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{formatSeries(row.series, row.number)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{row.contact_doc_number || '—'}</td>
                      <td className="px-4 py-2 text-gray-900">{row.contact_name}</td>
                      <td className="px-4 py-2 text-gray-700">{row.product_name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtQty(row.quantity)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-600">{fmtMoney(row.purchase_price)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-600">{fmtMoney(row.sale_price)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${row.profit_unit < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                        {fmtMoney(row.profit_unit)}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums font-semibold ${row.profit_total < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {fmtMoney(row.profit_total)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={tableCols} className="px-4 py-10 text-center text-gray-400">
                      No hay registros para los filtros seleccionados
                    </td>
                  </tr>
                )}
              </tbody>
              {data.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 font-semibold">
                    <td colSpan={7} className="px-4 py-2 text-right text-gray-600">TOTAL:</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtQty(data.reduce((s, r) => s + r.quantity, 0))}</td>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(summary?.total_sales ?? 0)}</td>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{fmtMoney(summary?.total_profit ?? 0)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {totalRows > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-3 py-3 bg-gray-50/50">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-gray-600">
                  Mostrando {(effectivePage - 1) * perPage + 1}-{Math.min(effectivePage * perPage, totalRows)} de{' '}
                  {totalRows}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 whitespace-nowrap">Mostrar</span>
                  <select
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                    value={perPage}
                    onChange={e => {
                      setPerPage(Number(e.target.value))
                      setPage(1)
                    }}
                  >
                    {PER_PAGE_OPTIONS.map(n => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-gray-600 whitespace-nowrap">por página</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(effectivePage - 1)}
                  disabled={effectivePage <= 1}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-600">
                  Página {effectivePage} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(effectivePage + 1)}
                  disabled={effectivePage >= totalPages}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
