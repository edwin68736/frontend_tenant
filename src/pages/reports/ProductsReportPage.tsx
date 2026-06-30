import { useEffect, useState } from 'react'
import { FileDown, FileSpreadsheet, Search } from 'lucide-react'
import { toast } from 'sonner'
import { productsService, type ProductReportRow } from '@/services/products.service'
import { companyService } from '@/services/company.service'
import { exportTableToPdf } from '@/utils/exportPdf'
import { exportTableToExcel } from '@/utils/exportExcel'
import type { ExportColumn } from '@/utils/exportPdf'

const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const

function formatStockByBranch(row: ProductReportRow): string {
  if (!row.manage_stock) return '—'
  const branches = row.stock_by_branch ?? []
  if (!branches.length) return String(row.stock_total ?? 0)
  return branches.map(b => `${b.branch_name}: ${b.quantity}`).join('; ')
}

function formatSerials(row: ProductReportRow): string {
  if (!row.manage_series) return '—'
  const n = row.serial_count ?? 0
  const list = row.serials ?? []
  const preview = list.join(', ')
  if (n > list.length) {
    return `${preview}${preview ? ' ' : ''}(+${n - list.length} más)`
  }
  return preview || '0'
}

const COLS: ExportColumn<ProductReportRow>[] = [
  { key: 'code', label: 'Código' },
  { key: 'name', label: 'Nombre' },
  { key: 'category_name', label: 'Categoría', format: (v: unknown) => String(v || '—') },
  { key: 'unit', label: 'Unidad' },
  { key: 'sale_price', label: 'Precio venta', format: (v: unknown) => `S/ ${Number(v).toFixed(2)}` },
  { key: 'purchase_price', label: 'Precio compra', format: (v: unknown) => `S/ ${Number(v).toFixed(2)}` },
  { key: 'manage_stock', label: 'Control stock', format: (v: unknown) => (v ? 'Sí' : 'No') },
  { key: 'stock_total', label: 'Stock total', format: (v: unknown, r) => (r.manage_stock ? String(v ?? 0) : '—') },
  {
    key: 'stock_by_branch',
    label: 'Stock por sucursal',
    format: (_v: unknown, r) => formatStockByBranch(r as ProductReportRow),
  },
  {
    key: 'serials',
    label: 'Series',
    format: (_v: unknown, r) => formatSerials(r as ProductReportRow),
  },
  { key: 'active', label: 'Activo', format: (v: unknown) => (v ? 'Sí' : 'No') },
]

type Branch = { id: number; name: string }

