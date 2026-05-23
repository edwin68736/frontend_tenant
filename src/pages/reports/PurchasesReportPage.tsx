import { useEffect, useState } from 'react'
import { FileDown, FileSpreadsheet, Search } from 'lucide-react'
import { toast } from 'sonner'
import { purchasesService, type Purchase } from '@/services/purchases.service'
import { exportTableToPdf } from '@/utils/exportPdf'
import { exportTableToExcel } from '@/utils/exportExcel'
import type { ExportColumn } from '@/utils/exportPdf'
import { formatDisplayDatePeru, getTodayPeru } from '@/utils/datesPeru'

const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const

const COLS: ExportColumn<Purchase>[] = [
  { key: 'issue_date', label: 'Fecha', format: (v: unknown) => (v ? formatDisplayDatePeru(String(v)) : '') },
  { key: 'doc_type', label: 'Tipo' },
  { key: 'series', label: 'Serie' },
  { key: 'number', label: 'Número' },
  { key: 'supplier_name', label: 'Proveedor' },
  { key: 'subtotal', label: 'Subtotal', format: (v: unknown) => `S/ ${Number(v).toFixed(2)}` },
  { key: 'tax_amount', label: 'IGV', format: (v: unknown) => `S/ ${Number(v).toFixed(2)}` },
  { key: 'total', label: 'Total', format: (v: unknown) => `S/ ${Number(v).toFixed(2)}` },
  {
    key: 'status',
    label: 'Estado',
    format: (v: unknown) => (String(v).toLowerCase() === 'cancelled' ? 'Anulada' : 'Recibida'),
  },
]

const getCurrentMonthRange = () => {
  const today = getTodayPeru()
  const [year, month] = today.split('-')
  return { from: `${year}-${month}-01`, to: today }
}

export default function PurchasesReportPage() {
  const [data, setData] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(false)
  const currentMonthRange = getCurrentMonthRange()
  const [filters, setFilters] = useState({
    from: currentMonthRange.from,
    to: currentMonthRange.to,
  })
  const [searchSupplier, setSearchSupplier] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    void load()
  }, [filters.from, filters.to, searchSupplier, page, perPage])

  useEffect(() => {
    setPage(1)
  }, [filters.from, filters.to, searchSupplier])

  const load = async () => {
    setLoading(true)
    try {
      const params: Parameters<typeof purchasesService.list>[0] = {
        page,
        per_page: perPage,
      }
      if (filters.from) params.from = filters.from
      if (filters.to) params.to = filters.to
      if (searchSupplier.trim()) params.q = searchSupplier.trim()
      const { data: list, total: t } = await purchasesService.list(params)
      setData(Array.isArray(list) ? list : [])
      setTotal(Number(t) || 0)
    } catch {
      toast.error('Error al cargar compras')
      setData([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  const totalRows = total
  const totalPages = Math.max(1, Math.ceil(totalRows / perPage))
  const effectivePage = Math.min(page, totalPages)

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(totalRows / perPage))
    setPage(p => (p > tp ? tp : p))
  }, [totalRows, perPage])

  const fetchAllForExport = async (): Promise<Purchase[]> => {
    const params: Parameters<typeof purchasesService.list>[0] = {
      page: 1,
      per_page: 10000,
    }
    if (filters.from) params.from = filters.from
    if (filters.to) params.to = filters.to
    if (searchSupplier.trim()) params.q = searchSupplier.trim()
    const { data: list } = await purchasesService.list(params)
    return Array.isArray(list) ? list : []
  }

  const exportPdf = async () => {
    try {
      const rows = await fetchAllForExport()
      if (!rows.length) {
        toast.error('No hay datos para exportar')
        return
      }
      exportTableToPdf<Purchase>('Reporte de compras', COLS, rows, `reporte-compras-${filters.from || 'todo'}-${filters.to || 'todo'}.pdf`)
      toast.success('PDF descargado')
    } catch {
      toast.error('Error al exportar')
    }
  }

  const exportExcel = async () => {
    try {
      const rows = await fetchAllForExport()
      if (!rows.length) {
        toast.error('No hay datos para exportar')
        return
      }
      await exportTableToExcel<Purchase>('Compras', COLS, rows, `reporte-compras-${filters.from || 'todo'}-${filters.to || 'todo'}.xlsx`)
      toast.success('Excel descargado')
    } catch {
      toast.error('Error al exportar')
    }
  }

  const displayCols = COLS

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Proveedor</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm"
                placeholder="Buscar por nombre o número de documento (RUC, DNI…)"
                value={searchSupplier}
                onChange={e => setSearchSupplier(e.target.value)}
              />
            </div>
          </div>
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
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Por defecto se muestra el mes en curso. La búsqueda incluye también serie y número del comprobante de compra.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={() => void exportPdf()}
            disabled={totalRows === 0}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <FileDown size={14} /> Exportar PDF
          </button>
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={totalRows === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <FileSpreadsheet size={14} /> Exportar Excel
          </button>
        </div>
      </div>
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
                  {displayCols.map(c => (
                    <th key={String(c.key)} className="text-left px-4 py-2 text-xs font-semibold text-gray-500">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length ? (
                  data.map((row, i) => (
                    <tr key={row.id ?? i} className="border-b border-gray-50">
                      {displayCols.map(col => {
                        const val = row[col.key as keyof Purchase]
                        const text = col.format ? col.format(val, row) : String(val ?? '')
                        return (
                          <td key={String(col.key)} className="px-4 py-2">
                            {text}
                          </td>
                        )
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={displayCols.length} className="px-4 py-8 text-center text-gray-400">
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
