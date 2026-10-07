import { useEffect, useMemo, useState } from 'react'
import { X, Minus, Plus } from 'lucide-react'
import type { ProductReportRow } from '@/services/products.service'
import { publicEcommerceService, type PublicProductOptions } from '@/services/ecommerce.service'
import type { StoreLineSelection } from './storeCart'
import ProductGallery from './ProductGallery'

/** Producto que obliga a elegir algo antes de agregarlo al carrito. */
export function productNeedsOptions(p: ProductReportRow): boolean {
  return Boolean(p.has_variants || p.has_modifiers || p.has_sale_units)
}

/** Línea ya resuelta con lo que eligió el cliente (el servidor vuelve a calcular el precio al pedir). */
export interface ChosenLine {
  unit_price: number
  detail?: string
  selection: StoreLineSelection
}

function formatSoles(n: number): string {
  return `S/ ${Number(n).toFixed(2)}`
}

/** Entero tal cual; con decimales (ej. productos por peso) recorta ceros de más. */
function formatStockQty(n: number): string {
  return Number.isInteger(n) ? String(n) : Number(n.toFixed(2)).toString()
}

export default function ProductDetailModal({
  product,
  onClose,
  onAdd,
  showStock = true,
}: {
  product: ProductReportRow
  onClose: () => void
  onAdd: (product: ProductReportRow, quantity: number, chosen?: ChosenLine) => void
  /** Ajuste de la tienda (Módulos → Tienda Virtual → General). false = tratar como siempre disponible. */
  showStock?: boolean
}) {
  const [qty, setQty] = useState(1)
  const needsOptions = productNeedsOptions(product)
  const [options, setOptions] = useState<PublicProductOptions | null>(null)
  const [optionsError, setOptionsError] = useState(false)
  const [presentationId, setPresentationId] = useState<number | null>(null)
  // 'base' = unidad base del producto (sin unidad de venta); número = id de la unidad de venta.
  const [unitKey, setUnitKey] = useState<'base' | number | null>(null)
  const [picked, setPicked] = useState<Record<number, number[]>>({})

  useEffect(() => {
    if (!needsOptions) return
    let cancelled = false
    publicEcommerceService
      .getProductOptions(product.id)
      .then((o) => {
        if (cancelled) return
        setOptions(o)
        if (o.presentations.length === 1) setPresentationId(o.presentations[0].id)
        if (o.sale_units.length === 1 && !o.base_unit_name) setUnitKey(o.sale_units[0].id)
      })
      .catch(() => {
        if (!cancelled) setOptionsError(true)
      })
    return () => {
      cancelled = true
    }
  }, [product.id, needsOptions])

  const hasUnits = (options?.sale_units.length ?? 0) > 0
  const chosenUnit = hasUnits && typeof unitKey === 'number' ? options!.sale_units.find((u) => u.id === unitKey) : undefined
  const chosenPres = options?.presentations.find((p) => p.id === presentationId)

  const toggleOption = (gid: number, oid: number, multi: boolean) =>
    setPicked((prev) => {
      const cur = prev[gid] ?? []
      if (multi) return { ...prev, [gid]: cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid] }
      return { ...prev, [gid]: cur.includes(oid) ? [] : [oid] }
    })

  const resolved = useMemo(() => {
    if (!options) return null
    let missing: string | null = null
    let price = options.base_price
    const detail: string[] = []
    const modIds: number[] = []
    const selection: StoreLineSelection = {}
    if (hasUnits) {
      if (unitKey === null) missing = 'Elige la unidad de venta'
      else if (chosenUnit) {
        price = chosenUnit.price
        selection.sale_unit_id = chosenUnit.id
        detail.push(chosenUnit.name)
      }
    } else {
      if (options.presentations.length > 0) {
        if (!chosenPres) missing = 'Elige una presentación'
        else {
          price = chosenPres.sale_price
          selection.presentation_id = chosenPres.id
          detail.push(chosenPres.name)
        }
      }
      for (const g of options.modifier_groups) {
        const ids = picked[g.id] ?? []
        if (g.required && ids.length === 0 && !missing) missing = `Elige una opción de ${g.name}`
        for (const o of g.options) {
          if (ids.includes(o.id)) {
            price += o.extra_price
            modIds.push(o.id)
            detail.push(o.extra_price > 0 ? `+ ${o.name}` : o.name)
          }
        }
      }
      if (modIds.length) selection.modifier_option_ids = modIds
    }
    return { price: Math.round(price * 100) / 100, detail: detail.join(' · '), selection, missing }
  }, [options, hasUnits, unitKey, chosenUnit, chosenPres, picked])

  const presStock = chosenPres?.stock
  const stockQty = Number(product.stock_total ?? 0)
  const outOfStock = showStock && Boolean(product.manage_stock) && stockQty <= 0
  const showStockQty = showStock && Boolean(product.manage_stock) && stockQty > 0

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/90 text-gray-500 hover:text-gray-700 shadow"
        >
          <X size={18} />
        </button>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <ProductGallery productId={product.id} mainImage={product.image_url} name={product.name}>
            {outOfStock && (
              <span className="absolute top-3 left-3 bg-gray-900/80 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                Agotado
              </span>
            )}
          </ProductGallery>
          <div className="p-5 flex flex-col">
            {product.category_name && (
              <span className="text-[11px] uppercase tracking-wide font-semibold mb-1" style={{ color: 'rgb(var(--vs-primary))' }}>
                {product.category_name}
              </span>
            )}
            <h2 className="text-lg font-bold text-gray-800 mb-2">{product.name}</h2>
            {product.description && <p className="text-sm text-gray-500 mb-4 whitespace-pre-line flex-1">{product.description}</p>}
            <div className="flex items-center justify-between mb-4">
              <span className="text-2xl font-extrabold" style={{ color: 'rgb(var(--vs-primary))' }}>
                {needsOptions && resolved && !resolved.missing
                  ? formatSoles(resolved.price)
                  : needsOptions && options && options.presentations.length > 0 && !hasUnits
                    ? `Desde ${formatSoles(Math.min(...options.presentations.map((p) => p.sale_price)))}`
                    : product.has_variants && product.min_presentation_price !== undefined && !(Number(product.sale_price) > 0)
                      ? `Desde ${formatSoles(product.min_presentation_price)}`
                      : formatSoles(product.sale_price)}
              </span>
              {product.unit && !hasUnits && <span className="text-xs text-gray-400">por {product.unit.toLowerCase()}</span>}
            </div>
            {showStockQty && !needsOptions && (
              <p className="text-xs text-gray-400 -mt-3 mb-4">Stock disponible: {formatStockQty(stockQty)}</p>
            )}
            {needsOptions && !options && !optionsError && <p className="text-xs text-gray-400 mb-4">Cargando opciones…</p>}
            {needsOptions && optionsError && (
              <p className="text-xs text-red-500 mb-4">No se pudieron cargar las opciones. Cierra e intenta de nuevo.</p>
            )}
            {options && hasUnits && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-600 mb-1.5">Unidad de venta</p>
                <div className="flex flex-wrap gap-2">
                  {options.base_unit_name && (
                    <button
                      type="button"
                      onClick={() => setUnitKey('base')}
                      className={`px-3 py-1.5 rounded-full border text-xs ${unitKey === 'base' ? 'text-white border-transparent' : 'border-gray-200 text-gray-700'}`}
                      style={unitKey === 'base' ? { background: 'rgb(var(--vs-primary))' } : undefined}
                    >
                      {options.base_unit_name} · {formatSoles(options.base_price)}
                    </button>
                  )}
                  {options.sale_units.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setUnitKey(u.id)}
                      className={`px-3 py-1.5 rounded-full border text-xs ${unitKey === u.id ? 'text-white border-transparent' : 'border-gray-200 text-gray-700'}`}
                      style={unitKey === u.id ? { background: 'rgb(var(--vs-primary))' } : undefined}
                    >
                      {u.name} · {formatSoles(u.price)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {options && !hasUnits && options.presentations.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-600 mb-1.5">Presentación</p>
                <div className="flex flex-wrap gap-2">
                  {options.presentations.map((p) => {
                    const soldOut = showStock && p.stock !== undefined && p.stock <= 0
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={soldOut}
                        onClick={() => setPresentationId(p.id)}
                        className={`px-3 py-1.5 rounded-full border text-xs disabled:opacity-40 disabled:line-through ${presentationId === p.id ? 'text-white border-transparent' : 'border-gray-200 text-gray-700'}`}
                        style={presentationId === p.id ? { background: 'rgb(var(--vs-primary))' } : undefined}
                      >
                        {p.name} · {formatSoles(p.sale_price)}
                      </button>
                    )
                  })}
                </div>
                {showStock && presStock !== undefined && presStock > 0 && (
                  <p className="text-[11px] text-gray-400 mt-1.5">Stock disponible: {formatStockQty(presStock)}</p>
                )}
              </div>
            )}
            {options && !hasUnits &&
              options.modifier_groups.map((g) => (
                <div key={g.id} className="mb-4">
                  <p className="text-xs font-semibold text-gray-600 mb-1.5">
                    {g.name}
                    <span className="font-normal text-gray-400">{g.required ? ' · obligatorio' : ' · opcional'}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {g.options.map((o) => {
                      const on = (picked[g.id] ?? []).includes(o.id)
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => toggleOption(g.id, o.id, g.multi_select)}
                          className={`px-3 py-1.5 rounded-full border text-xs ${on ? 'text-white border-transparent' : 'border-gray-200 text-gray-700'}`}
                          style={on ? { background: 'rgb(var(--vs-primary))' } : undefined}
                        >
                          {o.name}
                          {o.extra_price > 0 ? ` (+${formatSoles(o.extra_price)})` : ''}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            {!outOfStock && (
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs text-gray-500">Cantidad</span>
                <div className="flex items-center gap-2 border border-gray-200 rounded-full px-1 py-1">
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="p-1.5 rounded-full hover:bg-gray-100">
                    <Minus size={13} />
                  </button>
                  <span className="w-6 text-center text-sm font-medium">{qty}</span>
                  <button type="button" onClick={() => setQty((q) => q + 1)} className="p-1.5 rounded-full hover:bg-gray-100">
                    <Plus size={13} />
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              disabled={outOfStock || (needsOptions && (!resolved || Boolean(resolved.missing)))}
              onClick={() =>
                onAdd(
                  product,
                  qty,
                  needsOptions && resolved
                    ? { unit_price: resolved.price, detail: resolved.detail || undefined, selection: resolved.selection }
                    : undefined,
                )
              }
              className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-40"
              style={{ background: 'rgb(var(--vs-primary))' }}
            >
              {outOfStock ? 'Agotado' : needsOptions && resolved?.missing ? resolved.missing : 'Agregar al carrito'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
