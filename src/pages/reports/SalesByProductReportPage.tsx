import { Fragment, useEffect, useMemo, useState } from 'react'
import { FileDown, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import {
  salesService,
  type SalesByProductRow,
  type SalesByProductSummary,
} from '@/services/sales.service'
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

const EXPORT_COLS: ExportColumn<SalesByProductRow>[] = [
  { key: 'category_name', label: 'Categoría' },
  { key: 'product_code', label: 'Código' },
  { key: 'product_name', label: 'Producto' },
  { key: 'unit', label: 'Unidad', format: (v: unknown) => String(v || '—') },
  { key: 'quantity_sold', label: 'Cantidad', format: (v: unknown) => Number(v).toFixed(3) },
  { key: 'lines_count', label: 'Líneas', format: (v: unknown) => String(v ?? '') },
  { key: 'sales_count', label: 'Comprobantes', format: (v: unknown) => String(v ?? '') },
  { key: 'total_amount', label: 'Total (S/)', format: (v: unknown) => Number(v).toFixed(2) },
  { key: 'avg_line_amount', label: 'Prom. línea (S/)', format: (v: unknown) => Number(v).toFixed(2) },
]

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

export default function SalesByProductReportPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([])
  const [data, setData] = useState<SalesByProductRow[]>([])
  const [summary, setSummary] = useState<SalesByProductSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const currentMonthRange = getCurrentMonthRange()
  const [filters, setFilters] = useState({
    from: currentMonthRange.from,
    to: currentMonthRange.to,
    branch_id: '' as number | '',
    category_id: '' as number | '',
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
  }, [filters.from, filters.to, filters.branch_id, filters.category_id])

  useEffect(() => {
    setPage(1)
  }, [filters.from, filters.to, filters.branch_id, filters.category_id])

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(data.length / perPage))
    setPage(p => (p > tp ? tp : p))
  }, [data.length, perPage])

  const load = async () => {
    setLoading(true)
    try {
      const params: { from?: string; to?: string; branch_id?: number; category_id?: number } = {}
      if (filters.from) params.from = filters.from
      if (filters.to) params.to = filters.to
      if (filters.branch_id) params.branch_id = Number(filters.branch_id)
      if (filters.category_id) params.category_id = Number(filters.category_id)
      const { data: list, summary: sm } = await salesService.listByProduct(params)
      setData(list ?? [])
      setSummary(sm ?? null)
    } catch {
      setData([])
      setSummary(null)
      toast.error('Error al cargar ventas por producto')
    } finally {
      setLoading(false)
    }
  }

  const periodLabel = useMemo(() => {
    const a = filters.from ? formatDisplayDatePeru(filters.from) : '—'
    const b = filters.to ? formatDisplayDatePeru(filters.to) : '—'
    return `${a} → ${b}`
  }, [filters.from, filters.to])

  const branchLabel = useMemo(() => {
    if (!filters.branch_id) return 'Todas las sucursales'
    return branches.find(x => x.id === filters.branch_id)?.name ?? 'Sucursal'
  }, [filters.branch_id, branches])

  const categoryLabel = useMemo(() => {
    if (!filters.category_id) return 'Todas las categorías'
    return categories.find(x => x.id === filters.category_id)?.name ?? 'Categoría'
  }, [filters.category_id, categories])

  const totalRows = data.length
  const totalPages = Math.max(1, Math.ceil(totalRows / perPage))
  const effectivePage = Math.min(page, totalPages)

  const pagedData = useMemo(() => {
    const start = (effectivePage - 1) * perPage
    return data.slice(start, start + perPage)
  }, [data, effectivePage, perPage])

  const exportPdf = () => {
    exportTableToPdf<SalesByProductRow>(
      'Ventas por producto',
      EXPORT_COLS,
      data,
      `ventas-por-producto-${filters.from || 'todo'}-${filters.to || 'todo'}.pdf`
    )
    toast.success('PDF descargado')
  }

  const exportExcel = () => {
    exportTableToExcel<SalesByProductRow>(
      'Ventas por producto',
      EXPORT_COLS,
      data,
      `ventas-por-producto-${filters.from || 'todo'}-${filters.to || 'todo'}.xlsx`
    )
    toast.success('Excel descargado')
  }

  const tableCols = 8

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
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Solo ventas no anuladas. Los totales inferiores coinciden con el período y filtros seleccionados.
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
            <p className="text-xs text-gray-600 mt-0.5">
              {branchLabel} · {categoryLabel}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Total vendido</p>
              <p className="text-xl font-bold text-violet-950">{fmtMoney(summary.total_amount)}</p>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Unidades</p>
              <p className="text-xl font-bold text-sky-950">{fmtQty(summary.total_quantity)}</p>
            </div>
            <div className="rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Comprobantes</p>
              <p className="text-xl font-bold text-teal-950">{summary.distinct_sales ?? 0}</p>
              <p className="text-[11px] text-teal-800/80 mt-0.5">Ventas distintas en el período</p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Líneas de detalle</p>
              <p className="text-xl font-bold text-amber-950">{summary.line_items ?? 0}</p>
              <p className="text-[11px] text-amber-900/80 mt-0.5">Ítems en todas las ventas</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Productos</p>
              <p className="text-xl font-bold text-slate-900">{summary.products_count ?? 0}</p>
              <p className="text-[11px] text-slate-600 mt-0.5">En este ranking</p>
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
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Código</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Producto</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Und.</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Cantidad</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Líneas</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Cmpr.</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Total</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Prom. línea</th>
                </tr>
              </thead>
              <tbody>
                {data.length ? (
                  pagedData.map((row, i) => {
                    const prevCat = i > 0 ? pagedData[i - 1].category_name : null
                    const showHeader = row.category_name !== prevCat
                    return (
                      <Fragment key={`${row.product_id}-${(effectivePage - 1) * perPage + i}`}>
                        {showHeader && (
                          <tr className="bg-slate-100/90">
                            <td
                              colSpan={tableCols}
                              className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700"
                            >
                              {row.category_name}
                            </td>
                          </tr>
                        )}
                        <tr className="border-b border-gray-50 hover:bg-gray-50/80">
                          <td className="px-4 py-2 font-mono text-xs">{row.product_code || '—'}</td>
                          <td className="px-4 py-2 text-gray-900">{row.product_name}</td>
                          <td className="px-4 py-2 text-gray-600">{row.unit || '—'}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{fmtQty(row.quantity_sold)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-gray-700">{row.lines_count ?? 0}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-gray-700">{row.sales_count ?? 0}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">
                            {fmtMoney(row.total_amount)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                            {fmtMoney(row.avg_line_amount)}
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={tableCols} className="px-4 py-10 text-center text-gray-400">
                      No hay registros para los filtros seleccionados
                    </td>
                  </tr>
                )}
              </tbody>
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
