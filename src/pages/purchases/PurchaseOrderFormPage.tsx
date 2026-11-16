import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Trash2, ArrowLeft, UserPlus, PackagePlus, Loader2 } from 'lucide-react'
import {
  purchaseOrdersService,
  type PurchaseOrder,
  type PurchaseOrderItem,
} from '@/services/purchaseOrders.service'
import { contactsService, type Contact } from '@/services/contacts.service'
import { companyService, type SeriesRow, type SunatConfig } from '@/services/company.service'
import type { Product } from '@/services/products.service'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { UnitQuantityInput } from '@/components/ui/UnitQuantityInput'
import { ProductPickerModal } from '@/components/sales/ProductPickerModal'
import { QuickContactCreateModal } from '@/components/contacts/QuickContactCreateModal'
import { QuickProductCreateModal } from '@/components/products/QuickProductCreateModal'
import { PurchasePreviewModal } from '@/components/purchases/PurchasePreviewModal'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useCatalogAccess } from '@/hooks/useCatalogAccess'
import { formatTipoDocIdentidadDisplay } from '@/constants/sunat'
import {
  generatePurchaseOrderPdf,
  loadPurchaseOrderPdfSupplier,
  type PurchaseOrderPdfInput,
} from '@/utils/purchaseOrderPdf'
import { useBranchCheckoutSeries } from '@/contexts/BranchCheckoutSeriesContext'
import { useBranch } from '@/contexts/BranchContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { buildTaxConfigFromSunat } from '@/constants/tax'
import { calcItem } from '@/utils/taxCalc'
import { getTodayPeru } from '@/utils/datesPeru'
import { usePendingWork } from '@/lib/branchScope/pendingWork'
import { currencySymbol } from './PurchaseOrdersPage'

export default function PurchaseOrderFormPage() {
  return (
    <RequireModule moduleKey="purchases">
      <PurchaseOrderFormContent />
    </RequireModule>
  )
}

