import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { clsx } from 'clsx'
import { productsService, type ProductSaleUnit } from '@/services/products.service'

type Props = {
  /** null = línea manual (sin producto de catálogo): nunca hay SaleUnit que elegir. */
  productId: number | null
  /** Product.manage_series del producto de la línea. */
  manageSeries?: boolean
  /** sale_unit_id ya elegido para esta línea (null/undefined = unidad base, comportamiento legacy). */
  value?: number | null
  onChange: (saleUnitId: number | null, saleUnit: ProductSaleUnit | null) => void
  className?: string
}

/**
 * Selector de SaleUnit (unidad de venta comercial, ej. "Saco 100 KG") para una línea de COMPRA —
 * Fase 7H. Componente nuevo y propio de Compras: deliberadamente NO reutiliza
 * `ProductConfigureModal` (POS), que resuelve precio de VENTA y modificadores — conceptos ajenos a
 * una línea de compra, que resuelve costo. Mantenerlos separados evita que un cambio del flujo de
 * venta rompa Compras por accidente, y viceversa.
 *
 * Contrato con el backend (NO se toca ni se reimplementa aquí):
 * - Este componente solo resuelve QUÉ `sale_unit_id` se envía. La conversión cantidad
 *   comercial→base (×factor) y costo comercial→base (÷factor) es responsabilidad EXCLUSIVA del
 *   backend (`purchase_unit_resolver.go`/`purchase_service.go`) — el frontend nunca multiplica ni
 *   divide para construir el payload.
 * - `manageSeries=true` deshabilita el selector porque el backend ya rechaza combinar SaleUnit
 *   con control de series en la misma línea (`validatePurchaseSaleUnits`) — se explica aquí en vez
 *   de dejar que el usuario descubra un 400 recién al guardar.
 * - Un producto sin SaleUnits activas (legacy) no muestra ningún selector — la línea sigue el
 *   comportamiento de compra de siempre, sin cambios.
 */
export function PurchaseSaleUnitSelector({ productId, manageSeries, value, onChange, className }: Props) {
  const [saleUnits, setSaleUnits] = useState<ProductSaleUnit[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!productId || manageSeries) {
      setSaleUnits([])
      return
    }
    let cancelled = false
    setLoading(true)
    productsService
      .listSaleUnits(productId)
      .then((units) => {
        if (!cancelled) setSaleUnits(units)
      })
      .catch(() => {
        if (!cancelled) setSaleUnits([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [productId, manageSeries])

  if (manageSeries) {
    return (
      <div
        className={clsx(
          'flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800',
          className,
        )}
      >
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        <span>
          Este producto controla números de serie: todavía no admite unidad de venta (Caja, Saco,
          etc.). Se compra en su unidad base.
        </span>
      </div>
    )
  }

  // Línea manual (sin producto de catálogo): nunca hay SaleUnit que elegir.
  if (!productId) return null

  if (loading) {
    return <span className="text-[11px] text-gray-400">Cargando unidades de venta…</span>
  }

  // Producto legacy sin SaleUnits activas: sin selector, comportamiento de compra intacto.
  if (saleUnits.length === 0) return null

  const selectedId = value ?? null
  const selected = selectedId != null ? saleUnits.find((su) => su.id === selectedId) ?? null : null

  return (
    <div className={className}>
      <select
        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
        value={selectedId ?? ''}
        onChange={(e) => {
          const id = e.target.value === '' ? null : Number(e.target.value)
          const su = id == null ? null : saleUnits.find((u) => u.id === id) ?? null
          onChange(id, su)
        }}
        aria-label="Unidad de venta para esta compra"
      >
        <option value="">Unidad base (sin unidad de venta)</option>
        {saleUnits.map((su) => (
          <option key={su.id} value={su.id}>
            {su.name} — factor {su.conversion_factor}
          </option>
        ))}
      </select>
      {selected && (
        <p className="mt-1 text-[11px] leading-snug text-gray-500">
          1 {selected.name} = {selected.conversion_factor} unidad(es) base
          {selected.allow_fraction ? ' · admite cantidades decimales' : ' · solo cantidades enteras'}
        </p>
      )}
    </div>
  )
}
