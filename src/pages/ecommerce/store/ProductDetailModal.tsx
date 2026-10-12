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

  const unitPrice: number | null =
    needsOptions && resolved && !resolved.missing
      ? resolved.price
      : product.has_variants && product.min_presentation_price !== undefined && !(Number(product.sale_price) > 0)
        ? null
        : Number(product.sale_price)
  const priceLabel =
    needsOptions && resolved && !resolved.missing
      ? formatSoles(resolved.price)
      : needsOptions && options && options.presentations.length > 0 && !hasUnits
        ? `Desde ${formatSoles(Math.min(...options.presentations.map((p) => p.sale_price)))}`
        : product.has_variants && product.min_presentation_price !== undefined && !(Number(product.sale_price) > 0)
          ? `Desde ${formatSoles(product.min_presentation_price)}`
          : formatSoles(product.sale_price)
  const lowStock = showStockQty && stockQty <= 5

  // Escape cierra; el fondo no se desplaza mientras el detalle está abierto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  const ctaLabel = outOfStock
    ? 'Agotado'
    : needsOptions && resolved?.missing
      ? resolved.missing
      : unitPrice !== null
        ? `Agregar · ${formatSoles(unitPrice * qty)}`
        : 'Agregar al carrito'

  return (
    <div className="vs-ov" role="dialog" aria-modal="true" aria-label={product.name}>
      <div className="bg" onClick={onClose} />
      <div className="vs-dlg">
        <button type="button" onClick={onClose} className="vs-x" aria-label="Cerrar">
          <X size={20} />
        </button>

        <div className="vs-dg-img">
          <ProductGallery productId={product.id} mainImage={product.image_url} name={product.name}>
            {outOfStock && <span className="vs-tag" style={{ top: 14, left: 14 }}>Agotado</span>}
          </ProductGallery>
        </div>

        <div className="vs-dg-col">
          <div className="vs-dg-body">
            <div>
              {product.category_name && (
                <span style={{ font: '700 11.5px var(--vs-fb)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--vs-blue)' }}>
                  {product.category_name}
                </span>
              )}
              <h2 style={{ fontSize: 'clamp(22px, 4vw, 30px)', lineHeight: 1.1, fontWeight: 800, marginTop: 4, paddingRight: 36 }}>{product.name}</h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
              <span className="vs-fd" style={{ fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 800, lineHeight: 1, letterSpacing: '-.03em' }}>
                {priceLabel}
              </span>
              {product.unit && !hasUnits && (
                <span style={{ color: 'var(--vs-muted)', fontSize: 14, paddingBottom: 3 }}>por {product.unit.toLowerCase()}</span>
              )}
              {showStockQty && !needsOptions && (
                <span className={`vs-stock ${lowStock ? 'low' : ''}`} style={{ marginLeft: 'auto', paddingBottom: 3 }}>
                  {lowStock ? `Quedan ${formatStockQty(stockQty)}` : `Stock: ${formatStockQty(stockQty)}`}
                </span>
              )}
            </div>

            {product.description && <p style={{ color: 'var(--vs-muted)', margin: 0, whiteSpace: 'pre-line' }}>{product.description}</p>}

            {needsOptions && !options && !optionsError && <p style={{ color: 'var(--vs-muted)', fontSize: 14, margin: 0 }}>Cargando opciones…</p>}
            {needsOptions && optionsError && (
              <p style={{ color: '#c0392b', fontSize: 14, margin: 0 }}>No se pudieron cargar las opciones. Cierra e intenta de nuevo.</p>
            )}

            {options && hasUnits && (
              <div>
                <div className="vs-lbl">Unidad de venta <em>Obligatorio</em></div>
                <div className="vs-chips">
                  {options.base_unit_name && (
                    <button type="button" onClick={() => setUnitKey('base')} className={`vs-opt ${unitKey === 'base' ? 'on' : ''}`} aria-pressed={unitKey === 'base'}>
                      {options.base_unit_name}
                      <small>{formatSoles(options.base_price)}</small>
                    </button>
                  )}
                  {options.sale_units.map((u) => (
                    <button key={u.id} type="button" onClick={() => setUnitKey(u.id)} className={`vs-opt ${unitKey === u.id ? 'on' : ''}`} aria-pressed={unitKey === u.id}>
                      {u.name}
                      <small>{formatSoles(u.price)}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {options && !hasUnits && options.presentations.length > 0 && (
              <div>
                <div className="vs-lbl">Presentación <em>Obligatorio</em></div>
                <div className="vs-chips">
                  {options.presentations.map((p) => {
                    const soldOut = showStock && p.stock !== undefined && p.stock <= 0
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={soldOut}
                        onClick={() => setPresentationId(p.id)}
                        className={`vs-opt ${presentationId === p.id ? 'on' : ''}`}
                        aria-pressed={presentationId === p.id}
                      >
                        {p.name}
                        <small>{soldOut ? 'Agotado' : formatSoles(p.sale_price)}</small>
                      </button>
                    )
                  })}
                </div>
                {showStock && presStock !== undefined && presStock > 0 && (
                  <p style={{ fontSize: 12.5, color: 'var(--vs-muted)', margin: '8px 0 0' }}>Stock disponible: {formatStockQty(presStock)}</p>
                )}
              </div>
            )}

            {options && !hasUnits &&
              options.modifier_groups.map((g) => (
                <div key={g.id}>
                  <div className="vs-lbl">
                    {g.name} <em className={g.required ? '' : 'o'}>{g.required ? 'Obligatorio' : 'Opcional'}</em>
                  </div>
                  <div className="vs-chips">
                    {g.options.map((o) => {
                      const on = (picked[g.id] ?? []).includes(o.id)
                      return (
                        <button key={o.id} type="button" onClick={() => toggleOption(g.id, o.id, g.multi_select)} className={`vs-opt ${on ? 'on' : ''}`} aria-pressed={on}>
                          {o.name}
                          {o.extra_price > 0 && <small>+ {formatSoles(o.extra_price)}</small>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
          </div>

          <div className="vs-dg-foot">
            {!outOfStock && (
              <div className="vs-qty">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Menos"><Minus size={17} /></button>
                <span aria-live="polite">{qty}</span>
                <button type="button" onClick={() => setQty((q) => q + 1)} aria-label="Más"><Plus size={17} /></button>
              </div>
            )}
            <button
              type="button"
              className="vs-btn"
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
            >
              {ctaLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
