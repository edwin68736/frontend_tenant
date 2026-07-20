import { useEffect, useRef, useState } from 'react'
import { Package } from 'lucide-react'
import { roundMoney } from '@/utils/checkoutDiscount'
import { getProductImageUrl } from '@/services/products.service'
import type { PosCartLine } from '@/utils/posCart'
import {
  cartLineLabel,
  cartLineUnitPrice,
  isCatalogCartLine,
  isManualCartLine,
} from '@/utils/posCart'
import { formatModifierLines } from '@/utils/productModifiers'

type Props = {
  line: PosCartLine
  subtotalLabel: string
  onQtyChange: (delta: number) => void
  onUnitPriceChange: (value: string) => void
}

function formatUnitPriceInput(n: number): string {
  const v = roundMoney(n)
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

function CartUnitPriceInput({
  unitPrice,
  onCommit,
}: {
  unitPrice: number
  onCommit: (value: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const savedRef = useRef(unitPrice)

  useEffect(() => {
    if (!editing) savedRef.current = unitPrice
  }, [unitPrice, editing])

  const commit = () => {
    const trimmed = draft.trim().replace(',', '.')
    if (trimmed === '') {
      setEditing(false)
      return
    }
    const parsed = Number.parseFloat(trimmed)
    if (Number.isNaN(parsed) || parsed < 0) {
      setEditing(false)
      return
    }
    if (roundMoney(parsed) !== roundMoney(savedRef.current)) {
      onCommit(String(parsed))
    }
    setEditing(false)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={editing ? draft : formatUnitPriceInput(unitPrice)}
      onFocus={() => {
        savedRef.current = unitPrice
        setDraft('')
        setEditing(true)
      }}
      onBlur={commit}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setDraft('')
          setEditing(false)
          e.currentTarget.blur()
        }
      }}
      className="h-8 w-[4.75rem] box-border rounded-lg border border-stone-200 px-1.5 text-xs font-semibold text-primary-700 tabular-nums text-right focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-400"
      aria-label="Precio unitario de venta"
    />
  )
}

export function PosCartLineRow({
  line,
  subtotalLabel,
  onQtyChange,
  onUnitPriceChange,
}: Props) {
  const manual = isManualCartLine(line)
  const catalog = isCatalogCartLine(line)
  const thumbUrl = catalog ? getProductImageUrl(line.product.image_url) : null
  const modifierLines = catalog && line.modifiers.length > 0 ? formatModifierLines(line.modifiers) : []
  const itemNote = catalog ? (line.notes ?? '').trim() : ''

  return (
    <li className="px-3 py-2.5 border-b border-gray-50 last:border-0 space-y-1.5">
      <div className="flex gap-2.5 items-start">
        <div
          className="w-11 h-11 rounded-lg border border-stone-200 bg-stone-100 overflow-hidden shrink-0 flex items-center justify-center"
          aria-hidden
        >
          {thumbUrl ? (
            <img src={thumbUrl} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
          ) : manual ? (
            <span className="text-[10px] font-bold text-amber-700 uppercase">Man.</span>
          ) : (
            <Package className="w-5 h-5 text-stone-400" />
          )}
        </div>
        <div className="flex-1 min-w-0 flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <span className="text-gray-800 truncate text-xs font-semibold leading-tight block">
              {manual && <span className="text-amber-700 text-[10px] font-semibold uppercase mr-1">Manual</span>}
              {cartLineLabel(line)}
            </span>
            {manual && (
              <span className="text-[10px] font-medium text-amber-700">{line.code}</span>
            )}
            {modifierLines.map((mLine) => (
              <span key={mLine} className="block text-[10px] text-[rgb(var(--p700))] leading-snug">
                {mLine}
              </span>
            ))}
            {itemNote ? (
              <span className="block text-[10px] text-gray-500 italic leading-snug">Nota: {itemNote}</span>
            ) : null}
            {catalog && line.serials?.length ? (
              <span className="block text-[10px] text-gray-500 font-mono">Serie: {line.serials.join(', ')}</span>
            ) : null}
            <div className="text-[11px] text-stone-400 mt-0.5">
              x{line.quantity} · {subtotalLabel}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0 self-start">
            <CartUnitPriceInput unitPrice={cartLineUnitPrice(line)} onCommit={onUnitPriceChange} />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onQtyChange(-1)}
                className="w-7 h-7 rounded-lg bg-stone-900 text-white flex items-center justify-center hover:bg-black transition-colors"
                aria-label="Quitar uno"
              >
                <span className="text-sm font-bold leading-none">−</span>
              </button>
              <span className="w-5 text-center text-xs font-bold tabular-nums">{line.quantity}</span>
              <button
                type="button"
                onClick={() => onQtyChange(1)}
                className="w-7 h-7 rounded-lg bg-green-800 text-white flex items-center justify-center hover:bg-green-900 transition-colors"
                aria-label="Agregar uno"
              >
                <span className="text-sm font-bold leading-none">+</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}
