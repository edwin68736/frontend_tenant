import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { PortalModal } from '@/components/ui/PortalModal'
import { SearchableSelect } from '@/components/SearchableSelect'
import type { ManualCartLine } from '@/utils/posCart'

const UNIT_OPTIONS = [
  { value: 'NIU', label: 'NIU - Unidad' },
  { value: 'ZZ', label: 'ZZ - Servicio' },
]

const IGV_OPTIONS = [
  { value: '10', label: '10 - Gravado IGV' },
  { value: '20', label: '20 - Exonerado' },
  { value: '30', label: '30 - Inafecto' },
]

function isGravadoIgv(code: string): boolean {
  const c = String(code || '').trim()
  return !['20', '21', '30', '31', '32', '33', '34', '35', '36', '40'].includes(c)
}

type Props = {
  open: boolean
  onClose: () => void
  onAdd: (line: ManualCartLine) => void
}

export function ManualProductModal({ open, onClose, onAdd }: Props) {
  const [description, setDescription] = useState('')
  const [code, setCode] = useState('MANUAL')
  const [unit, setUnit] = useState('NIU')
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState('')
  const [igv, setIgv] = useState('10')
  const [priceIncludesIgv, setPriceIncludesIgv] = useState(true)

  useEffect(() => {
    if (!open) return
    setDescription('')
    setCode('MANUAL')
    setUnit('NIU')
    setQuantity(1)
    setUnitPrice('')
    setIgv('10')
    setPriceIncludesIgv(true)
  }, [open])

  const submit = () => {
    const desc = description.trim()
    if (!desc) return
    const price = parseFloat(unitPrice.replace(',', '.'))
    if (!Number.isFinite(price) || price < 0) return
    onAdd({
      kind: 'manual',
      lineId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description: desc,
      code: code.trim() || 'MANUAL',
      unit,
      unit_price: price,
      quantity: Math.max(1, Math.floor(quantity)),
      igv_affectation_type: igv,
      price_includes_igv: priceIncludesIgv,
    })
    onClose()
  }

  return (
    <PortalModal open={open} onClose={onClose} className="max-w-md">
      <div className="bg-white rounded-2xl shadow-xl w-full overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h3 className="font-bold text-stone-900">Producto manual</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-stone-100">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-stone-500">Ítem sin catálogo para venta directa en el POS.</p>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Descripción *</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
              placeholder="Ej. Servicio, envío, empaque"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Código</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Cantidad</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Precio unitario (S/) *</label>
            <input
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              inputMode="decimal"
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
              placeholder="0.00"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Unidad</label>
              <SearchableSelect value={unit} onChange={(v) => setUnit(String(v ?? 'NIU'))} options={UNIT_OPTIONS} searchable={false} />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Afectación IGV</label>
              <SearchableSelect
                value={igv}
                onChange={(v) => {
                  const vv = String(v ?? '10')
                  setIgv(vv)
                  if (!isGravadoIgv(vv)) setPriceIncludesIgv(false)
                  else setPriceIncludesIgv(true)
                }}
                options={IGV_OPTIONS}
                searchable={false}
              />
            </div>
          </div>
          {isGravadoIgv(igv) ? (
            <label className="inline-flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={priceIncludesIgv}
                onChange={(e) => setPriceIncludesIgv(e.target.checked)}
                className="h-4 w-4 accent-primary-600"
              />
              Precio incluye IGV
            </label>
          ) : (
            <p className="text-xs text-stone-500">Esta afectación no aplica IGV al total.</p>
          )}
          {isGravadoIgv(igv) && unitPrice.trim() && (
            <p className="text-xs text-stone-500 rounded-lg bg-stone-50 border border-stone-100 px-2 py-1.5">
              {priceIncludesIgv
                ? 'El monto ingresado es el precio final con IGV incluido (se desglosa al cobrar y facturar).'
                : 'El monto ingresado es la base; se sumará el IGV al total del carrito y en la factura.'}
            </p>
          )}
        </div>
        <div className="p-4 border-t border-stone-200 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-stone-200 rounded-xl text-sm font-medium">
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!description.trim() || !unitPrice.trim()}
            className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
          >
            Agregar al carrito
          </button>
        </div>
      </div>
    </PortalModal>
  )
}
