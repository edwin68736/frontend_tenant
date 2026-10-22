import { useState } from 'react'
import { Package, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { ProductPickerModal } from '@/components/sales/ProductPickerModal'
import type { Product } from '@/services/products.service'
import { normalizeSunatUnit, sunatUnitDisplayName, sunatUnitSelectOptions } from '@/constants/sunatUnits'
import { newKey, type DespatchDraft, type LineItem } from './despatchModel'
import { inputCls } from './ui'

const th = 'text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase'

/**
 * Ítems de la guía: se eligen del catálogo de productos de Tukifac («Agregar producto», el mismo
 * selector de ventas) o se escriben a mano («Producto manual»). El resto de la carga (peso,
 * bultos) lo pide el formulario junto a la tabla.
 */
export function ItemsTable({ draft, onPatch }: { draft: DespatchDraft; onPatch: (p: Partial<DespatchDraft>) => void }) {
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
  }

  const patchItem = (key: string, p: Partial<LineItem>) => setItems(draft.items.map((it) => (it.key === key ? { ...it, ...p } : it)))
  const fromCatalog = (it: LineItem) => Boolean(it.product_id) || Boolean(draft.sourceSaleId)

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPicker(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-medium hover:opacity-90 shrink-0"
        >
          <Plus size={14} /> Agregar producto
        </button>
        <button
          type="button"
          onClick={() => setItems([...draft.items, { key: newKey(), codigo: '', descripcion: '', unidad: 'NIU', cantidad: 1 }])}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50 shrink-0"
        >
          <Package size={14} /> Producto manual
        </button>
        <p className="text-xs text-gray-500 ml-auto">Total de ítems: {draft.items.length}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm min-w-[640px] table-fixed">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className={th}>Descripción</th>
              <th className={`${th} w-[160px]`}>Código</th>
              <th className={`${th} w-28`}>Unid.</th>
              <th className={`${th} w-28`}>Cant.</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {draft.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-gray-500">
                  Aún no hay productos. Usa «Agregar producto» para elegirlos de tu catálogo.
                </td>
              </tr>
            )}
            {draft.items.map((it) => (
              <tr key={it.key} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-2">
                  {fromCatalog(it) ? (
                    <span className="text-gray-800 block truncate">{it.descripcion}</span>
                  ) : (
                    <input className={inputCls} value={it.descripcion} placeholder="Descripción de la mercadería" onChange={(e) => patchItem(it.key, { descripcion: e.target.value })} />
                  )}
                </td>
                <td className="px-3 py-2">
                  {fromCatalog(it) ? (
                    <span className="text-gray-500 text-xs font-mono">{it.codigo}</span>
                  ) : (
                    <input className={inputCls} value={it.codigo} onChange={(e) => patchItem(it.key, { codigo: e.target.value })} />
                  )}
                </td>
                <td className="px-3 py-2">
                  {fromCatalog(it) ? (
                    <span className="text-xs text-gray-600">{sunatUnitDisplayName(it.unidad)}</span>
                  ) : (
                    <select className={inputCls} value={it.unidad} onChange={(e) => patchItem(it.key, { unidad: e.target.value })} aria-label="Unidad">
                      {sunatUnitSelectOptions().map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input type="number" min={0} step="any" aria-label="Cantidad" className={inputCls} value={it.cantidad || ''} onChange={(e) => patchItem(it.key, { cantidad: Number(e.target.value) })} />
                </td>
                <td className="px-1 py-2 text-center">
                  <button type="button" aria-label="Quitar" onClick={() => setItems(draft.items.filter((x) => x.key !== it.key))} className="p-1.5 text-gray-400 hover:text-red-600">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={picker} onClose={() => setPicker(false)} contentClassName="max-w-2xl">
        <ProductPickerModal variant="sale" onAdd={(p) => { addProduct(p); setPicker(false) }} onClose={() => setPicker(false)} />
      </Modal>
    </>
  )
}
