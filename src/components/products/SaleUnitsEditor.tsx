import { Plus, Trash2 } from 'lucide-react'
import type { ProductSaleUnit, Unit } from '@/services/products.service'
import { MoneyAmountInput } from '@/components/pos/MoneyAmountInput'

type Props = {
  units: ProductSaleUnit[]
  /** Catálogo SUNAT N°03 (TenantUnit) para elegir la unidad comercial propia de cada SaleUnit. */
  catalogUnits: Unit[]
  /** Nombre visible de la unidad base del producto (ej. "KG", "Unidades") — para el texto de ayuda del factor. */
  baseUnitLabel: string
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  onChangeRow: (index: number, patch: Partial<ProductSaleUnit>) => void
  onAddRow: () => void
  onRemoveRow: (index: number) => void
  /** Abre la gestión de precios por sucursal (Fase 7D) de una unidad ya guardada (con id). */
  onManageBranchPrices: (row: ProductSaleUnit) => void
}

/**
 * Editor de filas de SaleUnits, embebido en SaleUnitsModal. Puramente presentacional (igual que
 * ProductPresentationsEditor): toda mutación pasa por onChangeRow/onAddRow/onRemoveRow — el modal
 * padre decide cuándo eso implica una llamada real al backend (crear/actualizar/eliminar) y aplica
 * la exclusividad de "unidad base" entre filas.
 *
 * NO reutiliza ProductPresentationsEditor: SaleUnit y Presentation son conceptos distintos (ver
 * FRONTEND_IMPLEMENTATION_PLAN.md sección 6) — esta es una entidad separada, con su propio CRUD.
 */
export function SaleUnitsEditor({
  units,
  catalogUnits,
  baseUnitLabel,
  canCreate,
  canEdit,
  canDelete,
  onChangeRow,
  onAddRow,
  onRemoveRow,
  onManageBranchPrices,
}: Props) {
  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-2">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <p className="text-xs font-bold text-[rgb(var(--p800))]">Unidades de venta de este producto</p>
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
        Permiten vender un mismo producto en diferentes cantidades comerciales — por ejemplo Caja
        x12, Pack x6 o Unidad — con conversión hacia la unidad base ({baseUnitLabel || 'sin unidad'}
        ). No reemplazan las presentaciones ni tienen stock propio.
      </p>

      {units.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">Aún no hay unidades de venta configuradas.</p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y space-y-2 pr-1 min-h-[120px] max-h-[min(55dvh,520px)]">
          {units.map((row, index) => {
            const rowLocked = row.id ? !canEdit : !canCreate
            const factor = Number(row.conversion_factor) || 0
            return (
              <div
                key={row.id ?? `new-${index}`}
                className="flex flex-col gap-2 p-2.5 rounded-xl border border-gray-100 bg-white"
              >
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Nombre</label>
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => onChangeRow(index, { name: e.target.value })}
                      placeholder="Ej. Caja x12, Pack x6, Unidad"
                      maxLength={120}
                      disabled={rowLocked}
                      className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                  <div className="w-full sm:w-40 shrink-0">
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                      Unidad (SUNAT)
                    </label>
                    <select
                      value={row.unit_id ?? ''}
                      onChange={(e) => {
                        const selected = catalogUnits.find((u) => u.id === Number(e.target.value))
                        onChangeRow(index, {
                          unit_id: selected?.id ?? null,
                          unit: selected?.code ?? row.unit,
                        })
                      }}
                      disabled={rowLocked}
                      className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      <option value="">{row.id ? 'Sin unidad configurada' : 'Selecciona...'}</option>
                      {/* SaleUnit ya guardada con una unidad que el select no trae cargada todavía. */}
                      {row.unit_id != null && !catalogUnits.some((u) => u.id === row.unit_id) && (
                        <option value={row.unit_id}>{row.unit || `#${row.unit_id}`}</option>
                      )}
                      {catalogUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.code} - {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full sm:w-36 shrink-0">
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                      Factor de conversión
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={row.conversion_factor}
                      onChange={(e) =>
                        onChangeRow(index, { conversion_factor: Math.max(0, Number(e.target.value) || 0) })
                      }
                      disabled={rowLocked || row.is_base}
                      className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                  {canDelete || !row.id ? (
                    <div className="flex sm:items-end">
                      <button
                        type="button"
                        onClick={() => onRemoveRow(index)}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50"
                        aria-label={`Quitar ${row.name || 'unidad de venta'}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ) : null}
                </div>

                {row.name.trim() && factor > 0 && (
                  <p className="text-[11px] text-[rgb(var(--p700))] bg-[rgb(var(--p50))] rounded-lg px-2 py-1 w-fit">
                    1 {row.name.trim()} = {factor} {baseUnitLabel || 'unidad base'}
                  </p>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="w-full sm:w-28 shrink-0">
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Price1 S/</label>
                    <MoneyAmountInput
                      value={row.price1}
                      onChange={(v) => onChangeRow(index, { price1: Math.max(0, v) })}
                      emptyWhenZero
                      placeholder="0.00"
                      disabled={rowLocked}
                      className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                  <div className="w-full sm:w-28 shrink-0">
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                      Price2 S/ <span className="text-gray-400">(opcional)</span>
                    </label>
                    <MoneyAmountInput
                      value={row.price2 ?? 0}
                      onChange={(v) => onChangeRow(index, { price2: v > 0 ? v : null })}
                      emptyWhenZero
                      placeholder="0.00"
                      disabled={rowLocked}
                      className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                  <div className="w-full sm:w-28 shrink-0">
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                      Price3 S/ <span className="text-gray-400">(opcional)</span>
                    </label>
                    <MoneyAmountInput
                      value={row.price3 ?? 0}
                      onChange={(v) => onChangeRow(index, { price3: v > 0 ? v : null })}
                      emptyWhenZero
                      placeholder="0.00"
                      disabled={rowLocked}
                      className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5">
                  <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.is_base}
                      onChange={(e) => onChangeRow(index, { is_base: e.target.checked })}
                      disabled={rowLocked}
                      className="rounded"
                    />
                    Es unidad base
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.allow_fraction}
                      onChange={(e) => onChangeRow(index, { allow_fraction: e.target.checked })}
                      disabled={rowLocked}
                      className="rounded"
                    />
                    Permite fracciones
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.active}
                      onChange={(e) => onChangeRow(index, { active: e.target.checked })}
                      disabled={rowLocked}
                      className="rounded"
                    />
                    Activa
                  </label>
                  <div className="flex items-center gap-1.5 text-xs text-gray-700 ml-auto">
                    <label htmlFor={`sort-${index}`} className="text-gray-500">Orden</label>
                    <input
                      id={`sort-${index}`}
                      type="number"
                      value={row.sort_order ?? 0}
                      onChange={(e) => onChangeRow(index, { sort_order: Number(e.target.value) || 0 })}
                      disabled={rowLocked}
                      className="w-14 min-h-[32px] border border-gray-200 rounded-lg px-2 py-1 text-xs tabular-nums disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                </div>
                {row.is_base && (
                  <p className="text-[10px] text-gray-500">
                    La unidad base siempre utiliza factor de conversión 1.
                  </p>
                )}
                {row.id && (
                  <div className="pt-1 border-t border-gray-50">
                    <button
                      type="button"
                      onClick={() => onManageBranchPrices(row)}
                      className="text-xs font-semibold text-[rgb(var(--p700))] hover:text-[rgb(var(--p900))] px-2 py-1 -mx-2 rounded-lg hover:bg-[rgb(var(--p100))]"
                    >
                      Precios por sucursal
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
