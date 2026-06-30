import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import {
  productsService,
  type CreateProductInput,
  type Product,
} from '@/services/products.service'
import { PRODUCT_UNIT_FORM_OPTIONS } from '@/constants/sunatUnits'

const IGV_TYPES = [
  { code: '10', label: '10 - Gravado IGV' },
  { code: '20', label: '20 - Exonerado' },
  { code: '30', label: '30 - Inafecto' },
  { code: '40', label: '40 - Exportación' },
]

function isGravadoIgv(code: string): boolean {
  const c = String(code || '').trim()
  if (c === '20' || c === '21' || c === '30' || c === '31' || c === '32' || c === '33' || c === '34' || c === '35' || c === '36' || c === '40') {
    return false
  }
  return true
}

type QuickProductForm = {
  name: string
  code: string
  unit: string
  purchase_price: number
  sale_price: number
  igv_affectation_type: string
  price_includes_igv: boolean
  manage_stock: boolean
  manage_series: boolean
}

const emptyForm = (): QuickProductForm => ({
  name: '',
  code: '',
  unit: 'NIU',
  purchase_price: 0,
  sale_price: 0,
  igv_affectation_type: '10',
  price_includes_igv: true,
  manage_stock: false,
  manage_series: false,
})

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (product: Product) => void
}

export function QuickProductCreateModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState<QuickProductForm>(() => emptyForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(emptyForm())
  }, [open])

  const patch = (p: Partial<QuickProductForm>) => setForm(f => ({ ...f, ...p }))

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Ingrese el nombre del producto')
      return
    }
    if (form.sale_price < 0) {
      toast.error('El precio de venta no puede ser negativo')
      return
    }
    if (form.manage_series && !form.manage_stock) {
      toast.error('Los productos con series requieren manejo de stock')
      return
    }

    const payload: CreateProductInput = {
      name: form.name.trim(),
      code: form.code.trim() || undefined,
      type: 'product',
      unit: form.unit || 'NIU',
      sale_price: Math.max(0, form.sale_price),
      purchase_price: Math.max(0, form.purchase_price),
      igv_affectation_type: form.igv_affectation_type,
      price_includes_igv: isGravadoIgv(form.igv_affectation_type) ? form.price_includes_igv : false,
      manage_stock: form.manage_stock,
      manage_series: form.manage_series,
      min_stock: 0,
    }

    setSaving(true)
    try {
      const created = await productsService.create(payload)
      toast.success('Producto registrado')
      onCreated(created)
      onClose()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'Error al registrar producto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} contentClassName="max-w-xl w-[min(100%,36rem)]">
      <h3 className="font-bold text-gray-800 text-lg mb-3">Nuevo producto</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            placeholder="Nombre del producto"
            value={form.name}
            onChange={e => patch({ name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Código (opcional)</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
              placeholder="Ej. ABC123"
              value={form.code}
              onChange={e => patch({ code: e.target.value.toUpperCase() })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Unidad</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.unit}
              onChange={e => patch({ unit: e.target.value })}
            >
              {PRODUCT_UNIT_FORM_OPTIONS.map(u => (
                <option key={u.code} value={u.code}>
                  {u.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Precio compra</label>
            <input
              type="number"
              min={0}
              step={0.01}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.purchase_price}
              onChange={e => patch({ purchase_price: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Precio venta *</label>
            <input
              type="number"
              min={0}
              step={0.01}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.sale_price}
              onChange={e => patch({ sale_price: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo afectación IGV</label>
          <select
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={form.igv_affectation_type}
            onChange={e => {
              const v = e.target.value
              patch({
                igv_affectation_type: v,
                price_includes_igv: isGravadoIgv(v) ? form.price_includes_igv : false,
              })
            }}
          >
            {IGV_TYPES.map(t => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        {isGravadoIgv(form.igv_affectation_type) && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.price_includes_igv}
              onChange={e => patch({ price_includes_igv: e.target.checked })}
              className="rounded border-gray-300"
            />
            <span className="text-xs text-gray-600">Precio de venta incluye IGV</span>
          </label>
        )}
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.manage_stock}
              onChange={e => {
                const manage_stock = e.target.checked
                patch({
                  manage_stock,
                  manage_series: manage_stock ? form.manage_series : false,
                })
              }}
              className="rounded border-gray-300"
            />
            <span className="text-xs text-gray-600">Control stock</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.manage_series}
              disabled={!form.manage_stock}
              onChange={e => patch({ manage_series: e.target.checked })}
              className="rounded border-gray-300 disabled:opacity-50"
            />
            <span className="text-xs text-gray-600">Maneja series</span>
          </label>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Registrar producto'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
