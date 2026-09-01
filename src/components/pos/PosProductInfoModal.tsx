import { useEffect, useState } from 'react'
import { Boxes, History, Tag, X } from 'lucide-react'
import { PortalModal } from '@/components/ui/PortalModal'
import { companyService, type BranchRow } from '@/services/company.service'
import { inventoryService, type StockByBranch } from '@/services/inventory.service'
import { formatMoney } from '@/utils/format'
import type { Product } from '@/services/products.service'

export type PosProductInfoMode = 'stock' | 'purchase' | 'price'

type Props = {
  open: boolean
  onClose: () => void
  mode: PosProductInfoMode | null
  product: Product | null
}

const MODE_TITLE: Record<PosProductInfoMode, string> = {
  stock: 'Stock por sucursal',
  purchase: 'Historial de compras',
  price: 'Precios',
}

const MODE_ICON: Record<PosProductInfoMode, typeof Boxes> = {
  stock: Boxes,
  purchase: History,
  price: Tag,
}

/**
 * Info rápida de un producto desde su tarjeta en el POS (stock por sucursal, precio de
 * compra, precio de venta) — sin salir del punto de venta a buscarlo en Productos.
 *
 * `purchase` (historial de compras): todavía no existe un endpoint que liste las compras de
 * UN producto puntual (la lista de compras no filtra por product_id) — por eso acá se muestra
 * el precio de compra actual del producto (dato que sí existe) con un aviso de que el
 * historial detallado no está disponible todavía, en vez de dejar el botón sin hacer nada.
 *
 * `price` (precios): hoy el sistema maneja un solo precio de venta por producto — se muestra
 * ese único precio. El modal ya está listo para listar varios cuando exista esa función.
 */
export function PosProductInfoModal({ open, onClose, mode, product }: Props) {
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [stockRows, setStockRows] = useState<StockByBranch[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || mode !== 'stock' || !product) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      branches.length ? Promise.resolve(branches) : companyService.listBranches(),
      inventoryService.getStock(product.id),
    ])
      .then(([b, stock]) => {
        if (cancelled) return
        if (!branches.length) setBranches(b)
        setStockRows(stock)
      })
      .catch(() => {
        if (!cancelled) setStockRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, product?.id])

  if (!mode || !product) return null
  const Icon = MODE_ICON[mode]
  const branchName = (id: number) => branches.find(b => b.id === id)?.name ?? `Sucursal ${id}`

  return (
    <PortalModal open={open} onClose={onClose} className="max-w-sm" stacked>
      <div className="bg-white rounded-2xl shadow-xl w-full overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <div className="flex items-center gap-2 min-w-0">
            <Icon size={16} className="text-primary-600 shrink-0" aria-hidden />
            <div className="min-w-0">
              <h3 className="font-bold text-stone-900 text-sm">{MODE_TITLE[mode]}</h3>
              <p className="text-xs text-stone-500 truncate">{product.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-stone-100 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-4">
          {mode === 'stock' && (
            <>
              {loading ? (
                <div className="py-6 text-center text-stone-400 text-sm">
                  <div className="inline-block w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : !product.manage_stock ? (
                <p className="text-sm text-stone-500">Este producto no controla stock.</p>
              ) : stockRows.length === 0 ? (
                <p className="text-sm text-stone-500">Sin stock registrado en ninguna sucursal.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-100 text-xs text-stone-500">
                      <th className="text-left py-1.5 font-medium">Sucursal</th>
                      {stockRows.some(s => s.presentation_name) && (
                        <th className="text-left py-1.5 font-medium">Presentación</th>
                      )}
                      <th className="text-right py-1.5 font-medium">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockRows.map((s, i) => (
                      <tr key={i} className="border-b border-stone-50">
                        <td className="py-1.5 text-stone-700">{branchName(s.branch_id)}</td>
                        {stockRows.some(r => r.presentation_name) && (
                          <td className="py-1.5 text-stone-700">{s.presentation_name || '—'}</td>
                        )}
                        <td className="py-1.5 text-right font-mono tabular-nums text-stone-800">
                          {Number(s.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {mode === 'purchase' && (
            <div className="space-y-3">
              <div className="rounded-xl bg-stone-50 border border-stone-100 p-3">
                <p className="text-xs text-stone-500">Precio de compra actual</p>
                <p className="text-lg font-semibold text-stone-800 tabular-nums">
                  {formatMoney(Number(product.purchase_price) || 0)}
                </p>
              </div>
              <p className="text-xs text-stone-500">
                Aún no hay historial de compras detallado disponible para un producto puntual — este es
                el costo de compra registrado en la ficha del producto.
              </p>
            </div>
          )}

          {mode === 'price' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-stone-50 border border-stone-100 p-3">
                <span className="text-sm text-stone-600">Precio de venta</span>
                <span className="text-base font-semibold text-primary-600 tabular-nums">
                  {formatMoney(Number(product.sale_price) || 0)}
                </span>
              </div>
              <p className="text-xs text-stone-500">Por ahora el producto maneja un único precio de venta.</p>
            </div>
          )}
        </div>
      </div>
    </PortalModal>
  )
}
