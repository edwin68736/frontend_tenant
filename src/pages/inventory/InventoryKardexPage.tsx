import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useSearchParams } from 'react-router-dom'
import { Search, Filter, Package } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { productsService, type Product } from '@/services/products.service'
import { inventoryService, type StockMovement, type InventoryOperationType } from '@/services/inventory.service'
import { companyService } from '@/services/company.service'
import {
  formatInventoryDocumentRef,
  formatOperationTypeLabel,
  formatSunatCode,
  fmtMovementTypeLabel,
} from '@/utils/inventoryKardexLabels'

interface Branch {
  id: number
  name: string
}

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  in: 'Entrada',
  out: 'Salida',
  adjustment_in: 'Ajuste (entrada)',
  adjustment_out: 'Ajuste (salida)',
  adjustment: 'Ajuste',
  transfer: 'Transferencia',
}

function movementKindLabel(type: string): string {
  return MOVEMENT_TYPE_LABELS[type] ?? fmtMovementTypeLabel(type)
}

export default function InventoryKardexPage() {
  return (
    <RequireModule moduleKey="inventory">
      <InventoryKardexContent />
    </RequireModule>
  )
}

function InventoryKardexContent() {
  const [searchParams] = useSearchParams()
  const productIdFromUrl = searchParams.get('product_id')
  const [products, setProducts] = useState<Product[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedProductId, setSelectedProductId] = useState<number | undefined>(
    productIdFromUrl ? Number(productIdFromUrl) : undefined
  )
  const [branchId, setBranchId] = useState<number | undefined>()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [operationTypeId, setOperationTypeId] = useState<number | ''>('')
  const [sunatCode, setSunatCode] = useState('')
  const [inventoryDocOnly, setInventoryDocOnly] = useState(false)
  const [operationTypes, setOperationTypes] = useState<InventoryOperationType[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMov, setLoadingMov] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    if (productIdFromUrl) {
      const id = Number(productIdFromUrl)
      if (!isNaN(id)) setSelectedProductId(id)
    }
  }, [productIdFromUrl])

  useEffect(() => {
    Promise.all([
      productsService.list(q, undefined, undefined, true),
      companyService.listBranches(),
      inventoryService.listOperationTypes(),
    ])
      .then(([p, b, ops]) => {
        setProducts((p?.data) ?? [])
        setBranches(b ?? [])
        setOperationTypes(ops ?? [])
      })
      .catch(() => toast.error('Error cargando datos de kardex'))
      .finally(() => setLoading(false))
  }, [q])

  const loadMovements = async () => {
    if (!selectedProductId) {
      setMovements([])
      return
    }
    setLoadingMov(true)
    try {
      const { data } = await inventoryService.listMovements({
        product_id: selectedProductId,
        branch_id: branchId,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        operation_type_id: operationTypeId || undefined,
        sunat_code: sunatCode.trim() || undefined,
        movement_kind: inventoryDocOnly ? 'inventory_doc' : undefined,
      })
      setMovements(Array.isArray(data) ? data : [])
    } catch {
      toast.error('Error cargando movimientos')
    } finally {
      setLoadingMov(false)
    }
  }

  useEffect(() => {
    // Cargar movimientos automáticamente al cambiar filtros si ya hay producto seleccionado
    if (selectedProductId) {
      void loadMovements()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductId, branchId, dateFrom, dateTo, operationTypeId, sunatCode, inventoryDocOnly])

  const selectedProduct = products.find(p => p.id === selectedProductId)

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Kardex de inventario</h2>
          <p className="text-sm text-gray-500">
            Movimientos detallados por producto y sucursal.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Filtros y selección de producto */}
        <div className="space-y-3 lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Search size={14} /> Producto
            </h3>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
                placeholder="Buscar producto..."
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
            <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-xl">
              {products
                .filter(p => p.manage_stock)
                .map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProductId(p.id)}
                    className={`w-full text-left px-3 py-2 text-xs border-b border-gray-50 hover:bg-gray-50 flex items-center justify-between ${
                      selectedProductId === p.id ? 'bg-[rgb(var(--p50))] border-l-2 border-l-[rgb(var(--p500))]' : ''
                    }`}
                  >
                    <span className="block">
                      <span className="font-medium text-gray-800">{p.name}</span>
                      <span className="block text-[10px] text-gray-400 font-mono">{p.code || 'Sin código'}</span>
                    </span>
                  </button>
                ))}
              {products.filter(p => p.manage_stock).length === 0 && (
                <div className="py-6 text-center text-xs text-gray-400">Sin productos con stock</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Filter size={14} /> Filtros
            </h3>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sucursal</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={branchId ?? ''}
                onChange={e => setBranchId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">Todas</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo operación</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-xs"
                  value={operationTypeId}
                  onChange={e => setOperationTypeId(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">Todos</option>
                  {operationTypes.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.sunat_code} — {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Código SUNAT</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-xs"
                  value={sunatCode}
                  onChange={e => setSunatCode(e.target.value)}
                >
                  <option value="">Todos</option>
                  {[...new Set(operationTypes.map(o => o.sunat_code))].sort().map(code => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={inventoryDocOnly}
                onChange={e => setInventoryDocOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              Solo documentos de inventario
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-xs"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-xs"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={loadMovements}
              disabled={!selectedProductId || loadingMov}
              className="w-full mt-1 py-1.5 text-xs bg-[rgb(var(--p600))] text-white rounded-xl font-medium disabled:opacity-50"
            >
              {loadingMov ? 'Cargando...' : 'Aplicar filtros'}
            </button>
          </div>
        </div>

        {/* Tabla de movimientos */}
        <div className="bg-white rounded-2xl shadow-sm p-4 lg:col-span-2 flex flex-col min-h-[300px]">
          {selectedProduct ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Package size={16} className="text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{selectedProduct.name}</p>
                    <p className="text-[11px] text-gray-400 font-mono">{selectedProduct.code || 'Sin código'}</p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white border-b border-gray-100">
                    <tr>
                      <th className="text-left py-2 px-2">Fecha</th>
                      <th className="text-left py-2 px-2">Sucursal</th>
                      <th className="text-left py-2 px-2">Movimiento</th>
                      <th className="text-left py-2 px-2">Tipo operación</th>
                      <th className="text-left py-2 px-2">SUNAT</th>
                      <th className="text-left py-2 px-2">Doc. inventario</th>
                      <th className="text-left py-2 px-2">Usuario</th>
                      <th className="text-left py-2 px-2">Referencia</th>
                      <th className="text-right py-2 px-2">Entrada</th>
                      <th className="text-right py-2 px-2">Salida</th>
                      <th className="text-right py-2 px-2">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map(m => {
                      const isIn = m.type === 'in' || m.type === 'adjustment_in'
                      const isOut = m.type === 'out' || m.type === 'adjustment_out'
                      return (
                        <tr key={m.id} className="border-b border-gray-50">
                          <td className="py-2 px-2 whitespace-nowrap">
                            {new Date(m.created_at).toLocaleString()}
                          </td>
                          <td className="py-2 px-2">
                            {m.branch_name || branches.find(b => b.id === m.branch_id)?.name || `Sucursal ${m.branch_id}`}
                          </td>
                          <td className="py-2 px-2">
                            <span className="text-[11px]">{movementKindLabel(m.type)}</span>
                          </td>
                          <td className="py-2 px-2">
                            <span className="text-[11px]">{formatOperationTypeLabel(m)}</span>
                          </td>
                          <td className="py-2 px-2">
                            <span className="text-[11px] font-mono">{formatSunatCode(m)}</span>
                          </td>
                          <td className="py-2 px-2">
                            <span className="text-[11px]">{formatInventoryDocumentRef(m)}</span>
                          </td>
                          <td className="py-2 px-2">
                            <span className="text-[11px] text-gray-600">{m.user_name || '—'}</span>
                          </td>
                          <td className="py-2 px-2">
                            <span className="text-[11px] text-gray-600">{m.reference || '—'}</span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-[11px] text-green-600">
                            {isIn ? `+${m.quantity}` : ''}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-[11px] text-red-500">
                            {isOut ? `-${m.quantity}` : ''}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-[11px] text-gray-800">
                            {m.balance ?? ''}
                          </td>
                        </tr>
                      )
                    })}
                    {movements.length === 0 && (
                      <tr>
                        <td colSpan={11} className="py-8 text-center text-gray-400">
                          No hay movimientos para los filtros seleccionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 py-16 text-center text-gray-500">
              <Package size={28} className="text-gray-300 mb-3" />
              <p className="font-medium">Selecciona un producto a la izquierda</p>
              <p className="text-sm text-gray-400">para ver su kardex detallado.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

