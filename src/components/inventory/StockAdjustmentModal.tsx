import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { SearchSelect, MIN_OPTIONS_FOR_SEARCH } from '@/components/ui/SearchSelect'
import { companyService } from '@/services/company.service'
import { productsService, type Product, type ProductPresentation } from '@/services/products.service'
import { inventoryService } from '@/services/inventory.service'

/** Ajuste manual de stock (entrada/salida) para un producto, con series si aplica. */
export function StockAdjustmentModal({
  product,
  defaultBranchId,
  onClose,
  onSaved,
}: {
  product: Product
  defaultBranchId: number
  onClose: () => void
  onSaved: () => void
}) {
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([])
  const [branchId, setBranchId] = useState<number>(defaultBranchId)
  const [type, setType] = useState<'in' | 'out'>('in')
  const [quantity, setQuantity] = useState(product.manage_series ? 1 : 1)
  const [notes, setNotes] = useState('')
  const [serials, setSerials] = useState<string[]>([])
  const [availableSerials, setAvailableSerials] = useState<{ serial: string; branch_id: number; status: string }[]>([])
  const [presentations, setPresentations] = useState<ProductPresentation[]>([])
  const [presentationId, setPresentationId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingSerials, setLoadingSerials] = useState(false)

  useEffect(() => {
    if (!product.has_variants) return
    productsService.get(product.id).then(d => {
      setPresentations(d.presentations ?? [])
    })
  }, [product.id, product.has_variants])

  useEffect(() => {
    companyService.listBranches().then(b => {
      const list = (b ?? []) as { id: number; name: string }[]
      setBranches(list)
      if (defaultBranchId > 0) {
        setBranchId(defaultBranchId)
      } else if (list.length > 0 && branchId === 0) {
        setBranchId(list[0].id)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultBranchId])

  useEffect(() => {
    if (!branchId || type !== 'out' || !product.manage_series) return
    setLoadingSerials(true)
    productsService.getSerials(product.id).then(list => {
      setAvailableSerials((list ?? []).filter(s => s.branch_id === branchId && s.status === 'available'))
      setLoadingSerials(false)
    })
  }, [product.id, branchId, type, product.manage_series])

  useEffect(() => {
    if (product.manage_series && type === 'in') setSerials(Array(Math.max(0, Math.floor(quantity))).fill(''))
    if (product.manage_series && type === 'out') setSerials([])
  }, [product.manage_series, type, quantity])

  const setSerialAt = (index: number, value: string) => {
    setSerials(prev => { const next = [...prev]; next[index] = value; return next })
  }

  const handleSubmit = async () => {
    if (!branchId) { toast.error('Selecciona una sucursal'); return }
    if (product.has_variants && presentations.length > 0 && !presentationId) {
      toast.error('Selecciona la presentación (color/variante) a ajustar')
      return
    }
    const qty = product.manage_series ? Math.floor(quantity) : quantity
    if (qty <= 0) { toast.error('La cantidad debe ser mayor a 0'); return }
    if (notes.trim() === '') { toast.error('Indica el motivo del ajuste'); return }
    if (product.manage_series) {
      if (type === 'in') {
        const list = serials.map(s => s.trim()).filter(Boolean)
        if (list.length !== qty) { toast.error(`Debes ingresar exactamente ${qty} número(s) de serie`); return }
        const seen = new Set<string>()
        for (const s of list) { if (seen.has(s)) { toast.error('No se permiten seriales duplicados'); return }; seen.add(s) }
      } else {
        if (serials.length !== qty) { toast.error(`Selecciona exactamente ${qty} serie(s) a retirar`); return }
      }
    } else if (type === 'out' && !presentationId) {
      // Con presentación, el saldo a validar es el de esa variante, no el agregado del producto:
      // se deja que el backend lo valide (misma lógica de RecordMovementTx) y muestre el error.
      const stock = await inventoryService.getStock(product.id, branchId)
      const total = (stock.find(s => s.branch_id === branchId)?.quantity ?? 0) || (stock[0]?.quantity ?? 0)
      if (qty > total) { toast.error(`Stock insuficiente. Disponible: ${total}`); return }
    }
    setLoading(true)
    try {
      await inventoryService.adjustment({
        product_id: product.id,
        presentation_id: presentationId ?? undefined,
        branch_id: branchId, type, quantity: qty, notes: notes.trim(),
        serials: product.manage_series ? (type === 'in' ? serials.map(s => s.trim()).filter(Boolean) : serials) : undefined,
      })
      toast.success('Ajuste registrado. Se actualizó el kardex.')
      onSaved()
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al registrar ajuste')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open onClose={onClose} contentClassName="max-w-lg" closeOnBackdropClick={false}>
      <h3 className="font-bold text-gray-800">Ajuste de stock</h3>
      <p className="text-sm text-gray-500">{product.name}</p>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Sucursal</label>
        {branches.length >= MIN_OPTIONS_FOR_SEARCH ? (
          <SearchSelect
            options={branches.map(b => ({ value: String(b.id), label: b.name }))}
            value={String(branchId || '')}
            onChange={v => setBranchId(v ? Number(v) : 0)}
            placeholder="Selecciona sucursal"
          />
        ) : (
          <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={branchId || ''} onChange={e => setBranchId(e.target.value ? Number(e.target.value) : 0)}>
            <option value="">Selecciona sucursal</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>
      {product.has_variants && presentations.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Presentación (color/variante)</label>
          <select
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={presentationId ?? ''}
            onChange={e => setPresentationId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Selecciona presentación</option>
            {presentations.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de ajuste</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="adjType" checked={type === 'in'} onChange={() => setType('in')} />
            <span className="text-sm">Aumentar stock</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="adjType" checked={type === 'out'} onChange={() => setType('out')} />
            <span className="text-sm">Disminuir stock</span>
          </label>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad</label>
        <input type="number" min={product.manage_series ? 1 : 0.01} step={product.manage_series ? 1 : 0.01} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={quantity} onChange={e => setQuantity(product.manage_series ? Math.max(0, Math.floor(Number(e.target.value) || 0)) : Number(e.target.value) || 0)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Motivo del ajuste *</label>
        <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: Ajuste por inventario físico" />
      </div>
      {product.manage_series && type === 'in' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Números de serie (uno por unidad)</label>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {serials.map((s, i) => (
              <input key={i} type="text" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono" placeholder={`Serie ${i + 1}`} value={s} onChange={e => setSerialAt(i, e.target.value)} />
            ))}
          </div>
        </div>
      )}
      {product.manage_series && type === 'out' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Selecciona las series a retirar</label>
          {loadingSerials ? <p className="text-sm text-gray-500">Cargando series...</p> : availableSerials.length === 0 ? <p className="text-sm text-amber-600">No hay series disponibles en esta sucursal.</p> : (
            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-2 space-y-1">
              {availableSerials.map((s, i) => (
                <label key={i} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={serials.includes(s.serial)} onChange={e => { const max = Math.floor(quantity); if (e.target.checked) setSerials(prev => prev.length < max ? [...prev, s.serial] : prev); else setSerials(prev => prev.filter(x => x !== s.serial)) }} />
                  <span className="font-mono text-sm">{s.serial}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
        <button type="button" onClick={handleSubmit} disabled={loading} className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar ajuste'}</button>
      </div>
    </Modal>
  )
}
