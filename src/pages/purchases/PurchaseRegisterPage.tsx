import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Trash2, ArrowLeft, X, UserPlus, PackagePlus } from 'lucide-react'
import {
  purchasesService,
  type PurchaseItem,
  type CreatePurchaseInput,
} from '@/services/purchases.service'
import { contactsService, type Contact } from '@/services/contacts.service'
import { productsService, type Product } from '@/services/products.service'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { ProductPickerModal } from '@/components/sales/ProductPickerModal'
import { QuickContactCreateModal } from '@/components/contacts/QuickContactCreateModal'
import { QuickProductCreateModal } from '@/components/products/QuickProductCreateModal'
import { getTodayPeru } from '@/utils/datesPeru'
import { companyService, type SunatConfig } from '@/services/company.service'
import { useBranchCheckoutSeries } from '@/contexts/BranchCheckoutSeriesContext'
import { buildTaxConfigFromSunat } from '@/constants/tax'
import { calcItem } from '@/utils/taxCalc'

const DOC_TYPES = ['FACTURA', 'BOLETA', 'NOTA DE CRÉDITO', 'TICKET']

const PRESENTATIONS_WARNING =
  'Este producto posee presentaciones con precios independientes. Solo se actualizará el precio base del producto. Los precios de las presentaciones deberán modificarse desde el módulo Productos.'

function buildPurchaseLine(
  p: Product,
  opts?: { isNewlyCreated?: boolean; hasPresentations?: boolean; priceIncludesIgv?: boolean },
): PurchaseItem {
  return {
    product_id: p.id,
    code: p.code ?? '',
    description: p.name,
    unit: p.unit ?? 'NIU',
    quantity: p.manage_series ? 0 : 1,
    unit_cost: p.purchase_price ?? 0,
    igv_affectation_type: p.igv_affectation_type ?? '10',
    // El criterio es de la compra completa, no del catálogo: manda el check del formulario.
    price_includes_igv: opts?.priceIncludesIgv ?? false,
    manage_series: p.manage_series ?? false,
    serials: [],
    current_sale_price: p.sale_price ?? 0,
    has_presentations: opts?.hasPresentations ?? false,
    is_newly_created: opts?.isNewlyCreated ?? false,
    update_sale_price: false,
    new_sale_price: p.sale_price ?? 0,
  }
}

export default function PurchaseRegisterPage() {
  return (
    <RequireModule moduleKey="purchases">
      <PurchaseRegisterContent />
    </RequireModule>
  )
}

