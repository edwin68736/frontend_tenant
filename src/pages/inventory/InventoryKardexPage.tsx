import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useSearchParams } from 'react-router-dom'
import { Package, FileDown, FileSpreadsheet } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { FilterSwitch } from '@/components/ui/FilterSwitch'
import { ProductServerSelect, type ProductOption } from '@/components/inventory/ProductServerSelect'
import { productsService } from '@/services/products.service'
import { inventoryService, type StockMovement, type InventoryOperationType } from '@/services/inventory.service'
import { companyService } from '@/services/company.service'
import { exportTableToPdf } from '@/utils/exportPdf'
import { exportTableToExcel } from '@/utils/exportExcel'
import {
  formatInventoryDocumentRef,
  formatOperationTypeLabel,
  formatSunatCode,
  fmtMovementTypeLabel,
  MOVEMENT_TYPE_LABELS,
} from '@/utils/inventoryKardexLabels'

interface Branch {
  id: number
  name: string
}

function movementKindLabel(type: string): string {
  return MOVEMENT_TYPE_LABELS[type] ?? fmtMovementTypeLabel(type)
}

/** Columnas compartidas por PDF y Excel: mismas columnas visibles en la tabla. */
const KARDEX_EXPORT_COLUMNS = [
  { key: 'created_at', label: 'Fecha', format: (v: unknown) => new Date(String(v)).toLocaleString() },
  { key: 'branch_name', label: 'Sucursal', format: (_v: unknown, m: StockMovement) => m.branch_name || `Sucursal ${m.branch_id}` },
  { key: 'presentation_name', label: 'Presentación', format: (v: unknown) => String(v ?? '—') },
  { key: 'type', label: 'Movimiento', format: (_v: unknown, m: StockMovement) => movementKindLabel(m.type) },
  { key: 'type', label: 'Tipo operación', format: (_v: unknown, m: StockMovement) => formatOperationTypeLabel(m) },
  { key: 'sunat_code', label: 'SUNAT', format: (_v: unknown, m: StockMovement) => formatSunatCode(m) },
  { key: 'reference', label: 'Doc. inventario', format: (_v: unknown, m: StockMovement) => formatInventoryDocumentRef(m) },
  { key: 'user_name', label: 'Usuario', format: (v: unknown) => String(v ?? '—') },
  { key: 'reference', label: 'Referencia', format: (v: unknown) => String(v ?? '—') },
  {
    key: 'quantity',
    label: 'Entrada',
    format: (_v: unknown, m: StockMovement) => (m.type === 'in' || m.type === 'adjustment_in' ? m.quantity : ''),
  },
  {
    key: 'quantity',
    label: 'Salida',
    format: (_v: unknown, m: StockMovement) => (m.type === 'out' || m.type === 'adjustment_out' ? m.quantity : ''),
  },
  { key: 'balance', label: 'Saldo', format: (v: unknown) => (v == null ? '' : (v as number)) },
  { key: 'serials', label: 'Series', format: (_v: unknown, m: StockMovement) => (m.serials ?? []).join(', ') },
]

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
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
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

  // Deep-link (?product_id=): precarga solo ESE producto, no todo el catálogo.
  useEffect(() => {
    if (!productIdFromUrl) return
    const id = Number(productIdFromUrl)
    if (Number.isNaN(id)) return
    productsService
      .get(id)
      .then(({ data }) => setSelectedProduct({ id: data.id, name: data.name, code: data.code }))
      .catch(() => {})
  }, [productIdFromUrl])

  useEffect(() => {
    Promise.all([companyService.listBranches(), inventoryService.listOperationTypes()])
      .then(([b, ops]) => {
        setBranches(b ?? [])
        setOperationTypes(ops ?? [])
      })
      .catch(() => toast.error('Error cargando datos de kardex'))
      .finally(() => setLoading(false))
  }, [])

  const loadMovements = async () => {
    if (!selectedProduct) {
      setMovements([])
      return
    }
    setLoadingMov(true)
    try {
      const { data } = await inventoryService.listMovements({
        product_id: selectedProduct.id,
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
    if (selectedProduct) {
      void loadMovements()
    } else {
      setMovements([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct, branchId, dateFrom, dateTo, operationTypeId, sunatCode, inventoryDocOnly])

  // Un código SUNAT puede agrupar más de un tipo de operación (ej. "99" = Ajuste (+) y Otros);
  // se listan todos los nombres distintos para que el código no aparezca solo, sin contexto.
  const sunatCodeOptions = useMemo(() => {
    const byCode = new Map<string, Set<string>>()
    for (const o of operationTypes) {
      const code = (o.sunat_code ?? '').trim()
      if (!code) continue
      if (!byCode.has(code)) byCode.set(code, new Set())
      byCode.get(code)!.add(o.name)
    }
    return [...byCode.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, names]) => ({ code, label: [...names].join(' / ') }))
  }, [operationTypes])

  const canExport = Boolean(selectedProduct) && movements.length > 0
  const exportTitle = selectedProduct ? `Kardex - ${selectedProduct.name}` : 'Kardex'
  const exportBasename = (selectedProduct?.code || selectedProduct?.name || 'kardex').replace(/[^a-zA-Z0-9-]+/g, '-')

  const handleExportPdf = async () => {
    if (!canExport) return
    try {
      await exportTableToPdf(exportTitle, KARDEX_EXPORT_COLUMNS, movements, `${exportBasename}.pdf`)
      toast.success('PDF descargado')
    } catch {
      toast.error('Error al exportar')
    }
  }

  const handleExportExcel = async () => {
    if (!canExport) return
    try {
      await exportTableToExcel('Kardex', KARDEX_EXPORT_COLUMNS, movements, `${exportBasename}.xlsx`)
      toast.success('Excel descargado')
    } catch {
      toast.error('Error al exportar')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Kardex de inventario</h2>
        <p className="text-sm text-gray-500">Movimientos detallados por producto y sucursal.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100 space-y-3">
        <div className="flex flex-wrap gap-3 items-start">
          <div className="w-full sm:w-auto sm:min-w-[220px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Producto</label>
            <ProductServerSelect value={selectedProduct} onChange={setSelectedProduct} />
          </div>
          {branches.length > 1 && (
            <div className="w-full sm:w-auto sm:min-w-[160px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Sucursal</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={branchId ?? ''}
                onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">Todas</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="w-full sm:w-auto sm:min-w-[180px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo operación</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={operationTypeId}
              onChange={(e) => setOperationTypeId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Todos</option>
              {operationTypes.map((o) => (
                <option key={o.id} value={o.id}>{o.sunat_code} — {o.name}</option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-auto sm:min-w-[110px] sm:max-w-[220px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Código SUNAT</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm truncate"
              value={sunatCode}
              onChange={(e) => setSunatCode(e.target.value)}
            >
              <option value="">Todos</option>
              {sunatCodeOptions.map(({ code, label }) => (
                <option key={code} value={code}>{code} — {label}</option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-auto sm:min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-auto sm:min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <FilterSwitch label="Solo doc. de inventario" checked={inventoryDocOnly} onChange={setInventoryDocOnly} />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
        {selectedProduct ? (
          <>
            <div className="flex items-center gap-2 p-4 border-b border-gray-100 flex-wrap">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                <Package size={16} className="text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{selectedProduct.name}</p>
                <p className="text-[11px] text-gray-400 font-mono">{selectedProduct.code || 'Sin código'}</p>
              </div>
              {loadingMov && (
                <div className="w-4 h-4 border-2 border-gray-200 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleExportPdf()}
                  disabled={!canExport}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-xl text-xs font-medium hover:opacity-90 disabled:opacity-50"
                >
                  <FileDown size={14} /> PDF
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportExcel()}
                  disabled={!canExport}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-xl text-xs font-medium hover:opacity-90 disabled:opacity-50"
                >
                  <FileSpreadsheet size={14} /> Excel
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-2 px-3">Fecha</th>
                    <th className="text-left py-2 px-3">Sucursal</th>
                    <th className="text-left py-2 px-3">Presentación</th>
                    <th className="text-left py-2 px-3">Movimiento</th>
                    <th className="text-left py-2 px-3">Tipo operación</th>
                    <th className="text-left py-2 px-3">SUNAT</th>
                    <th className="text-left py-2 px-3">Doc. inventario</th>
                    <th className="text-left py-2 px-3">Usuario</th>
                    <th className="text-left py-2 px-3">Referencia</th>
                    <th className="text-left py-2 px-3">Series</th>
                    <th className="text-right py-2 px-3">Entrada</th>
                    <th className="text-right py-2 px-3">Salida</th>
                    <th className="text-right py-2 px-3">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => {
                    const isIn = m.type === 'in' || m.type === 'adjustment_in'
                    const isOut = m.type === 'out' || m.type === 'adjustment_out'
                    return (
                      <tr key={m.id} className="border-b border-gray-50">
                        <td className="py-2 px-3 whitespace-nowrap">{new Date(m.created_at).toLocaleString()}</td>
                        <td className="py-2 px-3">
                          {m.branch_name || branches.find((b) => b.id === m.branch_id)?.name || `Sucursal ${m.branch_id}`}
                        </td>
                        <td className="py-2 px-3">
                          <span className="text-[11px] text-gray-600">{m.presentation_name || '—'}</span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="text-[11px]">{movementKindLabel(m.type)}</span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="text-[11px]">{formatOperationTypeLabel(m)}</span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="text-[11px] font-mono">{formatSunatCode(m)}</span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="text-[11px]">{formatInventoryDocumentRef(m)}</span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="text-[11px] text-gray-600">{m.user_name || '—'}</span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="text-[11px] text-gray-600">{m.reference || '—'}</span>
                        </td>
                        <td className="py-2 px-3 max-w-[160px]">
                          {m.serials && m.serials.length > 0 ? (
                            <span className="text-[11px] font-mono text-gray-600 truncate block" title={m.serials.join(', ')}>
                              {m.serials.join(', ')}
                            </span>
                          ) : (
                            <span className="text-[11px] text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[11px] text-green-600">
                          {isIn ? `+${m.quantity}` : ''}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[11px] text-red-500">
                          {isOut ? `-${m.quantity}` : ''}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[11px] text-gray-800">
                          {m.balance ?? ''}
                        </td>
                      </tr>
                    )
                  })}
                  {movements.length === 0 && (
                    <tr>
                      <td colSpan={13} className="py-8 text-center text-gray-400">
                        No hay movimientos para los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
            <Package size={28} className="text-gray-300 mb-3" />
            <p className="font-medium">Selecciona un producto arriba</p>
            <p className="text-sm text-gray-400">para ver su kardex detallado.</p>
          </div>
        )}
      </div>
    </div>
  )
}
