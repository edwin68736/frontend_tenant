import { useState } from 'react'
import { X, Minus, Plus, Package } from 'lucide-react'
import type { ProductReportRow } from '@/services/products.service'
import { resolvePublicAssetUrl } from '@/config/apiBaseUrl'

function formatSoles(n: number): string {
  return `S/ ${Number(n).toFixed(2)}`
}

export default function ProductDetailModal({
  product,
  onClose,
  onAdd,
}: {
  product: ProductReportRow
  onClose: () => void
  onAdd: (product: ProductReportRow, quantity: number) => void
}) {
  const [qty, setQty] = useState(1)
  const outOfStock = Boolean(product.manage_stock) && Number(product.stock_total ?? 0) <= 0

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/90 text-gray-500 hover:text-gray-700 shadow"
        >
          <X size={18} />
        </button>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="aspect-square bg-gray-100 relative">
            {product.image_url ? (
              <img src={resolvePublicAssetUrl(product.image_url)} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
                <Package size={40} />
              </div>
            )}
            {outOfStock && (
              <span className="absolute top-3 left-3 bg-gray-900/80 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                Agotado
              </span>
            )}
          </div>
          <div className="p-5 flex flex-col">
            {product.category_name && (
              <span className="text-[11px] uppercase tracking-wide font-semibold mb-1" style={{ color: 'rgb(var(--vs-primary))' }}>
                {product.category_name}
              </span>
            )}
            <h2 className="text-lg font-bold text-gray-800 mb-2">{product.name}</h2>
            {product.description && <p className="text-sm text-gray-500 mb-4 whitespace-pre-line flex-1">{product.description}</p>}
            <div className="flex items-center justify-between mb-4">
              <span className="text-2xl font-extrabold" style={{ color: 'rgb(var(--vs-primary))' }}>
                {formatSoles(product.sale_price)}
              </span>
              {product.unit && <span className="text-xs text-gray-400">por {product.unit.toLowerCase()}</span>}
            </div>
            {!outOfStock && (
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs text-gray-500">Cantidad</span>
                <div className="flex items-center gap-2 border border-gray-200 rounded-full px-1 py-1">
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="p-1.5 rounded-full hover:bg-gray-100">
                    <Minus size={13} />
                  </button>
                  <span className="w-6 text-center text-sm font-medium">{qty}</span>
                  <button type="button" onClick={() => setQty((q) => q + 1)} className="p-1.5 rounded-full hover:bg-gray-100">
                    <Plus size={13} />
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              disabled={outOfStock}
              onClick={() => onAdd(product, qty)}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-40"
              style={{ background: 'rgb(var(--vs-primary))' }}
            >
              {outOfStock ? 'Agotado' : 'Agregar al carrito'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
