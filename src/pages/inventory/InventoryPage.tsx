import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Search, Package, SlidersHorizontal, History, ArrowRightLeft, ChevronDown, ChevronUp, CalendarClock, PackagePlus, PackageMinus, FileSpreadsheet } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { FilterSwitch } from '@/components/ui/FilterSwitch'
import { StockAdjustmentModal } from '@/components/inventory/StockAdjustmentModal'
import { ProductKardexModal } from '@/components/inventory/ProductKardexModal'
import { ProductTransferModal } from '@/components/inventory/ProductTransferModal'
import { productsService, type ProductReportRow } from '@/services/products.service'
import { companyService } from '@/services/company.service'
import { useBranch } from '@/contexts/BranchContext'
import {
  getProductExpiryStatus,
  formatExpiryDisplay,
  PRODUCT_EXPIRY_BADGE_CLASS,
  expiryStatusLabel,
} from '@/utils/productExpiry'

const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const
/** Con filtros "solo cliente" (bajo mínimo / por vencer) se trae todo el catálogo filtrado por
 * búsqueda/categoría/sucursal y se pagina en el cliente, igual que el reporte de stock de
 * Tukichef: el umbral (mínimo propio, días a vencer) es por producto, no un valor fijo de API. */
const CLIENT_FILTER_FETCH_LIMIT = 5000
/** Debounce de búsqueda: cada letra ya no dispara una petición. */
const SEARCH_DEBOUNCE_MS = 350

type Branch = { id: number; name: string }
type Category = { id: number; name: string }

function stockNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

type StockStatus = 'out' | 'low' | 'ok'

function stockStatus(row: ProductReportRow): StockStatus {
  const stock = stockNum(row.stock_total)
  const min = stockNum(row.min_stock)
  if (stock <= 0) return 'out'
  if (min > 0 && stock <= min) return 'low'
  return 'ok'
}

/** Semáforo: mismos colores para el badge de "Estado" y para el número de "Stock". */
const STATUS_BADGE: Record<StockStatus, string> = {
  out: 'bg-red-50 text-red-600 border-red-200',
  low: 'bg-amber-50 text-amber-700 border-amber-200',
  ok: 'bg-green-50 text-green-700 border-green-200',
}

const STATUS_LABEL: Record<StockStatus, string> = {
  out: 'Sin stock',
  low: 'Bajo mínimo',
  ok: 'OK',
}

function isExpiringSoon(row: ProductReportRow): boolean {
  if (!row.has_expiry_date || !row.expiry_date) return false
  return getProductExpiryStatus(row.expiry_date) !== 'ok'
}


export default function InventoryPage() {
  return (
    <RequireModule moduleKey="inventory">
      <InventoryContent />
    </RequireModule>
  )
}

