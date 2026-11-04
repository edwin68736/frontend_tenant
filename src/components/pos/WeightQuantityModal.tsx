import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { inventoryService } from '@/services/inventory.service'
import type { Product } from '@/services/products.service'
import { createCatalogCartLine, type CatalogCartLine } from '@/utils/posCart'

/**
 * Venta por peso/volumen de un producto cuya unidad base es KGM (kilo) o LTR (litro).
 *
 * El producto guarda el precio de UN kilo/litro y el stock en kilos/litros. El cajero escribe cuánto
 * lleva el cliente (en gramos/mililitros o en kilos/litros) o cuánto dinero quiere gastar, y la línea
 * se agrega con la cantidad en la unidad base (máx. 3 decimales) y el precio del kilo/litro. No hay
 * unidad de venta ni conversión de precio: lo que sale en el comprobante es "0.250 KGM × S/ 4.50".
 */

export type WeightKind = 'mass' | 'volume'

/** Tipo de venta por peso/volumen según la unidad base del producto; null si no aplica. */
export function weightKindOfUnit(unit: string | undefined | null): WeightKind | null {
  const u = String(unit ?? '').trim().toUpperCase()
  if (u === 'KGM') return 'mass'
  if (u === 'LTR') return 'volume'
  return null
}

const CONFIG = {
  mass: {
    big: 'kg',
    small: 'g',
    bigName: 'kilo',
    quick: [
      { label: '100g', small: true, value: 100 },
      { label: '250g', small: true, value: 250 },
      { label: '500g', small: true, value: 500 },
      { label: '1kg', small: false, value: 1 },
    ],
  },
  volume: {
    big: 'L',
    small: 'ml',
    bigName: 'litro',
    quick: [
      { label: '100ml', small: true, value: 100 },
      { label: '250ml', small: true, value: 250 },
      { label: '500ml', small: true, value: 500 },
      { label: '1L', small: false, value: 1 },
    ],
  },
} as const

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const fmtQty = (n: number) => n.toFixed(3).replace(/\.?0+$/, '')

type Props = {
  product: Product | null
  branchId?: number | null
  /** Solo se consulta/valida el stock si el cajero puede verlo; si no, lo valida el servidor al cobrar. */
  canViewStock?: boolean
  onClose: () => void
  onConfirm: (line: CatalogCartLine) => void
}

export function WeightQuantityModal({ product, branchId, canViewStock = true, onClose, onConfirm }: Props) {
  return (
    <Modal open={!!product} onClose={onClose} closeOnBackdropClick={false} contentClassName="max-w-md">
      {product ? (
        <WeightForm
          key={product.id}
          product={product}
          branchId={branchId}
          canViewStock={canViewStock}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      ) : null}
    </Modal>
  )
}

