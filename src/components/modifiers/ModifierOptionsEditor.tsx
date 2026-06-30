import { Plus, Trash2 } from 'lucide-react'
import { createEmptyOptionDraft, type ModifierOptionDraft } from '@/utils/modifierOptionText'

type Props = {
  options: ModifierOptionDraft[]
  onChange: (options: ModifierOptionDraft[]) => void
}

export function ModifierOptionsEditor({ options, onChange }: Props) {
  const rows = options.length > 0 ? options : [createEmptyOptionDraft()]

  const setRow = (index: number, patch: Partial<ModifierOptionDraft>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const addRow = () => onChange([...rows, createEmptyOptionDraft()])

  const removeRow = (index: number) => {
    if (rows.length <= 1) {
      onChange([createEmptyOptionDraft()])
      return
    }
    onChange(rows.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-2">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <label className="text-sm font-medium text-gray-700">Opciones de extra *</label>
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[rgb(var(--p700))] hover:text-[rgb(var(--p900))] px-2 py-1.5 rounded-lg hover:bg-[rgb(var(--p50))]"
        >
          <Plus size={14} /> Agregar
        </button>
      </div>
      <p className="text-[11px] text-gray-500 leading-relaxed shrink-0">
        Cada opción se suma al precio del producto en POS y comprobantes.
      </p>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y space-y-2 pr-1 min-h-[120px] max-h-[min(55dvh,520px)]">
        {rows.map((row, index) => (
          <div
            key={index}
            className="flex flex-col sm:flex-row gap-2 p-2.5 rounded-xl border border-gray-200 bg-gray-50/80"
          >
            <div className="flex-1 min-w-0">
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5 uppercase tracking-wide">
                Nombre
              </label>
              <input
                type="text"
                value={row.name}
                onChange={(e) => setRow(index, { name: e.target.value })}
                placeholder="Ej. Garantía extendida, Instalación"
                className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
              />
            </div>
            <div className="w-full sm:w-28 shrink-0">
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5 uppercase tracking-wide">
                + S/
              </label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.5}
                value={row.extra_price === 0 ? '' : row.extra_price}
                onChange={(e) => {
                  const v = e.target.value
                  setRow(index, { extra_price: v === '' ? 0 : Math.max(0, Number(v) || 0) })
                }}
                placeholder="0.00"
                className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white tabular-nums"
              />
            </div>
            <div className="flex sm:flex-col justify-end sm:justify-center sm:pt-5">
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50"
                title="Quitar opción"
                aria-label="Quitar opción"
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
