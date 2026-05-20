import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Search, TrendingUp, TrendingDown, Package } from 'lucide-react'
import { inventoryService, type StockMovement } from '@/services/inventory.service'
import { productsService, type Product } from '@/services/products.service'
import RequireModule from '@/components/ui/RequireModule'

const MOVEMENT_ICONS: Record<string, JSX.Element> = {
  in: <TrendingUp size={14} className="text-green-500" />,
  out: <TrendingDown size={14} className="text-red-400" />,
}

export default function InventoryPage() {
  return <RequireModule moduleKey="inventory"><InventoryContent /></RequireModule>
}

function InventoryContent() {
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMov, setLoadingMov] = useState(false)

  useEffect(() => {
    productsService.list(q)
      .then(({ data }) => setProducts(data ?? []))
      .catch(() => toast.error('Error'))
      .finally(() => setLoading(false))
  }, [q])

  const selectProduct = async (p: Product) => {
    setSelectedProduct(p)
    setLoadingMov(true)
    try {
      const { data: movs } = await inventoryService.listMovements({ product_id: p.id })
      setMovements(Array.isArray(movs) ? movs : [])
    } catch { toast.error('Error cargando movimientos') }
    finally { setLoadingMov(false) }
  }

  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-bold text-gray-800">Inventario</h2><p className="text-sm text-gray-500">Stock y movimientos por producto</p></div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Listado de productos */}
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
              placeholder="Buscar producto..." value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
            ) : products.map(p => (
              <div key={p.id} onClick={() => selectProduct(p)}
                className={`flex items-center justify-between px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${selectedProduct?.id === p.id ? 'bg-[rgb(var(--p50))] border-l-2 border-l-[rgb(var(--p500))]' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center"><Package size={14} className="text-gray-400" /></div>
                  <div>
                    <p className="font-medium text-sm text-gray-800">{p.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{p.code || 'Sin código'}</p>
                  </div>
                </div>
                {p.manage_stock && (
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Stock mín</p>
                    <p className="text-sm font-bold text-gray-700">{p.min_stock}</p>
                  </div>
                )}
              </div>
            ))}
            {!loading && products.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">Sin productos</div>}
          </div>
        </div>

        {/* Panel de movimientos */}
        <div className="space-y-3">
          {selectedProduct ? (
            <>
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <p className="text-xs text-gray-500 uppercase font-semibold">Producto seleccionado</p>
                <p className="font-bold text-gray-800 mt-1">{selectedProduct.name}</p>
                <div className="flex gap-4 mt-2 text-sm">
                  <span className="text-gray-500">Unidad: <strong className="text-gray-700">{selectedProduct.unit}</strong></span>
                  <span className="text-gray-500">IGV: <strong className="text-gray-700">{selectedProduct.igv_affectation_type}</strong></span>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Historial de movimientos</p>
                </div>
                {loadingMov ? (
                  <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
                ) : (
                  <div className="max-h-[55vh] overflow-y-auto">
                    {movements.map(m => (
                      <div key={m.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          {MOVEMENT_ICONS[m.type] ?? <Package size={14} className="text-gray-400" />}
                          <div>
                            <p className="text-sm font-medium text-gray-700">{m.reference || m.type}</p>
                            <p className="text-xs text-gray-400">{m.notes || '-'} · {new Date(m.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold text-sm ${m.type === 'in' ? 'text-green-600' : 'text-red-500'}`}>
                            {m.type === 'in' ? '+' : '-'}{m.quantity}
                          </p>
                          {m.unit_cost != null && m.unit_cost > 0 && <p className="text-xs text-gray-400">S/ {m.unit_cost.toFixed(2)}</p>}
                        </div>
                      </div>
                    ))}
                    {movements.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">Sin movimientos registrados</div>}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm flex flex-col items-center justify-center py-20 text-center">
              <Package size={32} className="text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Selecciona un producto</p>
              <p className="text-gray-400 text-sm">para ver su historial de movimientos</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