export default function ProductsReportPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [data, setData] = useState<ProductReportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [branchId, setBranchId] = useState<number | ''>('')
  const [searchQ, setSearchQ] = useState('')
  const [stockLessThanRaw, setStockLessThanRaw] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    companyService.listBranches().then((b: Branch[]) => setBranches(b ?? [])).catch(() => {})
  }, [])

  const stockLessThanNum = (() => {
    const t = stockLessThanRaw.trim()
    if (t === '') return undefined
    const n = Number(t)
    if (!Number.isFinite(n) || n < 0) return undefined
    return n
  })()

  const load = async () => {
    setLoading(true)
    try {
      const { data: list, total: t } = await productsService.listReport({
        q: searchQ.trim() || undefined,
        category_id: categoryId || undefined,
        branch_id: branchId || undefined,
        active_only: true,
        page,
        per_page: perPage,
        stock_less_than: stockLessThanNum,
      })
      setData(list ?? [])
      setTotal(t ?? 0)
    } catch {
      toast.error('Error al cargar productos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [categoryId, branchId, searchQ, stockLessThanRaw, page, perPage])

  const exportRows = async (): Promise<ProductReportRow[]> => {
    const { data: list } = await productsService.listReport({
      q: searchQ.trim() || undefined,
      category_id: categoryId || undefined,
      branch_id: branchId || undefined,
      active_only: true,
      page: 1,
      per_page: 10000,
      stock_less_than: stockLessThanNum,
    })
    return list ?? []
  }

  const exportPdf = async () => {
    try {
      const rows = await exportRows()
      if (!rows.length) {
        toast.error('No hay datos para exportar')
        return
      }
      exportTableToPdf<ProductReportRow>('Reporte de productos', COLS, rows, 'reporte-productos.pdf')
      toast.success('PDF descargado')
    } catch {
      toast.error('Error al exportar')
    }
  }

  const exportExcel = async () => {
    try {
      const rows = await exportRows()
      if (!rows.length) {
        toast.error('No hay datos para exportar')
        return
      }
      await exportTableToExcel<ProductReportRow>('Productos', COLS, rows, 'reporte-productos.xlsx')
      toast.success('Excel descargado')
    } catch {
      toast.error('Error al exportar')
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Categoría</label>
            <CategorySelect
              value={categoryId}
              onChange={v => {
                setCategoryId(v)
                setPage(1)
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Sucursal</label>
            <select
              className="w-full min-w-[180px] border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={branchId}
              onChange={e => {
                setBranchId(e.target.value ? Number(e.target.value) : '')
                setPage(1)
              }}
            >
              <option value="">Todas</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Stock menor a</label>
            <input
              type="number"
              min={0}
              step={0.001}
              placeholder="Ej. 10"
              className="w-full min-w-[120px] border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={stockLessThanRaw}
              onChange={e => {
                setStockLessThanRaw(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <p className="text-xs text-gray-500 pb-2 max-w-md">
            {branchId
              ? 'Solo productos con inventario: el umbral compara el stock en la sucursal seleccionada.'
              : 'Solo productos que manejan inventario; sin sucursal, compara el stock total en todas las sucursales.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <div className="relative min-w-[260px] flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
              placeholder="Buscar por nombre, código o descripción..."
              value={searchQ}
              onChange={e => {
                setSearchQ(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => void exportPdf()}
            disabled={total === 0}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <FileDown size={14} /> Exportar PDF
          </button>
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={total === 0}
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
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Código</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Nombre</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Categoría</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Unidad</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">P. venta</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">P. compra</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">
                    {branchId ? 'Stock (sucursal)' : 'Stock total'}
                  </th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Por sucursal</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Series</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Activo</th>
                </tr>
              </thead>
              <tbody>
                {data.length ? (
                  data.map((row, i) => (
                    <tr key={row.id ?? i} className="border-b border-gray-50 align-top">
                      <td className="px-4 py-2 whitespace-nowrap">{row.code}</td>
                      <td className="px-4 py-2">{row.name}</td>
                      <td className="px-4 py-2 text-gray-600">{row.category_name || '—'}</td>
                      <td className="px-4 py-2">{row.unit}</td>
                      <td className="px-4 py-2 whitespace-nowrap">S/ {Number(row.sale_price).toFixed(2)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">S/ {Number(row.purchase_price).toFixed(2)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {row.manage_stock ? String(row.stock_total ?? 0) : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-700 max-w-[220px]">
                        {row.manage_stock ? (
                          (row.stock_by_branch ?? []).length ? (
                            <ul className="list-disc pl-4 space-y-0.5">
                              {(row.stock_by_branch ?? []).map(b => (
                                <li key={`${row.id}-${b.branch_id}`}>
                                  {b.branch_name}: <span className="font-medium">{b.quantity}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-gray-400">Sin movimientos</span>
                          )
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs max-w-[200px]">
                        {row.manage_series ? (
                          <span title={(row.serials ?? []).join(', ')}>
                            {(row.serials ?? []).length ? (
                              <>
                                {(row.serials ?? []).join(', ')}
                                {(row.serial_count ?? 0) > (row.serials ?? []).length && (
                                  <span className="text-gray-500">
                                    {' '}
                                    (+{(row.serial_count ?? 0) - (row.serials ?? []).length} más)
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-gray-400">0 series</span>
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-2">{row.active ? 'Sí' : 'No'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                      Sin productos para los filtros seleccionados
                    </td>
                  </tr>
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

function CategorySelect({ value, onChange }: { value: number | ''; onChange: (v: number | '') => void }) {
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([])
  useEffect(() => {
    productsService.listCategories().then(c => setCategories(c ?? []))
  }, [])
  return (
    <select
      className="w-full min-w-[180px] border border-gray-200 rounded-xl px-3 py-2 text-sm"
      value={value}
      onChange={e => {
        onChange(e.target.value ? Number(e.target.value) : '')
      }}
    >
      <option value="">Todas</option>
      {categories.map(c => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}