function WeightForm({
  product,
  branchId,
  canViewStock,
  onClose,
  onConfirm,
}: Omit<Props, 'product'> & { product: Product }) {
  const kind = weightKindOfUnit(product.unit) ?? 'mass'
  const cfg = CONFIG[kind]
  const price = Number(product.sale_price) || 0

  const [mode, setMode] = useState<'weight' | 'amount'>('weight')
  const [useSmall, setUseSmall] = useState(true)
  const [raw, setRaw] = useState('')
  const [stock, setStock] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [mode])

  useEffect(() => {
    if (!product.manage_stock || !canViewStock) return
    let alive = true
    inventoryService
      .getStock(product.id, branchId ?? undefined)
      .then((rows) => {
        if (alive) setStock(rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [product.id, product.manage_stock, canViewStock, branchId])

  const value = Number(raw.replace(',', '.'))
  const hasValue = raw.trim() !== '' && Number.isFinite(value) && value > 0

  // Cantidad en la unidad base (kg / L), con los 3 decimales que persiste la BD.
  const qty = useMemo(() => {
    if (!hasValue) return 0
    if (mode === 'amount') return price > 0 ? round3(value / price) : 0
    return round3(useSmall ? value / 1000 : value)
  }, [hasValue, mode, value, price, useSmall])

  const total = round2(qty * price)
  const overStock = stock != null && qty > stock + 1e-9
  const tooSmall = hasValue && qty < 0.001
  const canAdd = hasValue && qty >= 0.001 && price > 0 && !overStock

  const applyQuick = (q: { small: boolean; value: number }) => {
    setMode('weight')
    setUseSmall(q.small)
    setRaw(String(q.value))
  }

  const confirm = () => {
    if (!canAdd) return
    onConfirm(createCatalogCartLine(product, { quantity: qty, base_price: price }))
    onClose()
  }

  const tab = (active: boolean) =>
    `px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
      active
        ? 'bg-[rgb(var(--p600))] border-[rgb(var(--p600))] text-white'
        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
    }`

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-gray-900 text-xl leading-tight">{product.name}</h3>

      <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
        <div>
          <p className="text-xs text-gray-500">{stock != null ? 'Stock disponible' : 'Unidad'}</p>
          <p className="text-sm font-semibold text-gray-800 tabular-nums">
            {stock != null ? `${stock.toFixed(3)} ${cfg.big}` : cfg.bigName}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Precio</p>
          <p className="text-sm font-bold text-[rgb(var(--p700))] tabular-nums">
            S/ {price.toFixed(2)}/{cfg.big}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" className={tab(mode === 'weight')} onClick={() => { setMode('weight'); setRaw('') }}>
          {kind === 'mass' ? 'Por peso' : 'Por volumen'}
        </button>
        <button type="button" className={tab(mode === 'amount')} onClick={() => { setMode('amount'); setRaw('') }}>
          Por monto
        </button>
      </div>

      {mode === 'weight' ? (
        <>
          <div>
            <p className="text-sm text-gray-500 mb-2">{kind === 'mass' ? 'Peso rápido' : 'Volumen rápido'}</p>
            <div className="flex flex-wrap gap-2">
              {cfg.quick.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => applyQuick(q)}
                  className="px-4 py-2 rounded-full border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-stretch gap-3">
            <label className="flex-1 relative">
              <span className="absolute -top-2 left-3 bg-white px-1 text-xs text-[rgb(var(--p700))]">
                Cantidad ({useSmall ? cfg.small : cfg.big})
              </span>
              <input
                ref={inputRef}
                type="number"
                min={0}
                step={useSmall ? 1 : 'any'}
                inputMode="decimal"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirm()}
                placeholder={useSmall ? 'Ej: 250' : 'Ej: 1.5'}
                className="w-full h-full border-2 border-[rgb(var(--p600))] rounded-xl px-3 py-3 text-lg outline-none tabular-nums"
              />
            </label>
            <div className="flex rounded-xl bg-gray-100 p-1 self-center">
              {[false, true].map((small) => (
                <button
                  key={String(small)}
                  type="button"
                  onClick={() => {
                    // Al cambiar de unidad se conserva lo que ya pesa: 250 g ↔ 0.25 kg.
                    if (hasValue && small !== useSmall) {
                      setRaw(String(round3(small ? value * 1000 : value / 1000)))
                    }
                    setUseSmall(small)
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    useSmall === small ? 'bg-white shadow text-gray-900' : 'text-gray-500'
                  }`}
                >
                  {small ? cfg.small : cfg.big}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <label className="block relative">
          <span className="absolute -top-2 left-3 bg-white px-1 text-xs text-[rgb(var(--p700))]">Monto a cobrar (S/)</span>
          <input
            ref={inputRef}
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirm()}
            placeholder="Ej: 5.00"
            className="w-full border-2 border-[rgb(var(--p600))] rounded-xl px-3 py-3 text-lg outline-none tabular-nums"
          />
        </label>
      )}

      {hasValue && qty >= 0.001 && (
        <p className="text-sm text-gray-600 tabular-nums">
          {mode === 'amount' ? 'Equivale a ' : 'Llevas '}
          <span className="font-semibold">{fmtQty(qty)} {cfg.big}</span>
          {qty < 1 && ` (${Math.round(qty * 1000)} ${cfg.small})`}
        </p>
      )}
      {tooSmall && <p className="text-sm text-red-600">La cantidad mínima es 0.001 {cfg.big}.</p>}
      {overStock && stock != null && (
        <p className="text-sm text-red-600">
          Supera el stock disponible ({stock.toFixed(3)} {cfg.big}).
        </p>
      )}
      {price <= 0 && <p className="text-sm text-red-600">El producto no tiene precio de venta.</p>}

      <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
        <span className="font-semibold text-gray-800">Total</span>
        <span className="text-2xl font-bold text-[rgb(var(--p700))] tabular-nums">S/ {total.toFixed(2)}</span>
      </div>

      <div className="flex items-center justify-end gap-3 pt-1">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-[rgb(var(--p700))]">
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!canAdd}
          className="px-6 py-3 rounded-xl bg-[rgb(var(--p600))] text-white font-semibold disabled:bg-gray-200 disabled:text-gray-400"
        >
          Agregar
        </button>
      </div>
    </div>
  )
}