function PurchaseOrderFormContent() {
  const navigate = useNavigate()
  const { id } = useParams()
  const editingId = id ? Number(id) : null
  const { activeBranchId } = useBranch()

  const [suppliers, setSuppliers] = useState<Contact[]>([])
  const [series, setSeries] = useState<SeriesRow[]>([])
  const [seriesId, setSeriesId] = useState<number>(0)
  const [contactId, setContactId] = useState<number>(0)
  const [issueDate, setIssueDate] = useState(getTodayPeru())
  const [expectedDate, setExpectedDate] = useState('')
  const [currency, setCurrency] = useState<'PEN' | 'USD'>('PEN')
  const [rate, setRate] = useState('')
  const [rateTouched, setRateTouched] = useState(false)
  const [paymentCondition, setPaymentCondition] = useState('')
  const [notes, setNotes] = useState('')
  const [priceIncludesIgv, setPriceIncludesIgv] = useState(false)
  const [items, setItems] = useState<PurchaseOrderItem[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(editingId != null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [addSupplierOpen, setAddSupplierOpen] = useState(false)
  /** Texto tecleado en el buscador de proveedor cuando se pulsa «Agregar»: precarga el RUC/DNI o el nombre en el alta rápida. */
  const [newSupplierQuery, setNewSupplierQuery] = useState('')
  const [loadingSuppliers, setLoadingSuppliers] = useState(true)
  const [addQuickProductOpen, setAddQuickProductOpen] = useState(false)
  // Crear un producto es catálogo global (products.manage_global): sin él no se ofrece el alta rápida.
  const { canCreateGlobal: canCreateProduct } = useCatalogAccess()
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewInput, setPreviewInput] = useState<PurchaseOrderPdfInput | null>(null)
  const [status, setStatus] = useState('draft')
  usePendingWork('orden de compra en edición', items.length > 0)

  const { sunat: cachedSunat } = useBranchCheckoutSeries()
  const [sunat, setSunat] = useState<SunatConfig | null>(null)
  useEffect(() => {
    if (cachedSunat) return setSunat(cachedSunat)
    companyService.getSunat().then(setSunat).catch(() => {})
  }, [cachedSunat])
  const taxConfig = buildTaxConfigFromSunat(cachedSunat ?? sunat ?? undefined)

  // TC venta (criterio del sistema anterior), por fecha de emisión; editable.
  const { exchangeRate: autoRate, loading: rateLoading, error: rateError } = useExchangeRate(issueDate, {
    enabled: currency === 'USD',
  })
  useEffect(() => {
    if (currency === 'USD' && autoRate && !rateTouched) setRate(autoRate)
  }, [autoRate, currency, rateTouched])

  useEffect(() => {
    contactsService
      .list('', 'supplier')
      .then(s => setSuppliers(Array.isArray(s) ? s : []))
      .catch(() => toast.error('Error al cargar proveedores'))
      .finally(() => setLoadingSuppliers(false))
  }, [])

  /** El documento va dentro del label: SearchableSelect filtra por label, así que se busca por nombre o RUC/DNI. */
  const supplierOptions = useMemo(
    () =>
      suppliers.map(sup => {
        const doc = formatTipoDocIdentidadDisplay(sup.doc_type, sup.doc_number)
        return { value: sup.id, label: `${sup.business_name}${doc ? ` — ${doc}` : ''}` }
      }),
    [suppliers],
  )

  // Series de orden de compra de la sucursal activa (solo al crear; al editar la serie no cambia).
  useEffect(() => {
    if (editingId != null) return
    companyService
      .listSeries({ branch_id: activeBranchId || undefined, category: 'orden_compra' })
      .then(rows => {
        const list = rows ?? []
        setSeries(list)
        const def = list.find(s => s.is_default) ?? list[0]
        if (def) setSeriesId(def.id)
      })
      .catch(() => toast.error('No se pudieron cargar las series'))
  }, [activeBranchId, editingId])

  useEffect(() => {
    if (editingId == null) return
    purchaseOrdersService
      .get(editingId)
      .then(({ order, items: its }) => {
        if (order.status === 'received' || order.status === 'cancelled') {
          toast.error('La orden ya no se puede editar')
          navigate('/purchases/orders', { replace: true })
          return
        }
        setSeriesId(order.series_id)
        setContactId(order.contact_id ?? 0)
        setIssueDate(order.issue_date.slice(0, 10))
        setExpectedDate(order.expected_date ? order.expected_date.slice(0, 10) : '')
        setCurrency(order.currency === 'USD' ? 'USD' : 'PEN')
        if (order.exchange_rate) {
          setRate(String(order.exchange_rate))
          setRateTouched(true)
        }
        setPaymentCondition(order.payment_condition ?? '')
        setNotes(order.notes ?? '')
        setPriceIncludesIgv(order.price_includes_igv)
        setStatus(order.status)
        setItems(its)
      })
      .catch(() => {
        toast.error('No se pudo cargar la orden')
        navigate('/purchases/orders', { replace: true })
      })
      .finally(() => setLoading(false))
  }, [editingId, navigate])

  const addProduct = (p: Product) => {
    setItems(prev => {
      const existing = prev.find(it => it.product_id === p.id && !it.presentation_id)
      if (existing) return prev.map(it => (it === existing ? { ...it, quantity: it.quantity + 1 } : it))
      return [
        ...prev,
        {
          product_id: p.id,
          code: p.code ?? '',
          description: p.name,
          unit: p.unit ?? 'NIU',
          quantity: 1,
          unit_cost: toDocCost(p.purchase_price ?? 0),
          igv_affectation_type: p.igv_affectation_type ?? '10',
          price_includes_igv: priceIncludesIgv,
        },
      ]
    })
    toast.success(`"${p.name}" agregado`)
  }

  const openQuickProduct = () => {
    setPickerOpen(false)
    setAddQuickProductOpen(true)
  }

  const updateItem = (idx: number, patch: Partial<PurchaseOrderItem>) =>
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))

  // Cambiar el criterio de IGV aplica a todas las líneas (igual que el formulario de compra).
  const toggleIncludesIgv = (v: boolean) => {
    setPriceIncludesIgv(v)
    setItems(prev => prev.map(it => ({ ...it, price_includes_igv: v })))
  }

  const calc = (it: PurchaseOrderItem) =>
    calcItem(it.unit_cost, it.quantity, 0, it.igv_affectation_type ?? '10', it.price_includes_igv, taxConfig.taxRate, taxConfig)

  const totals = useMemo(
    () =>
      items.reduce(
        (a, it) => {
          const r = calc(it)
          return { subtotal: a.subtotal + r.subtotal, igv: a.igv + r.taxAmount, total: a.total + r.total }
        },
        { subtotal: 0, igv: 0, total: 0 },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, taxConfig.taxRate],
  )

  const rateNum = parseFloat(rate.replace(',', '.'))
  const sym = currencySymbol(currency)

  // El costo de catálogo está en soles: en una orden en dólares se lleva a USD con el TC, y al cambiar de moneda se
  // reconvierten los costos ya tecleados (PEN→USD divide, USD→PEN multiplica), igual que en el formulario de compra.
  const toDocCost = (penCost: number) => (currency === 'USD' && rateNum > 0 ? Math.round((penCost / rateNum) * 10000) / 10000 : penCost)
  const [pendingFrom, setPendingFrom] = useState<'PEN' | 'USD' | null>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  useEffect(() => {
    if (!pendingFrom) return
    if (itemsRef.current.length === 0) return setPendingFrom(null)
    if (!(rateNum > 0)) return
    const factor = pendingFrom === 'PEN' ? 1 / rateNum : rateNum
    const scale = pendingFrom === 'USD' ? 100 : 10000
    setItems(prev => prev.map(it => ({ ...it, unit_cost: Math.round(it.unit_cost * factor * scale) / scale })))
    setPendingFrom(null)
  }, [pendingFrom, rateNum])

  const save = async () => {
    if (!contactId) return toast.error('Seleccione un proveedor')
    if (!seriesId) return toast.error('No hay serie de orden de compra activa. Créela en Empresa ▸ Series.')
    if (items.length === 0) return toast.error('Agregue al menos un producto')
    if (items.some(it => !(it.quantity > 0))) return toast.error('Todas las cantidades deben ser mayores a cero')
    if (currency === 'USD' && !(rateNum > 0)) return toast.error('Ingrese el tipo de cambio para órdenes en dólares')
    if (expectedDate && expectedDate < issueDate) return toast.error('La entrega no puede ser anterior a la emisión')
    setSaving(true)
    try {
      const body = {
        contact_id: contactId,
        series_id: seriesId,
        issue_date: issueDate,
        expected_date: expectedDate || undefined,
        currency,
        exchange_rate: currency === 'USD' ? rateNum : undefined,
        payment_condition: paymentCondition.trim() || undefined,
        notes: notes.trim() || undefined,
        items: items.map(({ id: _id, subtotal: _s, tax_amount: _t, total: _tt, tax_rate: _r, ...rest }) => rest),
      }
      if (editingId != null) await purchaseOrdersService.update(editingId, body)
      else await purchaseOrdersService.create(body)
      toast.success(editingId != null ? 'Orden actualizada' : 'Orden de compra creada')
      navigate('/purchases/orders', { state: { created: true } })
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Error al guardar la orden')
    } finally {
      setSaving(false)
    }
  }

  /** Vista previa del PDF con lo digitado (modal Ticket / A4, como en compras y ventas), sin guardar nada. */
  const previewOrder = async () => {
    if (items.length === 0) return toast.error('Agregue al menos un producto para previsualizar')
    setPreviewBusy(true)
    try {
      const order: PurchaseOrder = {
        id: 0,
        branch_id: activeBranchId || 0,
        contact_id: contactId || null,
        contact_name: suppliers.find(x => x.id === contactId)?.business_name ?? '',
        series_id: seriesId,
        series: series.find(x => x.id === seriesId)?.series ?? '',
        correlative: 0,
        number: '',
        issue_date: issueDate,
        expected_date: expectedDate || null,
        currency,
        exchange_rate: currency === 'USD' && rateNum > 0 ? rateNum : null,
        payment_condition: paymentCondition.trim(),
        subtotal: totals.subtotal,
        tax_amount: totals.igv,
        total: totals.total,
        price_includes_igv: priceIncludesIgv,
        notes: notes.trim(),
        status: 'draft',
        created_at: new Date().toISOString(),
      }
      const lines = items.map(it => ({ ...it, total: calc(it).total }))
      setPreviewInput({ order, items: lines, supplier: await loadPurchaseOrderPdfSupplier(order), preview: true })
    } catch {
      toast.error('No se pudo generar la previsualización')
    } finally {
      setPreviewBusy(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="space-y-4">
      <Link to="/purchases/orders" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-[rgb(var(--p600))]">
        <ArrowLeft size={16} /> Volver al listado
      </Link>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 space-y-5">
        <header className="pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">{editingId != null ? 'Editar orden de compra' : 'Nueva orden de compra'}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Pedido al proveedor. No registra stock, caja ni cuentas por pagar: eso ocurre al registrar la compra.
            {editingId != null && status === 'sent' ? ' (Ya fue marcada como enviada.)' : ''}
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor *</label>
            <div className="flex gap-2 items-stretch">
              <div className="flex-1 min-w-0">
                <SearchableSelect
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-left flex items-center justify-between gap-2 min-h-[42px]"
                  value={contactId || ''}
                  disabled={loadingSuppliers}
                  onChange={v => setContactId(v == null || String(v) === '' ? 0 : Number(v))}
                  options={supplierOptions}
                  placeholder="Seleccionar proveedor..."
                  searchable
                  searchPlaceholder="Buscar por nombre o RUC/DNI..."
                  allowClear
                  onCreateNew={q => {
                    setNewSupplierQuery(q)
                    setAddSupplierOpen(true)
                  }}
                  createNewLabel={q => `Agregar proveedor "${q}"`}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setNewSupplierQuery('')
                  setAddSupplierOpen(true)
                }}
                className="shrink-0 inline-flex items-center justify-center rounded-xl border border-gray-200 px-3 py-2 text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] min-h-[42px]"
                title="Nuevo proveedor"
                aria-label="Nuevo proveedor"
              >
                <UserPlus size={18} />
              </button>
            </div>
            {suppliers.length === 0 && !loadingSuppliers && (
              <p className="text-xs text-amber-700 mt-1">No hay proveedores registrados. Use el botón + para crear uno aquí.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Serie *</label>
            {editingId != null ? (
              <p className="px-3 py-2 text-sm font-mono bg-gray-50 rounded-xl border border-gray-100">No cambia al editar</p>
            ) : (
              <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white font-mono" value={seriesId || ''} onChange={e => setSeriesId(Number(e.target.value))}>
                {series.length === 0 && <option value="">Sin series de orden de compra</option>}
                {series.map(s => <option key={s.id} value={s.id}>{s.series}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha emisión</label>
            <input type="date" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Entrega esperada</label>
            <input type="date" min={issueDate} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Moneda</label>
            <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={currency} onChange={e => { const c = e.target.value as 'PEN' | 'USD'; if (c === currency) return; setPendingFrom(currency); setCurrency(c); setRateTouched(false) }}>
              <option value="PEN">Soles (PEN)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          </div>
          {currency === 'USD' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de cambio (venta) *</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums"
                inputMode="decimal"
                value={rate}
                placeholder={rateLoading ? 'Consultando…' : '3.750'}
                onChange={e => { setRate(e.target.value); setRateTouched(true) }}
              />
              {rateError && !rate && <p className="text-xs text-amber-700 mt-0.5">{rateError} Ingréselo manualmente.</p>}
            </div>
          )}
          <div className={currency === 'USD' ? 'sm:col-span-2 lg:col-span-2' : 'sm:col-span-2'}>
            <label className="block text-xs font-medium text-gray-600 mb-1">Condición de pago (referencia)</label>
            <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="Ej. Crédito 30 días" value={paymentCondition} onChange={e => setPaymentCondition(e.target.value)} maxLength={120} />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className={`flex items-start gap-2.5 rounded-xl border p-3 ${items.length > 0 ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white cursor-pointer'}`}>
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--p600))]" checked={priceIncludesIgv} onChange={e => toggleIncludesIgv(e.target.checked)} />
              <span className="text-sm text-gray-800">El costo unitario ya incluye IGV</span>
            </label>
          </div>
        </section>

        <section className="border-t border-gray-100 pt-5">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button type="button" onClick={() => setPickerOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-medium hover:opacity-90 shrink-0">
              <Plus size={14} /> Agregar producto
            </button>
            {canCreateProduct && (
              <button type="button" onClick={openQuickProduct} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-[rgb(var(--p600))] text-sm font-medium hover:bg-[rgb(var(--p50))] shrink-0">
                <PackagePlus size={14} /> Nuevo producto
              </button>
            )}
            <p className="text-xs text-gray-500 ml-auto">Total de ítems: {items.length}</p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Producto</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-24">Cant.</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-32">Costo unit.</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-28">Total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx} className="border-b border-gray-50">
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-gray-800">{it.description}</span>
                      {it.code && <span className="block text-xs text-gray-400 font-mono">{it.code}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <UnitQuantityInput value={it.quantity} unit={it.unit} onChange={v => updateItem(idx, { quantity: v })} className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm" />
                    </td>
                    <td className="px-3 py-2.5">
                      <input type="number" min={0} step={0.01} className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm" value={it.unit_cost} onChange={e => updateItem(idx, { unit_cost: Math.max(0, Number(e.target.value) || 0) })} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-gray-700 tabular-nums">{sym} {calc(it).total.toFixed(2)}</td>
                    <td className="px-2 py-2.5">
                      <button type="button" onClick={() => setItems(p => p.filter((_, k) => k !== idx))} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg" aria-label="Quitar"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">Sin ítems. Use <strong>Agregar producto</strong>.</div>}
          </div>
        </section>

        <section className="border-t border-gray-100 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
            <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm min-h-[90px]" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="text-right space-y-1 text-sm sm:ml-auto sm:w-72">
            <div className="flex justify-between gap-8 text-gray-600"><span>Subtotal</span><span className="tabular-nums">{sym} {totals.subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between gap-8 text-gray-600"><span>IGV</span><span className="tabular-nums">{sym} {totals.igv.toFixed(2)}</span></div>
            <div className="flex justify-between gap-8 font-bold text-gray-800 text-base pt-1 border-t border-gray-200"><span>Total</span><span className="tabular-nums">{sym} {totals.total.toFixed(2)}</span></div>
            {currency === 'USD' && rateNum > 0 && (
              <div className="flex justify-between gap-8 text-xs text-gray-500"><span>Equivalente en soles</span><span className="tabular-nums">S/ {(totals.total * rateNum).toFixed(2)}</span></div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-2 pt-4 border-t border-gray-100 sm:grid-cols-3 md:flex md:flex-row md:justify-end">
          <Link
            to="/purchases/orders"
            className="order-3 sm:order-1 md:order-none w-full md:w-auto inline-flex items-center justify-center px-3 md:px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 md:min-w-[7.5rem]"
          >
            Cancelar
          </Link>
          <button
            type="button"
            onClick={() => void previewOrder()}
            disabled={previewBusy || saving || items.length === 0}
            className="order-2 w-full md:w-auto inline-flex items-center justify-center gap-2 px-3 md:px-5 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 md:min-w-[9rem]"
          >
            {previewBusy ? <Loader2 size={16} className="animate-spin" /> : null}
            Previsualizar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="order-1 sm:order-3 md:order-none w-full md:w-auto inline-flex items-center justify-center px-3 md:px-6 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:opacity-90 md:min-w-[9rem]"
          >
            {saving ? 'Guardando...' : editingId != null ? 'Guardar cambios' : 'Crear orden'}
          </button>
        </div>
      </div>

      <PurchasePreviewModal
        open={previewInput != null}
        onClose={() => setPreviewInput(null)}
        input={previewInput}
        generate={generatePurchaseOrderPdf}
        title="Previsualización de la orden de compra"
        subtitle="Vista previa antes de crear la orden"
        notice="Documento de previsualización con marca de agua — la orden aún no está creada."
      />

      <QuickContactCreateModal
        open={addSupplierOpen}
        onClose={() => {
          setAddSupplierOpen(false)
          setNewSupplierQuery('')
        }}
        contactType="supplier"
        defaultDocType={/^\d{8}$/.test(newSupplierQuery.trim()) ? '1' : '6'}
        defaultDocNumber={/^\d{8}$|^\d{11}$/.test(newSupplierQuery.trim()) ? newSupplierQuery.trim() : undefined}
        defaultBusinessName={newSupplierQuery.trim() && !/^\d{8}$|^\d{11}$/.test(newSupplierQuery.trim()) ? newSupplierQuery.trim() : undefined}
        onCreated={c => {
          setSuppliers(p => [...p, c])
          setContactId(c.id)
        }}
      />

      <QuickProductCreateModal
        open={addQuickProductOpen}
        onClose={() => setAddQuickProductOpen(false)}
        onCreated={product => addProduct(product)}
      />

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} contentClassName="max-w-5xl w-[min(100%,64rem)]">
        <ProductPickerModal
          variant="purchase"
          onAdd={p => addProduct(p)}
          onClose={() => setPickerOpen(false)}
          onNewProduct={canCreateProduct ? openQuickProduct : undefined}
        />
      </Modal>
    </div>
  )
}