function InventoryContent() {
  const { activeBranchId } = useBranch()
  const [branches, setBranches] = useState<Branch[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [branchId, setBranchId] = useState<number | ''>('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [expiringSoonOnly, setExpiringSoonOnly] = useState(false)
  const [stockLessThanInput, setStockLessThanInput] = useState('')
  const [stockLessThanRaw, setStockLessThanRaw] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)

  const [rows, setRows] = useState<ProductReportRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [adjustmentProduct, setAdjustmentProduct] = useState<ProductReportRow | null>(null)
  const [kardexProduct, setKardexProduct] = useState<ProductReportRow | null>(null)
  const [transferProduct, setTransferProduct] = useState<ProductReportRow | null>(null)

  // Búsqueda con debounce: la petición se dispara SEARCH_DEBOUNCE_MS después de dejar de escribir.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [qInput])

  // Mismo debounce para "Stock menor a": evita una petición por cada dígito tecleado.
  useEffect(() => {
    const t = setTimeout(() => setStockLessThanRaw(stockLessThanInput), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [stockLessThanInput])

  useEffect(() => {
    Promise.all([companyService.listBranches(), productsService.listCategories()])
      .then(([b, c]) => {
        setBranches((b ?? []) as Branch[])
        setCategories((c ?? []) as Category[])
      })
      .catch(() => {})
  }, [])

  const stockLessThanNum = useMemo(() => {
    const t = stockLessThanRaw.trim()
    if (t === '') return undefined
    const n = Number(t)
    if (!Number.isFinite(n) || n < 0) return undefined
    return n
  }, [stockLessThanRaw])

  useEffect(() => { setPage(1) }, [q, categoryId, branchId, lowStockOnly, expiringSoonOnly, stockLessThanRaw])

  const needsClientFilter = lowStockOnly || expiringSoonOnly

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const baseParams = {
      q: q || undefined,
      category_id: categoryId || undefined,
      branch_id: branchId || undefined,
      active_only: true,
      manage_stock_only: true,
      stock_less_than: stockLessThanNum,
    }
    const load = needsClientFilter
      ? productsService.listReport({ ...baseParams, per_page: CLIENT_FILTER_FETCH_LIMIT }).then(({ data }) => {
          const filtered = data.filter(
            (r) => (!lowStockOnly || stockStatus(r) !== 'ok') && (!expiringSoonOnly || isExpiringSoon(r)),
          )
          return { data: filtered.slice((page - 1) * perPage, page * perPage), total: filtered.length }
        })
      : productsService.listReport({ ...baseParams, page, per_page: perPage })
    load
      .then(({ data, total: t }) => {
        if (cancelled) return
        setRows(data ?? [])
        setTotal(t ?? 0)
      })
      .catch(() => { if (!cancelled) toast.error('Error al cargar el stock') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [q, categoryId, branchId, lowStockOnly, expiringSoonOnly, stockLessThanNum, needsClientFilter, page, perPage])

  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const showBranchColumn = branches.length > 1 && !branchId

  const refreshRow = (productId: number) => {
    productsService
      .listReport({ q: q || undefined, category_id: categoryId || undefined, branch_id: branchId || undefined, active_only: true, manage_stock_only: true, per_page: CLIENT_FILTER_FETCH_LIMIT })
      .then(({ data }) => {
        const fresh = data.find((r) => r.id === productId)
        if (!fresh) return
        setRows((prev) => prev.map((r) => (r.id === productId ? fresh : r)))
      })
      .catch(() => {})
  }

  const emptyMessage = useMemo(() => {
    if (lowStockOnly && expiringSoonOnly) return 'No hay productos bajo su stock mínimo y por vencer con estos filtros.'
    if (lowStockOnly) return 'No hay productos bajo su stock mínimo con estos filtros.'
    if (expiringSoonOnly) return 'No hay productos por vencer con estos filtros.'
    return 'Sin productos con control de stock para estos filtros.'
  }, [lowStockOnly, expiringSoonOnly])

  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }))
  const branchOptions = branches.map((b) => ({ value: String(b.id), label: b.name }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Movimientos</h2>
          <p className="text-sm text-gray-500">Stock actual por producto, con acciones rápidas de ajuste, kardex y transferencia.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/inventory/ingress"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <PackagePlus size={14} /> Ingreso
          </Link>
          <Link
            to="/inventory/egress"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <PackageMinus size={14} /> Egreso
          </Link>
          <Link
            to="/inventory/import-adjustment"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <FileSpreadsheet size={14} /> Conteo físico
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100 space-y-3">
        <div className="flex flex-wrap gap-3 items-start">
          <div className="relative w-full sm:w-auto sm:min-w-[220px] sm:flex-1 sm:max-w-sm">
            <label className="block text-xs font-medium text-gray-500 mb-1">Buscar</label>
            <Search size={14} className="absolute left-3 top-[calc(50%+8px)] -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
              placeholder="Nombre o código..."
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>
          <div className={branches.length > 1 ? 'grid grid-cols-2 gap-3 w-full sm:contents' : 'w-full sm:w-auto'}>
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-medium text-gray-500 mb-1">Categoría</label>
              <SearchSelect
                className="w-full sm:w-auto sm:min-w-[180px]"
                options={categoryOptions}
                value={categoryId ? String(categoryId) : ''}
                onChange={(v) => setCategoryId(v ? Number(v) : '')}
                placeholder="Todas"
              />
            </div>
            {branches.length > 1 && (
              <div className="w-full sm:w-auto">
                <label className="block text-xs font-medium text-gray-500 mb-1">Sucursal</label>
                <SearchSelect
                  className="w-full sm:w-auto sm:min-w-[180px]"
                  options={branchOptions}
                  value={branchId ? String(branchId) : ''}
                  onChange={(v) => setBranchId(v ? Number(v) : '')}
                  placeholder="Todas"
                />
              </div>
            )}
          </div>
          <div className="w-full sm:w-auto">
            <label className="block text-xs font-medium text-gray-500 mb-1">Stock menor a</label>
            <input
              type="number"
              min={0}
              step={0.001}
              placeholder="Ej. 10"
              className="w-full sm:w-auto sm:min-w-[110px] border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={stockLessThanInput}
              onChange={(e) => setStockLessThanInput(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 w-full sm:contents">
            <FilterSwitch label="Solo bajo mínimo" checked={lowStockOnly} onChange={setLowStockOnly} />
            <FilterSwitch label="Por vencer" checked={expiringSoonOnly} onChange={setExpiringSoonOnly} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          {/* Sin max-h/overflow propio: la tabla fluye con la página y la paginación se mueve
              junto con ella, en vez de quedar fija fuera de una caja de scroll interna. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Código</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Producto</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Categoría</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Stock</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Mínimo</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Vencimiento</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Estado</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row) => {
                    const status = stockStatus(row)
                    const expanded = expandedId === row.id
                    const canExpand = showBranchColumn && (row.stock_by_branch ?? []).length > 0
                    const expiryStatus = row.has_expiry_date && row.expiry_date ? getProductExpiryStatus(row.expiry_date) : null
                    return (
                      <Fragment key={row.id}>
                        <tr className="border-b border-gray-50 align-top hover:bg-gray-50/60">
                          <td className="px-4 py-2 whitespace-nowrap font-mono text-xs text-gray-500">{row.code || '—'}</td>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              disabled={!canExpand}
                              onClick={() => setExpandedId(expanded ? null : row.id)}
                              className="flex items-center gap-1 text-left font-medium text-gray-800 disabled:cursor-default"
                            >
                              {row.name}
                              {canExpand && (expanded ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />)}
                            </button>
                          </td>
                          <td className="px-4 py-2 text-gray-600">{row.category_name || '—'}</td>
                          <td className="px-4 py-2 text-right">
                            <span className={`inline-block min-w-[2.5rem] px-2 py-0.5 rounded-full text-xs font-semibold font-mono border ${STATUS_BADGE[status]}`}>
                              {stockNum(row.stock_total)}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-gray-500">{stockNum(row.min_stock) || '—'}</td>
                          <td className="px-4 py-2">
                            {expiryStatus ? (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${PRODUCT_EXPIRY_BADGE_CLASS[expiryStatus]}`}
                                title={expiryStatusLabel(expiryStatus)}
                              >
                                <CalendarClock size={11} />
                                {formatExpiryDisplay(row.expiry_date as string)}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[status]}`}>
                              {STATUS_LABEL[status]}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setAdjustmentProduct(row)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs font-medium hover:bg-amber-100"
                              >
                                <SlidersHorizontal size={13} /> Ajustar
                              </button>
                              <button
                                type="button"
                                onClick={() => setKardexProduct(row)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-medium hover:bg-indigo-100"
                              >
                                <History size={13} /> Kardex
                              </button>
                              <button
                                type="button"
                                onClick={() => setTransferProduct(row)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100"
                              >
                                <ArrowRightLeft size={13} /> Transferir
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-gray-50 bg-gray-50/50">
                            <td />
                            <td colSpan={7} className="px-4 py-2">
                              <div className="flex flex-wrap gap-2">
                                {(row.stock_by_branch ?? []).map((b) => (
                                  <span key={`${row.id}-${b.branch_id}`} className="text-xs px-2 py-1 rounded-lg bg-white border border-gray-200 text-gray-600">
                                    {b.branch_name}: <strong className="text-gray-800">{b.quantity}</strong>
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                      <Package size={24} className="mx-auto mb-2 text-gray-300" />
                      {emptyMessage}
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
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1) }}
              >
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span className="text-sm text-gray-600 whitespace-nowrap">por página</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-600">Página {page} de {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {adjustmentProduct && (
        <StockAdjustmentModal
          product={adjustmentProduct}
          defaultBranchId={branchId || activeBranchId}
          onClose={() => setAdjustmentProduct(null)}
          onSaved={() => {
            const id = adjustmentProduct.id
            setAdjustmentProduct(null)
            refreshRow(id)
          }}
        />
      )}

      {kardexProduct && (
        <ProductKardexModal
          productId={kardexProduct.id}
          productName={kardexProduct.name}
          productCode={kardexProduct.code}
          onClose={() => setKardexProduct(null)}
        />
      )}

      {transferProduct && (
        <ProductTransferModal
          product={transferProduct}
          defaultBranchId={branchId || activeBranchId}
          onClose={() => setTransferProduct(null)}
          onChanged={() => refreshRow(transferProduct.id)}
        />
      )}
    </div>
  )
}
