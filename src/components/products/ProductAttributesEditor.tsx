import { Plus, Trash2 } from 'lucide-react'
import type { ProductAttribute } from '@/services/products.service'

type Props = {
  attributes: ProductAttribute[]
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  onChangeRow: (index: number, patch: Partial<ProductAttribute>) => void
  onAddRow: () => void
  onRemoveRow: (index: number) => void
}

/**
 * Editor de filas de Attributes, embebido en ProductAttributesModal. Puramente presentacional
 * (mismo criterio que SaleUnitsEditor/ProductPresentationsEditor): toda mutación pasa por
 * onChangeRow/onAddRow/onRemoveRow — el modal padre decide cuándo eso implica una llamada real al
 * backend y valida duplicados de nombre+valor.
 *
 * NO reutiliza ProductPresentationsEditor.tsx ni SaleUnitsEditor.tsx: Attribute es un dato
 * puramente descriptivo (name/value), sin stock, precio, factor de conversión ni exclusividad de
 * "unidad base" — es una entidad y un componente independientes (ver
 * FRONTEND_IMPLEMENTATION_PLAN.md sección 6 y el encargo de Fase 7C, sección 3).
 */
export function ProductAttributesEditor({
  attributes,
  canCreate,
  canEdit,
  canDelete,
  onChangeRow,
  onAddRow,
  onRemoveRow,
}: Props) {
  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-2">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <p className="text-xs font-bold text-[rgb(var(--p800))]">Atributos de este producto</p>
        {canCreate && (
          <button
            type="button"
            onClick={onAddRow}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[rgb(var(--p700))] hover:text-[rgb(var(--p900))] px-2 py-1 rounded-lg hover:bg-[rgb(var(--p100))]"
          >
            <Plus size={14} /> Agregar
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-600 leading-relaxed shrink-0">
        Datos descriptivos del producto, ej. Color → Rojo, Material → Acero. Puramente informativos:
        no afectan precio, stock ni ventas.
      </p>

      {attributes.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">Aún no hay atributos configurados.</p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y space-y-2 pr-1 min-h-[120px] max-h-[min(55dvh,520px)]">
          {attributes.map((row, index) => {
            const rowLocked = row.id ? !canEdit : !canCreate
            return (
              <div
                key={row.id ?? `new-${index}`}
                className="flex flex-col sm:flex-row gap-2 p-2 rounded-xl border border-gray-100 bg-white"
              >
                <div className="flex-1 min-w-0">
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Nombre</label>
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => onChangeRow(index, { name: e.target.value })}
                    placeholder="Ej. Color"
                    maxLength={100}
                    disabled={rowLocked}
                    className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Valor</label>
                  <input
                    type="text"
                    value={row.value}
                    onChange={(e) => onChangeRow(index, { value: e.target.value })}
                    placeholder="Ej. Rojo"
                    maxLength={255}
                    disabled={rowLocked}
                    className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                <div className="w-full sm:w-20 shrink-0">
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Orden</label>
                  <input
                    type="number"
                    value={row.sort_order ?? 0}
                    onChange={(e) => onChangeRow(index, { sort_order: Number(e.target.value) || 0 })}
                    disabled={rowLocked}
                    className="w-full min-h-[44px] border border-gray-200 rounded-xl px-2 py-2 text-sm tabular-nums disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                <div className="flex items-center sm:items-end pb-0.5">
                  <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={row.active}
                      onChange={(e) => onChangeRow(index, { active: e.target.checked })}
                      disabled={rowLocked}
                      className="rounded"
                    />
                    Activo
                  </label>
                </div>
                {canDelete || !row.id ? (
                  <div className="flex sm:items-end">
                    <button
                      type="button"
                      onClick={() => onRemoveRow(index)}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50"
                      aria-label={`Quitar atributo ${row.name || ''}`}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