function PurchaseRegisterContent() {
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState<Contact[]>([])
  const [loadingSuppliers, setLoadingSuppliers] = useState(true)
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [addQuickProductOpen, setAddQuickProductOpen] = useState(false)
  const [form, setForm] = useState<Partial<CreatePurchaseInput>>({
    doc_type: 'FACTURA',
    currency: 'PEN',
    issue_date: getTodayPeru(),
  })
  const [items, setItems] = useState<PurchaseItem[]>([])
  const [saving, setSaving] = useState(false)
  const [addSupplierOpen, setAddSupplierOpen] = useState(false)
  const [seriesModalItemIdx, setSeriesModalItemIdx] = useState<number | null>(null)
  const [seriesModalText, setSeriesModalText] = useState('')
  /**
   * Criterio global: el costo unitario tecleado ya incluye IGV. Arranca en false, que es
   * el comportamiento histórico (el IGV se suma encima del costo).
   */
  const [priceIncludesIgv, setPriceIncludesIgv] = useState(false)

  // Tasa real del tenant (18% o 10.5% Ley 31659) para que el total en pantalla
  // coincida con el que calcula el backend.
  const { sunat: cachedSunat } = useBranchCheckoutSeries()
  const [sunat, setSunat] = useState<SunatConfig | null>(null)
  useEffect(() => {
    if (cachedSunat) {
      setSunat(cachedSunat)
      return
    }
    companyService.getSunat().then(setSunat).catch(() => {
      // sin config SUNAT se usa el fallback de buildTaxConfigFromSunat (18%)
    })
  }, [cachedSunat])
  const taxConfig = buildTaxConfigFromSunat(cachedSunat ?? sunat ?? undefined)

  useEffect(() => {
    setLoadingSuppliers(true)
    contactsService
      .list('', 'supplier')
      .then(s => setSuppliers(Array.isArray(s) ? s : []))
      .catch(() => toast.error('Error al cargar proveedores'))
      .finally(() => setLoadingSuppliers(false))
  }, [])

  const addProductToItems = async (p: Product, opts?: { isNewlyCreated?: boolean }) => {
    let hasPresentations = false
    if (!opts?.isNewlyCreated) {
      // ProductPicker usa GET /api/products (ProductListItem), que no incluye presentaciones.
      try {
        const detail = await productsService.get(p.id)
        hasPresentations = (detail.presentations?.length ?? 0) > 0
      } catch {
        // continuar sin advertencia de presentaciones
      }
    }
    const line = buildPurchaseLine(p, {
      isNewlyCreated: opts?.isNewlyCreated,
      hasPresentations,
      priceIncludesIgv,
    })
    setItems(i => {
      const existing = i.find(it => it.product_id === p.id)
      if (existing) {
        if (p.manage_series) return i
        return i.map(it => (it.product_id === p.id ? { ...it, quantity: it.quantity + 1 } : it))
      }
      return [...i, line]
    })
    toast.success(`"${p.name}" agregado al detalle`)
  }

  const openQuickProduct = () => {
    setShowProductPicker(false)
    setAddQuickProductOpen(true)
  }

  const toggleUpdateSalePrice = (idx: number, checked: boolean) => {
    setItems(prev =>
      prev.map((it, i) => {
        if (i !== idx) return it
        return {
          ...it,
          update_sale_price: checked,
          new_sale_price: checked ? (it.new_sale_price ?? it.current_sale_price ?? 0) : it.new_sale_price,
        }
      }),
    )
  }

  const updateItem = (idx: number, field: keyof PurchaseItem, val: unknown) =>
    setItems(prev => prev.map((it, i) => (i !== idx ? it : { ...it, [field]: val })))

  const openSeriesModal = (idx: number) => {
    const it = items[idx]
    setSeriesModalText((it.serials ?? []).join('\n'))
    setSeriesModalItemIdx(idx)
  }

  const saveSeriesModal = () => {
    if (seriesModalItemIdx == null) return
    const lines = seriesModalText.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    setItems(prev =>
      prev.map((it, i) => {
        if (i !== seriesModalItemIdx) return it
        return { ...it, serials: lines, quantity: lines.length }
      }),
    )
    setSeriesModalItemIdx(null)
    setSeriesModalText('')
  }

  const closeSeriesModal = () => {
    setSeriesModalItemIdx(null)
    setSeriesModalText('')
  }

  const removeItem = (idx: number) => setItems(i => i.filter((_, k) => k !== idx))

  // Mismo motor que el backend (pkg/tax.CalcItem): respeta la afectación SUNAT, la tasa
  // del tenant y si el costo ya trae IGV. Antes usaba 0.18 fijo e ignoraba ambas cosas,
  // por lo que el total mostrado no coincidía con el que se guardaba.
  const totals = items.reduce(
    (acc, it) => {
      const r = calcItem(
        it.unit_cost,
        it.quantity,
        0,
        it.igv_affectation_type ?? '10',
        it.price_includes_igv ?? false,
        taxConfig.taxRate,
        taxConfig,
      )
      return {
        subtotal: acc.subtotal + r.subtotal,
        igv: acc.igv + r.taxAmount,
        total: acc.total + r.total,
      }
    },
    { subtotal: 0, igv: 0, total: 0 },
  )
  const { subtotal, igv, total } = totals

  /** Importe de la línea tal como se cobra (el que ve el usuario en la fila). */
  const lineTotal = (it: PurchaseItem) =>
    calcItem(
      it.unit_cost,
      it.quantity,
      0,
      it.igv_affectation_type ?? '10',
      it.price_includes_igv ?? false,
      taxConfig.taxRate,
      taxConfig,
    ).total

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
    for (const it of items.filter(i => i.manage_series)) {
      const serials = (it.serials ?? []).filter(Boolean)
      if (serials.length === 0) {
        toast.error(`Producto "${it.description}": agregue al menos un número de serie`)
        return
      }
    }
    for (const it of items) {
      if (it.update_sale_price && (it.new_sale_price == null || it.new_sale_price < 0)) {
        toast.error(`"${it.description}": ingrese un precio de venta válido`)
        return
      }
    }
    setSaving(true)
    try {
      const payloadItems = items.map(
        ({
          manage_series: _ms,
          current_sale_price: _cs,
          has_presentations: _hp,
          is_newly_created: _nc,
          update_sale_price,
          new_sale_price,
          ...rest
        }) => ({
          ...rest,
          serials: rest.serials ?? [],
          update_sale_price: update_sale_price === true,
          new_sale_price: update_sale_price ? (new_sale_price ?? 0) : 0,
        }),
      )
      await purchasesService.create({
        ...form,
        series,
        number,
        price_includes_igv: priceIncludesIgv,
        items: payloadItems,
      } as CreatePurchaseInput)
      toast.success('Compra registrada')
      navigate('/purchases', { state: { created: true } })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'Error al registrar compra')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/purchases"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-[rgb(var(--p600))]"
        >
          <ArrowLeft size={16} /> Volver al listado
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 space-y-5">
        <header className="pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">Nueva compra</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Registre el comprobante del proveedor y el detalle de productos recibidos
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor *</label>
            <div className="flex gap-2 items-stretch">
              <select
                className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                value={form.contact_id ?? ''}
                disabled={loadingSuppliers}
                onChange={e => setForm(f => ({ ...f, contact_id: Number(e.target.value) }))}
              >
                <option value="">Seleccionar proveedor...</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.business_name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setAddSupplierOpen(true)}
                className="shrink-0 inline-flex items-center justify-center rounded-xl border border-gray-200 px-3 py-2 text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] min-h-[42px]"
                title="Nuevo proveedor"
                aria-label="Nuevo proveedor"
              >
                <UserPlus size={18} />
              </button>
            </div>
            {suppliers.length === 0 && !loadingSuppliers && (
              <p className="text-xs text-amber-700 mt-1">
                No hay proveedores registrados. Use el botón + para crear uno aquí.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo documento</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.doc_type ?? ''}
              onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))}
            >
              {DOC_TYPES.map(d => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
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
            <label className="block text-xs font-medium text-gray-600 mb-1">N° comprobante *</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
              value={form.number ?? ''}
              onChange={e => setForm(f => ({ ...f, number: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha emisión</label>
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

          <div className="sm:col-span-2 lg:col-span-3">
            <label
              className={`flex items-start gap-2.5 rounded-xl border p-3 ${
                items.length > 0
                  ? 'border-gray-100 bg-gray-50 cursor-not-allowed'
                  : 'border-gray-200 bg-white cursor-pointer hover:border-[rgb(var(--p300))]'
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--p600))]"
                checked={priceIncludesIgv}
                disabled={items.length > 0}
                onChange={e => setPriceIncludesIgv(e.target.checked)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-800">
                  El costo unitario ya incluye IGV
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  {priceIncludesIgv
                    ? `Se desagregará el IGV del costo que ingrese (ej. ${(118).toFixed(2)} → valor ${(100).toFixed(2)} + IGV ${(18).toFixed(2)}).`
                    : `Se agregará el IGV sobre el costo que ingrese (ej. ${(100).toFixed(2)} → valor ${(100).toFixed(2)} + IGV ${(18).toFixed(2)}).`}
                  {' '}No aplica a ítems exonerados o inafectos.
                </span>
                {items.length > 0 && (
                  <span className="block text-xs text-amber-700 mt-1">
                    No se puede cambiar con productos ya agregados. Vacíe el detalle para modificarlo.
                  </span>
                )}
              </span>
            </label>
          </div>
        </section>

        <section className="border-t border-gray-100 pt-5">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => setShowProductPicker(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-medium hover:opacity-90 shrink-0"
            >
              <Plus size={14} /> Agregar producto
            </button>
            <button
              type="button"
              onClick={openQuickProduct}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-[rgb(var(--p600))] text-sm font-medium hover:bg-[rgb(var(--p50))] shrink-0"
            >
              <PackagePlus size={14} /> Nuevo producto
            </button>
            <p className="text-xs text-gray-500 ml-auto">Total de ítems: {items.length}</p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm min-w-[720px] table-fixed">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[34%]">
                    Producto
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[8%]">
                    Unid.
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[10%]">
                    Cant.
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[12%]">
                    Costo unit.
                  </th>
                  {items.some(it => it.manage_series) && (
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[14%]">
                      Series
                    </th>
                  )}
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[12%]">
                    Subtotal
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-gray-800">{it.description || '—'}</span>
                      {it.code && (
                        <span className="block text-xs text-gray-400 font-mono">{it.code}</span>
                      )}
                      {!it.is_newly_created && (
                        <div className="mt-2 space-y-1.5">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={it.update_sale_price === true}
                              onChange={e => toggleUpdateSalePrice(idx, e.target.checked)}
                              className="rounded border-gray-300 shrink-0"
                            />
                            <span className="text-xs text-gray-600">Actualizar precio de venta</span>
                          </label>
                          {it.update_sale_price && (
                            <div className="pl-0.5 space-y-1">
                              <p className="text-xs text-gray-500">
                                Precio venta actual:{' '}
                                <span className="tabular-nums font-medium text-gray-700">
                                  S/ {(it.current_sale_price ?? 0).toFixed(2)}
                                </span>
                              </p>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Nuevo precio venta</label>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  className="w-full max-w-[140px] border border-gray-200 rounded-lg px-2 py-1 text-sm"
                                  value={it.new_sale_price ?? 0}
                                  onChange={e =>
                                    updateItem(
                                      idx,
                                      'new_sale_price',
                                      Math.max(0, Number(e.target.value) || 0),
                                    )
                                  }
                                />
                              </div>
                              {it.has_presentations && (
                                <p className="text-xs text-amber-700 leading-snug">{PRESENTATIONS_WARNING}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm"
                        value={it.unit}
                        onChange={e => updateItem(idx, 'unit', e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      {it.manage_series ? (
                        <span className="inline-block w-full py-1 text-sm text-center bg-gray-100 rounded-lg text-gray-700">
                          {(it.serials ?? []).length}
                        </span>
                      ) : (
                        <input
                          type="number"
                          min={0.001}
                          step={0.01}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm"
                          value={it.quantity}
                          onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm"
                        value={it.unit_cost}
                        onChange={e =>
                          updateItem(idx, 'unit_cost', Math.max(0, Number(e.target.value) || 0))
                        }
                      />
                    </td>
                    {items.some(i => i.manage_series) && (
                      <td className="px-3 py-2.5">
                        {it.manage_series ? (
                          <button
                            type="button"
                            onClick={() => openSeriesModal(idx)}
                            className="px-2.5 py-1.5 rounded-lg border border-[rgb(var(--p300))] text-[rgb(var(--p600))] text-xs font-medium hover:bg-[rgb(var(--p50))]"
                          >
                            {(it.serials ?? []).length > 0
                              ? `Series (${(it.serials ?? []).length})`
                              : 'Agregar series'}
                          </button>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-right font-medium text-gray-700 tabular-nums">
                      S/ {lineTotal(it).toFixed(2)}
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && (
              <div className="text-center py-10 text-gray-400 text-sm">
                Sin ítems. Use <strong>Agregar producto</strong> para armar el detalle.
              </div>
            )}
          </div>
        </section>

        <section className="border-t border-gray-100 pt-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="text-right space-y-1 text-sm sm:ml-auto">
            <div className="flex justify-between gap-8 text-gray-600">
              <span>Subtotal</span>
              <span className="tabular-nums">S/ {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-8 text-gray-600">
              <span>IGV</span>
              <span className="tabular-nums">S/ {igv.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-8 font-bold text-gray-800 text-base pt-1 border-t border-gray-200">
              <span>Total</span>
              <span className="tabular-nums">S/ {total.toFixed(2)}</span>
            </div>
          </div>
        </section>

        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2 border-t border-gray-100">
          <Link
            to="/purchases"
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 text-center"
          >
            Cancelar
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:opacity-90"
          >
            {saving ? 'Guardando...' : 'Registrar compra'}
          </button>
        </div>
      </div>

      <QuickContactCreateModal
        open={addSupplierOpen}
        onClose={() => setAddSupplierOpen(false)}
        contactType="supplier"
        defaultDocType="6"
        onCreated={(contact) => {
          setSuppliers(prev => [...prev, contact])
          setForm(f => ({ ...f, contact_id: contact.id }))
        }}
      />

      <QuickProductCreateModal
        open={addQuickProductOpen}
        onClose={() => setAddQuickProductOpen(false)}
        onCreated={product => {
          void addProductToItems(product, { isNewlyCreated: true })
        }}
      />

      <Modal open={showProductPicker} onClose={() => setShowProductPicker(false)} contentClassName="max-w-2xl">
        <ProductPickerModal
          variant="purchase"
          onAdd={p => {
            void addProductToItems(p)
          }}
          onClose={() => setShowProductPicker(false)}
          onNewProduct={openQuickProduct}
        />
      </Modal>

      <Modal open={seriesModalItemIdx !== null} onClose={closeSeriesModal} contentClassName="max-w-md">
        {seriesModalItemIdx !== null && (
          <>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-800">
                Números de serie — {items[seriesModalItemIdx]?.description}
              </h3>
              <button type="button" onClick={closeSeriesModal} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Un número de serie por línea. La cantidad se calculará automáticamente.
            </p>
            <textarea
              className="w-full min-h-[200px] border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono resize-y"
              style={{ whiteSpace: 'pre-wrap' }}
              placeholder={'SN001\nSN002\nSN003'}
              value={seriesModalText}
              onChange={e => setSeriesModalText(e.target.value)}
            />
            <div className="flex gap-2 pt-3">
              <button
                type="button"
                onClick={closeSeriesModal}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveSeriesModal}
                className="flex-1 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
              >
                Guardar
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
