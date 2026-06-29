import { Plus, Trash2 } from 'lucide-react'

export interface InventoryDocumentLineRow {
  tempId: number
  product_id: number
  product_name?: string
  product_code?: string
  quantity: number
  unit_cost: number
}

interface Props {
  lines: InventoryDocumentLineRow[]
  onChangeLine: (tempId: number, patch: Partial<InventoryDocumentLineRow>) => void
  onRemoveLine: (tempId: number) => void
  onAddProducts: () => void
  disabled?: boolean
  direction: 'IN' | 'OUT'
}

export function InventoryDocumentLines({
  lines,
  onChangeLine,
  onRemoveLine,
  onAddProducts,
  disabled = false,
  direction,
}: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700">Detalle</h3>
        {!disabled && (
          <button
            type="button"
            onClick={onAddProducts}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-[rgb(var(--p600))] text-white rounded-xl font-medium hover:opacity-90"
          >
            <Plus size={14} /> Agregar producto
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Producto', 'Cantidad', direction === 'IN' ? 'Costo unitario' : 'Costo unit.', 'Subtotal', ''].map(h => (
                <th key={h || 'actions'} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map(line => (
              <tr key={line.tempId} className="border-b border-gray-50">
                <td className="px-3 py-2">
                  <p className="font-medium text-gray-800 text-sm">{line.product_name || `Producto #${line.product_id}`}</p>
                  {line.product_code && (
                    <p className="text-[10px] text-gray-400 font-mono">{line.product_code}</p>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm disabled:bg-gray-50"
                    value={line.quantity || ''}
                    onChange={e => onChangeLine(line.tempId, { quantity: Number(e.target.value) })}
                    disabled={disabled}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-sm disabled:bg-gray-50"
                    value={line.unit_cost ?? ''}
                    onChange={e => onChangeLine(line.tempId, { unit_cost: Number(e.target.value) })}
                    disabled={disabled}
                  />
                </td>
                <td className="px-3 py-2 font-mono text-sm text-gray-700">
                  S/ {(line.quantity * (line.unit_cost || 0)).toFixed(2)}
                </td>
                <td className="px-3 py-2">
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => onRemoveLine(line.tempId)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                      title="Quitar línea"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lines.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">Agregue al menos un producto al documento.</div>
      )}
    </div>
  )
}

export function areLinesUxValid(lines: InventoryDocumentLineRow[]): boolean {
  if (lines.length === 0) return false
  return lines.every(l => l.product_id > 0 && l.quantity > 0)
}
