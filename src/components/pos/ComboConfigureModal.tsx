import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Layers, X } from 'lucide-react'
import {
  productsService,
  type ComboGroup,
  type Product,
} from '@/services/products.service'
import { PortalModal } from '@/components/ui/PortalModal'
import {
  calcComboComponentsListTotal,
  calcComboUnitPrice,
  componentsToSelections,
  defaultComboPicks,
  resolveComboComponents,
  validateComboPicks,
  type ComboPicks,
} from '@/utils/comboCart'
import { createCatalogCartLine, type CatalogCartLine } from '@/utils/posCart'
import { formatMoney } from '@/utils/format'
import { MODAL_FOOTER_SAFE } from '@/utils/safeAreaClasses'

type Props = {
  product: Product | null
  onClose: () => void
  onConfirm: (line: CatalogCartLine) => void
}

/**
 * Elección de las opciones de un combo antes de mandarlo al carrito.
 *
 * Vive aparte de ProductConfigureModal (modificadores/presentaciones) porque un combo no
 * tiene nada en común con esos: aquí se eligen productos, no variantes del mismo producto.
 */
export function ComboConfigureModal({ product, onClose, onConfirm }: Props) {
  const [groups, setGroups] = useState<ComboGroup[]>([])
  const [picks, setPicks] = useState<ComboPicks>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!product) {
      setGroups([])
      setPicks({})
      return
    }
    let cancelled = false
    setLoading(true)
    productsService
      .get(product.id)
      .then((detail) => {
        if (cancelled) return
        const g = detail.combo_groups ?? []
        setGroups(g)
        setPicks(defaultComboPicks(g))
      })
      .catch(() => {
        if (!cancelled) toast.error('No se pudo cargar el combo')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [product])

  const components = useMemo(() => resolveComboComponents(groups, picks), [groups, picks])
  const basePrice = Number(product?.sale_price) || 0
  const unitPrice = useMemo(() => calcComboUnitPrice(basePrice, components), [basePrice, components])
  const listTotal = useMemo(
    () => calcComboComponentsListTotal(groups, components),
    [groups, components],
  )
  const savings = listTotal - unitPrice

  /** Marca/desmarca una opción respetando el modo del grupo. */
  const toggle = (group: ComboGroup, productId: number, defaultQty: number) => {
    const gid = group.id ?? 0
    if (!gid) return
    setPicks((prev) => {
      const chosen = prev[gid] ?? []
      if (group.selection_type === 'single') {
        return { ...prev, [gid]: [{ product_id: productId, quantity: defaultQty || 1 }] }
      }
      const exists = chosen.some((c) => c.product_id === productId)
      const next = exists
        ? chosen.filter((c) => c.product_id !== productId)
        : [...chosen, { product_id: productId, quantity: defaultQty || 1 }]
      return { ...prev, [gid]: next }
    })
  }

  const setQty = (group: ComboGroup, productId: number, qty: number) => {
    const gid = group.id ?? 0
    if (!gid) return
    setPicks((prev) => ({
      ...prev,
      [gid]: (prev[gid] ?? []).map((c) =>
        c.product_id === productId ? { ...c, quantity: Math.max(1, qty) } : c,
      ),
    }))
  }

  const confirm = () => {
    if (!product) return
    if (groups.length === 0) {
      toast.error('El combo no tiene grupos configurados. Revíselo en Productos → Combos.')
      return
    }
    // Mismas reglas que aplica el backend: si no valida aquí, tampoco allá.
    const error = validateComboPicks(groups, picks)
    if (error) {
      toast.error(error)
      return
    }
    onConfirm(
      createCatalogCartLine(product, {
        base_price: unitPrice,
        combo: { selections: componentsToSelections(groups, components), components },
      }),
    )
  }

  const groupHint = (g: ComboGroup): string => {
    if (g.selection_type === 'fixed') return 'Incluido'
    if (g.selection_type === 'single') return 'Elija 1'
    if (g.max_select > 0) return `Elija de ${g.min_select} a ${g.max_select}`
    return `Elija al menos ${g.min_select}`
  }

  return (
    // El ancho va en PortalModal: su contenedor es w-full, así que un max-w interno
    // dejaba el modal pegado al borde izquierdo en lugar de centrado.
    <PortalModal open={Boolean(product)} onClose={onClose} className="max-w-lg">
      <div className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-2xl bg-white">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-600">
              <Layers size={14} /> Combo
            </p>
            <h3 className="truncate font-bold text-gray-900">{product?.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-[rgb(var(--p600))]" />
            </div>
          ) : groups.length === 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Este combo no tiene grupos configurados. Revíselo en Productos → Combos.
            </p>
          ) : (
            groups.map((g) => {
              const gid = g.id ?? 0
              const chosen = picks[gid] ?? []
              return (
                <section key={gid} className="rounded-xl border border-gray-200 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-gray-800">{g.name}</h4>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      {groupHint(g)}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {g.items.map((it) => {
                      const picked = chosen.some((c) => c.product_id === it.product_id)
                      const qty = chosen.find((c) => c.product_id === it.product_id)?.quantity ?? 1
                      const fixed = g.selection_type === 'fixed'
                      return (
                        <li key={it.product_id}>
                          <label
                            className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${
                              fixed
                                ? 'border-gray-100 bg-gray-50'
                                : picked
                                  ? 'border-[rgb(var(--p400))] bg-[rgb(var(--p50))] cursor-pointer'
                                  : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                            }`}
                          >
                            {!fixed && (
                              <input
                                type={g.selection_type === 'single' ? 'radio' : 'checkbox'}
                                name={`combo-group-${gid}`}
                                checked={picked}
                                onChange={() => toggle(g, it.product_id, it.default_quantity)}
                                className="accent-[rgb(var(--p600))]"
                              />
                            )}
                            <span className="min-w-0 flex-1 truncate text-gray-800">
                              {fixed && it.default_quantity > 1 ? `${it.default_quantity} × ` : ''}
                              {it.product_name ?? `Producto #${it.product_id}`}
                            </span>
                            {Number(it.extra_price) > 0 && (
                              <span className="shrink-0 text-xs font-medium text-amber-700">
                                +{formatMoney(Number(it.extra_price))}
                              </span>
                            )}
                            {!fixed && picked && g.allow_quantity && (
                              <input
                                type="number"
                                min={1}
                                max={it.max_quantity > 0 ? it.max_quantity : undefined}
                                value={qty}
                                onChange={(e) => setQty(g, it.product_id, Number(e.target.value))}
                                onClick={(e) => e.preventDefault()}
                                className="w-14 shrink-0 rounded-lg border border-gray-200 px-2 py-1 text-right text-xs"
                              />
                            )}
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })
          )}
        </div>

        <div className={`border-t border-gray-100 p-4 ${MODAL_FOOTER_SAFE}`}>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-xs text-gray-500">Precio del combo</p>
              <p className="text-xl font-bold text-gray-900">{formatMoney(unitPrice)}</p>
            </div>
            {savings > 0 && (
              <p className="text-xs font-medium text-emerald-700">
                Ahorra {formatMoney(savings)}
                <span className="block text-right text-gray-400 line-through">
                  {formatMoney(listTotal)}
                </span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={loading || groups.length === 0}
              className="flex-1 rounded-xl bg-[rgb(var(--p600))] py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Agregar al carrito
            </button>
          </div>
        </div>
      </div>
    </PortalModal>
  )
}

