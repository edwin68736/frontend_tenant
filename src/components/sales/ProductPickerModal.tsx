import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Search, X } from 'lucide-react'
import { productsService, getProductImageUrl, type Product } from '@/services/products.service'
import { formatSaleMoney } from '@/utils/formatMoney'
import {
  productConfigurationBadge,
  productNeedsSaleConfiguration,
} from '@/utils/productModifiers'

const PER_PAGE = 10

type Props = {
  onAdd: (p: Product) => void
  onClose: () => void
  /** Precio mostrado: venta (P. venta) o compra (Precio compra). */
  variant?: 'sale' | 'purchase'
  currency?: string
  /** Abre alta rápida de producto (p. ej. desde compras). */
  onNewProduct?: () => void
  /** IDs de productos ya en el detalle (p. ej. carrito de venta). */
  addedProductIds?: number[]
  /** Último producto agregado al detalle. */
  lastAddedProductId?: number | null
}

export function ProductPickerModal({
  onAdd,
  onClose,
  variant = 'sale',
  currency = 'PEN',
  onNewProduct,
  addedProductIds = [],
  lastAddedProductId = null,
}: Props) {
  const fmtPrice = (n: number) =>
    variant === 'sale' ? formatSaleMoney(n, currency) : `S/ ${Number(n).toFixed(2)}`
  const priceLabel = variant === 'sale' ? 'P. venta' : 'Precio compra'
  const priceValue = (p: Product) =>
    variant === 'sale' ? Number(p.sale_price ?? 0) : Number(p.purchase_price ?? 0)

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const loadProducts = () => {
    setLoading(true)
    productsService
      .list(search, undefined, undefined, true, page, PER_PAGE)
      .then(({ data, total: t }) => {
        setProducts(data ?? [])
        setTotal(t ?? 0)
      })
      .catch(() => toast.error('Error cargando productos'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadProducts()
  }, [page, search])

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const addedSet = new Set(addedProductIds)
  const showCartHints = addedSet.size > 0 || lastAddedProductId != null

  const rowHighlightClass = (productId: number) => {
    if (lastAddedProductId != null && productId === lastAddedProductId) {
      return 'bg-amber-50 hover:bg-amber-50/90 ring-1 ring-inset ring-amber-300 border-l-4 border-l-amber-500'
    }
    if (addedSet.has(productId)) {
      return 'bg-slate-100 hover:bg-slate-100/90 ring-1 ring-inset ring-slate-200 border-l-4 border-l-slate-400'
    }
    return 'hover:bg-gray-50/50 border-l-4 border-l-transparent'
  }

  const isLastAdded = (productId: number) =>
    lastAddedProductId != null && productId === lastAddedProductId

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-800 text-lg">Seleccionar producto</h3>
        <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
          <X size={18} />
        </button>
      </div>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm"
          placeholder="Buscar por nombre, código o código de barras..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
      </div>
      <div className="min-h-[280px] max-h-[50vh] overflow-y-auto border border-gray-200 rounded-xl">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm space-y-2">
            <p>No hay productos o no coinciden con la búsqueda.</p>
            {onNewProduct && (
              <button
                type="button"
                onClick={onNewProduct}
                className="text-[rgb(var(--p600))] font-medium hover:underline text-sm"
              >
                + Registrar nuevo producto
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              {/* Orden: acción primero (es lo que más se usa), luego producto y precio;
                  código e imagen al final por ser de apoyo. */}
              <tr>
                <th className="w-[5.5rem] md:w-[7rem] px-2 md:px-4 py-2.5" />
                <th className="text-left px-2 md:px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Producto</th>
                <th className="text-left px-2 md:px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">
                  {priceLabel}
                </th>
                <th className="text-left px-2 md:px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Código</th>
                <th className="w-14 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const configBadge = productConfigurationBadge(p)
                const needsConfig = productNeedsSaleConfiguration(p)
                return (
                <tr key={p.id} className={`border-b border-gray-50 transition-colors ${rowHighlightClass(p.id)}`}>
                  <td className="px-2 md:px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => onAdd(p)}
                      className="w-[5.5rem] md:w-[7rem] inline-flex items-center justify-center px-2 md:px-3 py-1.5 rounded-lg bg-[rgb(var(--p600))] text-white text-[11px] md:text-xs font-medium hover:opacity-90"
                    >
                      {needsConfig ? 'Configurar' : 'Agregar'}
                    </button>
                  </td>
                  <td className="px-2 md:px-4 py-2.5">
                    <span className="font-medium text-gray-800">{p.name}</span>
                    {isLastAdded(p.id) ? (
                      <span className="ml-1.5 inline-flex align-middle rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-200 text-amber-900">
                        Último
                      </span>
                    ) : null}
                    {configBadge ? (
                      <span className="block text-[10px] text-[rgb(var(--p700))] mt-0.5">{configBadge}</span>
                    ) : null}
                  </td>
                  {/* whitespace-nowrap: sin esto "S/ 25.00" se partía en dos líneas. */}
                  <td className="px-2 md:px-4 py-2.5 text-gray-700 whitespace-nowrap">
                    {fmtPrice(priceValue(p))}
                  </td>
                  <td className="px-2 md:px-4 py-2.5 font-mono text-gray-600">{p.code || '-'}</td>
                  <td className="px-3 py-2">
                    {p.image_url ? (
                      <img
                        src={getProductImageUrl(p.image_url)}
                        alt={p.name}
                        loading="lazy"
                        decoding="async"
                        className="h-9 w-9 rounded-lg object-cover border border-gray-200 bg-white"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgb(var(--p50))] text-sm font-bold text-[rgb(var(--p400))] border border-[rgb(var(--p100))]">
                        {p.name.charAt(0).toUpperCase() || '?'}
                      </div>
                    )}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        )}
      </div>
      {showCartHints && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-5 rounded border border-amber-300 bg-amber-50 border-l-[3px] border-l-amber-500"
              aria-hidden
            />
            Último agregado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-5 rounded border border-slate-200 bg-slate-100 border-l-[3px] border-l-slate-400"
              aria-hidden
            />
            Ya en el detalle
          </span>
        </div>
      )}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Mostrando {(page - 1) * PER_PAGE + 1}-{Math.min(page * PER_PAGE, total)} de {total} productos
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-xs text-gray-600">
              Pág. {page} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
      <div className="pt-2 flex flex-col gap-2">
        {onNewProduct && (
          <button
            type="button"
            onClick={onNewProduct}
            className="w-full py-2.5 border border-[rgb(var(--p300))] rounded-xl text-sm text-[rgb(var(--p600))] font-medium hover:bg-[rgb(var(--p50))]"
          >
            + Nuevo producto
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
        >
          Cerrar{' '}
          <span className="text-gray-400 font-normal">[ESC]</span>
        </button>
      </div>
    </>
  )
}
