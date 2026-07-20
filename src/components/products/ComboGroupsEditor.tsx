import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Plus, Trash2, Search, Loader2, GripVertical } from 'lucide-react'
import {
  productsService,
  type ComboGroup,
  type ComboSelectionType,
  type Product,
} from '@/services/products.service'
import { formatAmountDisplay } from '@/utils/money'

const SELECTION_LABELS: Record<ComboSelectionType, { label: string; hint: string }> = {
  fixed: { label: 'Fijo', hint: 'Siempre incluido. El cliente no elige.' },
  single: { label: 'Elige una', hint: 'El cliente elige exactamente una opción.' },
  multiple: { label: 'Elige varias', hint: 'El cliente elige entre un mínimo y un máximo.' },
}

const newGroup = (sortOrder: number): ComboGroup => ({
  name: '',
  selection_type: 'fixed',
  min_select: 1,
  max_select: 1,
  allow_quantity: false,
  sort_order: sortOrder,
  items: [],
})

type Props = {
  groups: ComboGroup[]
  onChange: (groups: ComboGroup[]) => void
  branchId?: number | null
  /** Producto que se está editando: no puede ser componente de sí mismo. */
  excludeProductId?: number | null
}

export function ComboGroupsEditor({ groups, onChange, branchId, excludeProductId }: Props) {
  const patchGroup = (index: number, patch: Partial<ComboGroup>) => {
    onChange(groups.map((g, i) => (i === index ? { ...g, ...patch } : g)))
  }

  const changeSelectionType = (index: number, type: ComboSelectionType) => {
    const g = groups[index]
    // Cada tipo tiene sus propias reglas; se normalizan aquí igual que en el backend.
    if (type === 'fixed') {
      patchGroup(index, {
        selection_type: type,
        min_select: 1,
        max_select: 1,
        allow_quantity: false,
        items: g.items.slice(0, 1),
      })
      return
    }
    if (type === 'single') {
      patchGroup(index, { selection_type: type, min_select: 1, max_select: 1, allow_quantity: false })
      return
    }
    patchGroup(index, {
      selection_type: type,
      min_select: 1,
      max_select: Math.max(1, g.items.length),
    })
  }

  const addItem = (index: number, product: Product) => {
    const g = groups[index]
    if (g.items.some((it) => it.product_id === product.id)) return
    const items = [
      ...g.items,
      {
        product_id: product.id,
        product_name: product.name,
        product_code: product.code,
        product_sale_price: Number(product.sale_price) || 0,
        default_quantity: 1,
        max_quantity: 1,
        extra_price: 0,
        is_default: g.items.length === 0 && g.selection_type !== 'fixed',
        sort_order: g.items.length,
      },
    ]
    // Un grupo fijo solo admite un producto.
    patchGroup(index, {
      items: g.selection_type === 'fixed' ? items.slice(-1) : items,
      ...(g.selection_type === 'multiple' ? { max_select: Math.max(g.max_select, items.length) } : {}),
    })
  }

  const removeItem = (index: number, productId: number) => {
    const g = groups[index]
    const items = g.items.filter((it) => it.product_id !== productId)
    patchGroup(index, {
      items,
      ...(g.selection_type === 'multiple'
        ? { max_select: Math.min(g.max_select, Math.max(1, items.length)) }
        : {}),
    })
  }

  return (
    <div className="space-y-3">
      {groups.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-stone-200 p-4 text-center">
          <p className="text-sm text-stone-500">
            Un combo se arma con grupos. Ej: «Plato principal» fijo con el pollo, y «Bebida» para
            que el cliente elija.
          </p>
        </div>
      )}

      {groups.map((g, index) => (
        <div key={index} className="rounded-xl border-2 border-amber-200 bg-amber-50/40 p-3 space-y-3">
          <div className="flex items-start gap-2">
            <GripVertical size={16} className="text-amber-400 mt-2 shrink-0" />
            <input
              value={g.name}
              onChange={(e) => patchGroup(index, { name: e.target.value })}
              placeholder="Nombre del grupo (ej: Bebida)"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              type="button"
              onClick={() => onChange(groups.filter((_, i) => i !== index))}
              className="p-2 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 shrink-0"
              aria-label="Quitar grupo"
            >
              <Trash2 size={16} />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(SELECTION_LABELS) as ComboSelectionType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => changeSelectionType(index, type)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg border-2 text-xs font-medium transition',
                  g.selection_type === type
                    ? 'border-amber-500 bg-amber-500 text-white'
                    : 'border-stone-200 bg-white text-stone-600 hover:border-amber-300',
                )}
              >
                {SELECTION_LABELS[type].label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-amber-700/90 -mt-1.5">
            {SELECTION_LABELS[g.selection_type].hint}
          </p>

          {g.selection_type === 'multiple' && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-stone-600">
                Mínimo
                <input
                  type="number"
                  min={0}
                  max={Math.max(1, g.items.length)}
                  value={g.min_select}
                  onChange={(e) =>
                    patchGroup(index, { min_select: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="w-16 px-2 py-1 rounded-md border border-stone-200 text-sm"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-stone-600">
                Máximo
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, g.items.length)}
                  value={g.max_select}
                  onChange={(e) =>
                    patchGroup(index, { max_select: Math.max(1, Number(e.target.value) || 1) })
                  }
                  className="w-16 px-2 py-1 rounded-md border border-stone-200 text-sm"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-stone-600">
                <input
                  type="checkbox"
                  checked={!!g.allow_quantity}
                  onChange={(e) => patchGroup(index, { allow_quantity: e.target.checked })}
                  className="rounded border-stone-300"
                />
                Permitir cantidad
              </label>
            </div>
          )}

          <div className="space-y-1.5">
            {g.items.map((item) => (
              <div
                key={item.product_id}
                className="flex items-center gap-2 rounded-lg bg-white border border-stone-200 px-2.5 py-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone-800 truncate">{item.product_name}</p>
                  <p className="text-[11px] text-stone-500">
                    {formatAmountDisplay(item.product_sale_price ?? 0)}
                                      </p>
                </div>

                <label className="flex items-center gap-1 text-[11px] text-stone-500 shrink-0">
                  Cant.
                  <input
                    type="number"
                    min={1}
                    value={item.default_quantity}
                    onChange={(e) => {
                      const qty = Math.max(1, Number(e.target.value) || 1)
                      patchGroup(index, {
                        items: g.items.map((it) =>
                          it.product_id === item.product_id
                            ? { ...it, default_quantity: qty, max_quantity: Math.max(qty, it.max_quantity) }
                            : it,
                        ),
                      })
                    }}
                    className="w-14 px-1.5 py-1 rounded-md border border-stone-200 text-sm"
                  />
                </label>

                {g.allow_quantity && (
                  <label className="flex items-center gap-1 text-[11px] text-stone-500 shrink-0">
                    Máx.
                    <input
                      type="number"
                      min={item.default_quantity}
                      value={item.max_quantity}
                      onChange={(e) =>
                        patchGroup(index, {
                          items: g.items.map((it) =>
                            it.product_id === item.product_id
                              ? {
                                  ...it,
                                  max_quantity: Math.max(it.default_quantity, Number(e.target.value) || 1),
                                }
                              : it,
                          ),
                        })
                      }
                      className="w-14 px-1.5 py-1 rounded-md border border-stone-200 text-sm"
                    />
                  </label>
                )}

                {g.selection_type !== 'fixed' && (
                  <label className="flex items-center gap-1 text-[11px] text-stone-500 shrink-0">
                    +S/
                    <input
                      type="number"
                      min={0}
                      step="0.10"
                      value={item.extra_price}
                      onChange={(e) =>
                        patchGroup(index, {
                          items: g.items.map((it) =>
                            it.product_id === item.product_id
                              ? { ...it, extra_price: Math.max(0, Number(e.target.value) || 0) }
                              : it,
                          ),
                        })
                      }
                      className="w-16 px-1.5 py-1 rounded-md border border-stone-200 text-sm"
                    />
                  </label>
                )}

                {g.selection_type !== 'fixed' && (
                  <label
                    className="flex items-center gap-1 text-[11px] text-stone-500 shrink-0"
                    title="Opción preseleccionada en el POS"
                  >
                    <input
                      type="radio"
                      name={`combo-default-${index}`}
                      checked={!!item.is_default}
                      onChange={() =>
                        patchGroup(index, {
                          items: g.items.map((it) => ({
                            ...it,
                            is_default: it.product_id === item.product_id,
                          })),
                        })
                      }
                    />
                    Def.
                  </label>
                )}

                <button
                  type="button"
                  onClick={() => removeItem(index, item.product_id)}
                  className="p-1.5 rounded-md text-stone-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                  aria-label="Quitar producto"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {g.selection_type === 'fixed' && g.items.length >= 1 ? (
            <p className="text-[11px] text-stone-500">
              Un grupo fijo lleva un solo producto. Agregar otro reemplaza el actual.
            </p>
          ) : null}

          <ComboProductPicker
            branchId={branchId}
            excludeProductId={excludeProductId}
            excludeIds={g.items.map((it) => it.product_id)}
            onPick={(p) => addItem(index, p)}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...groups, newGroup(groups.length)])}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50"
      >
        <Plus size={16} />
        Agregar grupo
      </button>
    </div>
  )
}

