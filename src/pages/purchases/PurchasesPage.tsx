import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Search, X, Eye, Ban } from 'lucide-react'
import { purchasesService, type Purchase, type PurchaseItem, type CreatePurchaseInput, type PurchaseDetail } from '@/services/purchases.service'
import { contactsService, type Contact } from '@/services/contacts.service'
import { productsService, type Product } from '@/services/products.service'
import RequireModule from '@/components/ui/RequireModule'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ProductPickerModal } from '@/components/sales/ProductPickerModal'
import { getTodayPeru, formatDisplayDatePeru } from '@/utils/datesPeru'

const DOC_TYPES = ['FACTURA','BOLETA','NOTA DE CRÉDITO','TICKET']
const PER_PAGE = 10

export default function PurchasesPage() {
  return <RequireModule moduleKey="purchases"><PurchasesContent /></RequireModule>
}

function PurchasesContent() {
  const { hasPermission } = useAuth()
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [detail, setDetail] = useState<PurchaseDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [voiding, setVoiding] = useState(false)
  /** ID de compra pendiente de confirmación de anulación; null = diálogo cerrado */
  const [confirmVoidId, setConfirmVoidId] = useState<number | null>(null)

  const [suppliers, setSuppliers] = useState<Contact[]>([])

  const [form, setForm] = useState<Partial<CreatePurchaseInput>>({ doc_type: 'FACTURA', currency: 'PEN', issue_date: getTodayPeru() })
  const [items, setItems] = useState<PurchaseItem[]>([])
  const [saving, setSaving] = useState(false)
  /** Índice del ítem cuyo modal de series está abierto; null = cerrado */
  const [seriesModalItemIdx, setSeriesModalItemIdx] = useState<number | null>(null)
  const [seriesModalText, setSeriesModalText] = useState('')

  const load = () =>
    purchasesService
      .list({ q })
      .then(({ data }) => setPurchases(data ?? []))
      .catch(() => toast.error('Error'))
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [q])

  const openForm = async () => {
    setShowForm(true)
    setForm({ doc_type: 'FACTURA', currency: 'PEN', issue_date: getTodayPeru() })
    setItems([])
    try {
      const s = await contactsService.list('', 'supplier')
      setSuppliers(Array.isArray(s) ? s : [])
    } catch {
      toast.error('Error al cargar proveedores')
      setSuppliers([])
    }
  }

  const addProductToItems = (p: Product) => {
    setItems(i => {
      const existing = i.find(it => it.product_id === p.id)
      if (existing) {
        if (p.manage_series) return i
        return i.map(it => it.product_id === p.id ? { ...it, quantity: it.quantity + 1 } : it)
      }
      return [...i, {
        product_id: p.id,
        code: p.code ?? '',
        description: p.name,
        unit: p.unit ?? 'NIU',
        quantity: p.manage_series ? 0 : 1,
        unit_cost: p.purchase_price ?? 0,
        igv_affectation_type: p.igv_affectation_type ?? '10',
        price_includes_igv: p.price_includes_igv ?? false,
        manage_series: p.manage_series ?? false,
        serials: [],
      }]
    })
    toast.success(`"${p.name}" agregado al detalle`)
  }

  const updateItem = (idx: number, field: keyof PurchaseItem, val: any) =>
    setItems(items => items.map((it, i) => (i !== idx ? it : { ...it, [field]: val })))

  const openSeriesModal = (idx: number) => {
    const it = items[idx]
    setSeriesModalText((it.serials ?? []).join('\n'))
    setSeriesModalItemIdx(idx)
  }

  const saveSeriesModal = () => {
    if (seriesModalItemIdx == null) return
    const lines = seriesModalText.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    setItems(items => items.map((it, i) => {
      if (i !== seriesModalItemIdx) return it
      return { ...it, serials: lines, quantity: lines.length }
    }))
    setSeriesModalItemIdx(null)
    setSeriesModalText('')
  }

  const closeSeriesModal = () => {
    setSeriesModalItemIdx(null)
    setSeriesModalText('')
  }

  const removeItem = (idx: number) => setItems(i => i.filter((_, k) => k !== idx))

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0)
  const igv = items.filter(i => i.igv_affectation_type === '10').reduce((s, i) => s + i.quantity * i.unit_cost * 0.18, 0)
  const total = subtotal + igv

  const handleSave = async () => {
    if (!form.contact_id || items.length === 0) {
      toast.error('Proveedor e ítems son requeridos')
      return
    }
    const series = (form.series ?? '').trim()
    const number = (form.number ?? '').trim()
    if (!series || !number) {
      toast.error('Serie y número del documento son requeridos')
      return
    }
    const withSeries = items.filter(i => i.manage_series)
    for (const it of withSeries) {
      const serials = (it.serials ?? []).filter(Boolean)
      if (serials.length === 0) {
        toast.error(`Producto "${it.description}": agregue al menos un número de serie (botón "Agregar series")`)
        return
      }
    }
    setSaving(true)
    try {
      const payloadItems = items.map(({ manage_series: _, ...rest }) => ({
        ...rest,
        serials: rest.serials ?? [],
      }))
      await purchasesService.create({ ...form, series, number, items: payloadItems } as CreatePurchaseInput)
      toast.success('Compra registrada')
      setShowForm(false)
      load()
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  const openDetail = async (id: number) => {
    setDetailLoading(true)
    try {
      const d = await purchasesService.get(id)
      setDetail(d)
    } catch {
      toast.error('Error al cargar detalle')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleVoid = async (id: number) => {
    setVoiding(true)
    try {
      await purchasesService.void(id)
      toast.success('Compra anulada')
      setDetail(null)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error al anular')
    } finally {
      setVoiding(false)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h2 className="text-lg font-bold text-gray-800">Compras</h2><p className="text-sm text-gray-500">Registro de compras y proveedores</p></div>
        {hasPermission('purchases.create') && (
          <button onClick={openForm} className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90">
            <Plus size={15} /> Nueva compra
          </button>
        )}
      </div>
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
          placeholder="Buscar..." value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>{['Fecha','Comprobante','Proveedor','Total','Estado','Acciones'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
          </thead>
          <tbody>
            {purchases.map(p => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500 text-xs">{formatDisplayDatePeru(p.issue_date)}</td>
                <td className="px-4 py-3"><p className="text-xs text-gray-500">{p.doc_type}</p><p className="font-mono font-bold text-gray-800">{p.series || ''}{p.series ? '-' : ''}{String(p.number).padStart(8,'0')}</p></td>
                <td className="px-4 py-3 text-gray-700">{p.supplier_name ?? p.contact_name ?? 'Sin proveedor'}</td>
                <td className="px-4 py-3 font-semibold text-gray-800">S/ {Number(p.total).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {p.status === 'cancelled' ? 'Anulada' : 'Recibida'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => openDetail(p.id)} className="p-1.5 text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg" title="Ver detalle"><Eye size={14} /></button>
                    {p.status !== 'cancelled' && hasPermission('purchases.delete') && (
                      <button type="button" onClick={() => setConfirmVoidId(p.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title="Anular compra"><Ban size={14} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {purchases.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">Sin compras registradas</div>}
      </div>

      {/* Modal Nueva compra — más grande */}
      <Modal open={showForm} onClose={() => setShowForm(false)} contentClassName="max-w-3xl">
        <h3 className="font-bold text-gray-800 text-lg">Nueva compra</h3>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor *</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.contact_id ?? ''}
              onChange={e => setForm(f => ({ ...f, contact_id: Number(e.target.value) }))}
            >
              <option value="">Seleccionar...</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.business_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo doc.</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.doc_type ?? ''}
              onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))}
            >
              {DOC_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Serie *</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
              placeholder="Ej. F001"
              value={form.series ?? ''}
              onChange={e => setForm(f => ({ ...f, series: e.target.value.trim() }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">N° Comprobante *</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
              value={form.number ?? ''}
              onChange={e => setForm(f => ({ ...f, number: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.issue_date ?? ''}
              onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Método de pago</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.payment_method ?? ''}
              onChange={e => setForm(f => ({ ...f, payment_method: e.target.value || undefined }))}
            >
              <option value="">Sin asignar</option>
              <option value="efectivo">Efectivo</option>
              <option value="yape">Yape</option>
              <option value="plin">Plin</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
            </select>
            <p className="text-xs text-gray-400 mt-0.5">El monto se descontará de la cuenta asociada.</p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">Detalle de compra</p>
            <button
              type="button"
              onClick={() => setShowProductPicker(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[rgb(var(--p300))] text-[rgb(var(--p600))] text-sm font-medium hover:bg-[rgb(var(--p50))]"
            >
              <Plus size={14} /> Agregar ítem
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Producto</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Unid.</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Cant.</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Costo unit.</th>
                  {items.some(it => it.manage_series) && <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Series (1 por línea)</th>}
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Subtotal</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-gray-800">{it.description || `Producto #${it.product_id}`}</span>
                      {it.code && <span className="text-xs text-gray-400 ml-1 font-mono">({it.code})</span>}
                    </td>
                    <td className="px-4 py-2.5"><input className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm" value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} /></td>
                    <td className="px-4 py-2.5">
                      {it.manage_series ? (
                        <span className="inline-block w-20 py-1 text-sm text-center bg-gray-100 rounded-lg text-gray-700" title="Calculado por series">{(it.serials ?? []).length}</span>
                      ) : (
                        <input type="number" min={0.001} step={0.01} className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm" value={it.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} />
                      )}
                    </td>
                    <td className="px-4 py-2.5"><input type="number" min={0} step={0.01} className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm" value={it.unit_cost} onChange={e => updateItem(idx, 'unit_cost', Math.max(0, Number(e.target.value) || 0))} /></td>
                    {items.some(i => i.manage_series) && (
                      <td className="px-4 py-2.5">
                        {it.manage_series ? (
                          <button type="button" onClick={() => openSeriesModal(idx)} className="px-2.5 py-1.5 rounded-lg border border-[rgb(var(--p300))] text-[rgb(var(--p600))] text-xs font-medium hover:bg-[rgb(var(--p50))]">
                            {(it.serials ?? []).length > 0 ? `Series (${(it.serials ?? []).length})` : 'Agregar series'}
                          </button>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    <td className="px-4 py-2.5 font-medium text-gray-700">S/ {(it.quantity * it.unit_cost).toFixed(2)}</td>
                    <td className="px-2 py-2.5">
                      <button type="button" onClick={() => removeItem(idx)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && (
              <div className="text-center py-10 text-gray-400 text-sm">
                Sin ítems. Haz clic en <strong>Agregar ítem</strong> para elegir productos.
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-4 text-sm border-t border-gray-100 pt-3">
          <div className="text-right space-y-1">
            <div className="flex gap-8 text-gray-600"><span>Subtotal</span><span>S/ {subtotal.toFixed(2)}</span></div>
            <div className="flex gap-8 text-gray-600"><span>IGV</span><span>S/ {igv.toFixed(2)}</span></div>
            <div className="flex gap-8 font-bold text-gray-800 text-base"><span>Total</span><span>S/ {total.toFixed(2)}</span></div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button type="button" onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">
            {saving ? 'Guardando...' : 'Registrar compra'}
          </button>
        </div>
      </Modal>

      {/* Modal selector de productos — búsqueda y paginación */}
      <Modal open={showProductPicker} onClose={() => setShowProductPicker(false)} contentClassName="max-w-2xl">
        <ProductPickerModal
          variant="purchase"
          onAdd={addProductToItems}
          onClose={() => setShowProductPicker(false)}
        />
      </Modal>

      {/* Modal números de serie (un número por línea) */}
      <Modal open={seriesModalItemIdx !== null} onClose={closeSeriesModal} contentClassName="max-w-md">
        {seriesModalItemIdx !== null && (
          <>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-800">Números de serie — {items[seriesModalItemIdx]?.description}</h3>
              <button type="button" onClick={closeSeriesModal} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-2">Un número de serie por línea. La cantidad del ítem se calculará automáticamente.</p>
            <textarea
              className="w-full min-h-[200px] border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono resize-y"
              style={{ whiteSpace: 'pre-wrap' }}
              placeholder={'SN001\nSN002\nSN003'}
              value={seriesModalText}
              onChange={e => setSeriesModalText(e.target.value)}
            />
            <div className="flex gap-2 pt-3">
              <button type="button" onClick={closeSeriesModal} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button type="button" onClick={saveSeriesModal} className="flex-1 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90">Guardar</button>
            </div>
          </>
        )}
      </Modal>

      {/* Modal detalle de compra */}
      <Modal open={detailLoading || !!detail} onClose={() => setDetail(null)} contentClassName="max-w-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h3 className="font-bold text-gray-800">Detalle de compra</h3>
          <button type="button" onClick={() => setDetail(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
        </div>
        {detailLoading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
        ) : detail && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><p className="text-xs text-gray-400">Tipo</p><p className="font-medium">{detail.purchase.doc_type}</p></div>
              <div><p className="text-xs text-gray-400">N° Comprobante</p><p className="font-mono font-medium">{detail.purchase.series}-{String(detail.purchase.number).padStart(8,'0')}</p></div>
              <div><p className="text-xs text-gray-400">Fecha</p><p>{formatDisplayDatePeru(detail.purchase.issue_date)}</p></div>
              <div><p className="text-xs text-gray-400">Proveedor</p><p>{detail.purchase.supplier_name ?? detail.purchase.contact_name ?? '—'}</p></div>
              <div><p className="text-xs text-gray-400">Estado</p><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${detail.purchase.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{detail.purchase.status === 'cancelled' ? 'Anulada' : 'Recibida'}</span></div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Ítems</p>
              <div className="space-y-1">
                {(detail.items ?? []).map((item, i) => (
                  <div key={i} className="py-1.5 border-b border-gray-50">
                    <div className="flex justify-between text-sm">
                      <div>
                        <p className="font-medium text-gray-800">{item.description}</p>
                        <p className="text-xs text-gray-400">{item.quantity} × S/ {Number(item.unit_cost).toFixed(2)}</p>
                        {(item.serials ?? []).length > 0 && (
                          <p className="text-xs text-gray-500 mt-1 font-mono">Series: {(item.serials ?? []).join(', ')}</p>
                        )}
                      </div>
                      <p className="font-semibold text-gray-700">S/ {(item.quantity * item.unit_cost).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-2 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>S/ {Number(detail.purchase.subtotal).toFixed(2)}</span></div>
                <div className="flex justify-between text-gray-600"><span>IGV</span><span>S/ {Number(detail.purchase.tax_amount).toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-gray-800"><span>Total</span><span>S/ {Number(detail.purchase.total).toFixed(2)}</span></div>
              </div>
            </div>
            {detail.purchase.status !== 'cancelled' && (
              <button type="button" onClick={() => setConfirmVoidId(detail.purchase.id)} disabled={voiding} className="w-full py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 disabled:opacity-50">
                {voiding ? 'Anulando...' : 'Anular compra'}
              </button>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmVoidId != null}
        onClose={() => setConfirmVoidId(null)}
        onConfirm={async () => { if (confirmVoidId != null) await handleVoid(confirmVoidId) }}
        title="Anular compra"
        message="Se revertirá el stock, el kardex y los seriales de los productos. ¿Continuar?"
        confirmLabel="Anular compra"
        cancelLabel="Cancelar"
        variant="danger"
        loading={voiding}
      />
    </div>
  )
}
