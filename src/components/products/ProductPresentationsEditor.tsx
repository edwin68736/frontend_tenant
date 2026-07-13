import { Plus, Trash2 } from 'lucide-react'
import type { ProductPresentation } from '@/services/products.service'
import { MoneyAmountInput } from '@/components/pos/MoneyAmountInput'

type Props = {
  presentations: ProductPresentation[]
  onChange: (rows: ProductPresentation[]) => void
  embedded?: boolean
}

function emptyRow(): ProductPresentation {
  return { name: '', sale_price: 0 }
}

export function ProductPresentationsEditor({ presentations, onChange, embedded }: Props) {
  const rows = presentations.length > 0 ? presentations : [emptyRow()]

  const setRow = (index: number, patch: Partial<ProductPresentation>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const addRow = () => onChange([...rows, emptyRow()])

  const removeRow = (index: number) => {
    if (rows.length <= 1) {
      onChange([emptyRow()])
      return
    }
    onChange(rows.filter((_, i) => i !== index))
  }

  return (
    <div
      className={
        embedded
          ? 'flex flex-col flex-1 min-h-0 space-y-2'
          : 'space-y-2 rounded-xl border border-[rgb(var(--p200))] bg-[rgb(var(--p50))]/40 p-2.5'
      }
    >
      <div className="flex items-center justify-between gap-2 shrink-0">
        <p className="text-xs font-bold text-[rgb(var(--p800))]">Presentaciones de este producto</p>
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[rgb(var(--p700))] hover:text-[rgb(var(--p900))] px-2 py-1 rounded-lg hover:bg-[rgb(var(--p100))]"
        >
          <Plus size={14} /> Agregar
        </button>
      </div>
      <p className="text-[11px] text-gray-600 leading-relaxed shrink-0">
        Cada fila es un tamaño, empaque o variante propia (ej. 500 ml, Caja x12). Su precio reemplaza el precio base en ventas.
      </p>
      <div
        className={
          embedded
            ? 'flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y space-y-2 pr-1 min-h-[120px] max-h-[min(55dvh,520px)]'
            : 'space-y-2 max-h-[min(50vh,420px)] overflow-y-auto overscroll-contain touch-pan-y pr-1'
        }
      >
        {rows.map((row, index) => (
          <div
            key={index}
            className="flex flex-col sm:flex-row gap-2 p-2 rounded-xl border border-gray-100 bg-white"
          >
            <div className="flex-1 min-w-0">
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Nombre</label>
              <input
                type="text"
                value={row.name}
                onChange={(e) => setRow(index, { name: e.target.value })}
                placeholder="Ej. 500 ml, Caja x12"
                className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div className="w-full sm:w-28 shrink-0">
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Precio S/</label>
              <MoneyAmountInput
                value={row.sale_price}
                onChange={(v) => setRow(index, { sale_price: Math.max(0, v) })}
                emptyWhenZero
                placeholder="0.00"
                className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div className="flex sm:items-end">
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50"
                aria-label="Quitar presentación"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