type PickerProps = {
  branchId?: number | null
  excludeProductId?: number | null
  excludeIds: number[]
  onPick: (product: Product) => void
}

/** Buscador de componentes. Pide exclude_combos: un combo no puede contener otro combo. */
function ComboProductPicker({ branchId, excludeProductId, excludeIds, onPick }: PickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const genRef = useRef(0)

  useEffect(() => {
    const term = query.trim()
    if (!term) return
    const gen = ++genRef.current
    const timer = setTimeout(() => {
      setLoading(true)
      productsService
        .list(term, undefined, undefined, true, 1, 20, undefined, undefined, branchId ?? undefined, true)
        .then((r) => {
          if (genRef.current !== gen) return
          setResults(r.data ?? [])
        })
        .catch(() => {
          if (genRef.current === gen) setResults([])
        })
        .finally(() => {
          if (genRef.current === gen) setLoading(false)
        })
    }, 250)
    return () => clearTimeout(timer)
  }, [query, branchId])

  // Sin término no se muestra nada: así los resultados previos no se pintan mientras se reescribe.
  const visible = useMemo(
    () =>
      query.trim()
        ? results.filter((p) => p.id !== excludeProductId && !excludeIds.includes(p.id))
        : [],
    [query, results, excludeProductId, excludeIds],
  )

  return (
    <div className="relative">
      <div className="relative">
        <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Buscar producto para agregar…"
          className="w-full pl-8 pr-8 py-2 rounded-lg border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        {loading && (
          <Loader2 size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 animate-spin" />
        )}
      </div>

      {open && query.trim() !== '' && (
        <div className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg">
          {visible.length === 0 && !loading ? (
            <p className="px-3 py-2.5 text-xs text-stone-500">Sin resultados.</p>
          ) : (
            visible.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(p)
                  setQuery('')
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-2 hover:bg-amber-50 border-b border-stone-100 last:border-0"
              >
                <span className="text-sm text-stone-800">{p.name}</span>
                <span className="ml-2 text-xs text-stone-500">
                  {formatAmountDisplay(Number(p.sale_price) || 0)}
                                  </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
