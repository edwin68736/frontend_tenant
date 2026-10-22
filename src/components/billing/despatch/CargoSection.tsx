import { useState } from 'react'
import { PackagePlus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { ProductPickerModal } from '@/components/sales/ProductPickerModal'
import type { Product } from '@/services/products.service'
import { normalizeSunatUnit, sunatUnitDisplayName, sunatUnitSelectOptions } from '@/constants/sunatUnits'
import { getTodayPeru } from '@/utils/datesPeru'
import { newKey, type DespatchDraft, type LineItem } from './despatchModel'
import { Field, inputCls } from './ui'

/** Ítems, peso total, bultos sugeridos y fecha del traslado. */
export function CargoSection({
  draft,
  onPatch,
  allowProducts,
  allowManual,
}: {
  draft: DespatchDraft
  onPatch: (p: Partial<DespatchDraft>) => void
  /** Elegir del catálogo de productos (guía remitente sin comprobante de origen). */
  allowProducts: boolean
  /** Línea libre: mercadería que no está en mi catálogo (guía transportista). */
  allowManual: boolean
}) {
  const [picker, setPicker] = useState(false)

  const setItems = (items: LineItem[]) => {
    const patch: Partial<DespatchDraft> = { items }
    if (!draft.bultosTouched) {
      const sum = items.reduce((s, it) => s + (Number(it.cantidad) || 0), 0)
      if (sum > 0) patch.bultos = String(Math.max(1, Math.ceil(sum)))
    }
    onPatch(patch)
  }

  const addProduct = (p: Product) => {
    const existing = draft.items.find((it) => it.product_id === p.id)
    if (existing) {
      setItems(draft.items.map((it) => (it.key === existing.key ? { ...it, cantidad: it.cantidad + 1 } : it)))
    } else {
      setItems([
        ...draft.items,
        {
          key: newKey(),
          product_id: p.id,
          codigo: p.code ?? '',
          descripcion: p.name,
          unidad: normalizeSunatUnit(p.unit ?? '', p.type ?? 'product'),
          cantidad: 1,
        },
      ])
    }
    toast.success(`«${p.name}» agregado`)
    setPicker(false)
  }

  const patchItem = (key: string, p: Partial<LineItem>) => setItems(draft.items.map((it) => (it.key === key ? { ...it, ...p } : it)))

  return (
    <div className="space-y-4">
      {draft.items.length > 0 ? (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
          {draft.items.map((it) => (
            <li key={it.key} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              {it.product_id || draft.sourceSaleId ? (
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-sm text-gray-900 truncate">{it.descripcion}</p>
                  {it.codigo && <p className="text-[11px] text-gray-400">{it.codigo}</p>}
                </div>
              ) : (
                <input
                  className={`${inputCls} flex-1 basis-48`}
                  value={it.descripcion}
                  placeholder="Descripción de la mercadería"
                  onChange={(e) => patchItem(it.key, { descripcion: e.target.value })}
                />
              )}
              <input
                type="number"
                min={0}
                step="any"
                aria-label="Cantidad"
                className={`${inputCls} w-24`}
                value={it.cantidad || ''}
                onChange={(e) => patchItem(it.key, { cantidad: Number(e.target.value) })}
              />
              {it.product_id || draft.sourceSaleId ? (
                <span className="text-xs text-gray-500 w-20">{sunatUnitDisplayName(it.unidad)}</span>
              ) : (
                <select className={`${inputCls} w-28`} value={it.unidad} onChange={(e) => patchItem(it.key, { unidad: e.target.value })} aria-label="Unidad">
                  {sunatUnitSelectOptions().map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" aria-label="Quitar" onClick={() => setItems(draft.items.filter((x) => x.key !== it.key))} className="p-1.5 text-gray-400 hover:text-red-600">
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-500 rounded-xl border border-dashed border-gray-300 px-3 py-4 text-center">Aún no hay productos en la guía.</p>
      )}

      {(allowProducts || allowManual) && (
        <div className="flex flex-wrap gap-2">
          {allowProducts && (
            <button type="button" onClick={() => setPicker(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">
              <PackagePlus size={15} /> Agregar producto
            </button>
          )}
          {allowManual && (
            <button
              type="button"
              onClick={() => setItems([...draft.items, { key: newKey(), codigo: '', descripcion: '', unidad: 'NIU', cantidad: 1 }])}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Pencil size={14} /> Escribir una línea
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Peso total (kg) *">
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputCls}
            value={draft.peso}
            onChange={(e) => onPatch({ peso: e.target.value })}
            placeholder="0.00"
          />
        </Field>
        <Field label="Bultos" hint={draft.bultosTouched ? undefined : 'Sugerido con la suma de cantidades'}>
          <input
            type="number"
            min={1}
            className={inputCls}
            value={draft.bultos}
            onChange={(e) => onPatch({ bultos: e.target.value, bultosTouched: true })}
          />
        </Field>
        <Field label="Fecha del traslado *">
          <input type="date" min={getTodayPeru()} className={inputCls} value={draft.fecha} onChange={(e) => onPatch({ fecha: e.target.value })} />
        </Field>
      </div>

      <Modal open={picker} onClose={() => setPicker(false)} contentClassName="max-w-2xl">
        <ProductPickerModal variant="sale" onAdd={addProduct} onClose={() => setPicker(false)} />
      </Modal>
    </div>
  )
}
