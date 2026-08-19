import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { companyService } from '@/services/company.service'
import { inventoryService, type StockMovement } from '@/services/inventory.service'
import {
  formatInventoryDocumentRef,
  formatOperationTypeLabel,
  formatSunatCode,
  fmtMovementTypeLabel,
  MOVEMENT_TYPE_LABELS,
} from '@/utils/inventoryKardexLabels'

type Branch = { id: number; name: string }

function movementKindLabel(type: string): string {
  return MOVEMENT_TYPE_LABELS[type] ?? fmtMovementTypeLabel(type)
}

/** Kardex de UN producto, sin salir de la vista de inventario (modal en vez de navegar). */
export function ProductKardexModal({
  productId,
  productName,
  productCode,
  onClose,
}: {
  productId: number
  productName: string
  productCode?: string
  onClose: () => void
}) {
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState<number | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    companyService.listBranches().then((b) => setBranches((b ?? []) as Branch[])).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    inventoryService
      .listMovements({
        product_id: productId,
        branch_id: branchId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      })
      .then(({ data }) => { if (!cancelled) setMovements(Array.isArray(data) ? data : []) })
      .catch(() => { if (!cancelled) toast.error('Error cargando kardex') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [productId, branchId, dateFrom, dateTo])

  return (
    <Modal open onClose={onClose} contentClassName="max-w-3xl w-full !p-0 !space-y-0 flex flex-col max-h-[85vh] !overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
        <div>
          <h3 className="text-base font-semibold text-gray-800">Kardex — {productName}</h3>
          <p className="text-xs text-gray-400 font-mono">{productCode || 'Sin código'}</p>
        </div>
        <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
          <X size={20} />
        </button>
      </div>

      <div className="p-4 border-b border-gray-100 flex flex-wrap gap-2 shrink-0">
        {branches.length > 1 && (
          <select
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Todas las sucursales</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        <input
          type="date"
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <input
          type="date"
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white border-b border-gray-100">
              <tr>
                <th className="text-left py-2 px-2">Fecha</th>
                <th className="text-left py-2 px-2">Sucursal</th>
                <th className="text-left py-2 px-2">Presentación</th>
                <th className="text-left py-2 px-2">Movimiento</th>
                <th className="text-left py-2 px-2">Tipo operación</th>
                <th className="text-left py-2 px-2">Usuario</th>
                <th className="text-left py-2 px-2">Referencia</th>
                <th className="text-right py-2 px-2">Entrada</th>
                <th className="text-right py-2 px-2">Salida</th>
                <th className="text-right py-2 px-2">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => {
                const isIn = m.type === 'in' || m.type === 'adjustment_in'
                const isOut = m.type === 'out' || m.type === 'adjustment_out'
                return (
                  <tr key={m.id} className="border-b border-gray-50">
                    <td className="py-2 px-2 whitespace-nowrap">{new Date(m.created_at).toLocaleString()}</td>
                    <td className="py-2 px-2">{m.branch_name || `Sucursal ${m.branch_id}`}</td>
                    <td className="py-2 px-2 text-gray-600">{m.presentation_name || '—'}</td>
                    <td className="py-2 px-2">{movementKindLabel(m.type)}</td>
                    <td className="py-2 px-2">
                      {formatOperationTypeLabel(m)}
                      {formatSunatCode(m) !== '—' && (
                        <span className="ml-1 text-gray-400 font-mono">({formatSunatCode(m)})</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-gray-600">{m.user_name || '—'}</td>
                    <td className="py-2 px-2 text-gray-600">
                      {m.reference || formatInventoryDocumentRef(m)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-green-600">{isIn ? `+${m.quantity}` : ''}</td>
                    <td className="py-2 px-2 text-right font-mono text-red-500">{isOut ? `-${m.quantity}` : ''}</td>
                    <td className="py-2 px-2 text-right font-mono text-gray-800">{m.balance ?? ''}</td>
                  </tr>
                )
              })}
              {movements.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-gray-400">
                    No hay movimientos para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  )
}
