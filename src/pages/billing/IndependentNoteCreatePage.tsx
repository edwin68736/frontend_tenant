import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Package, Trash2, Search, X } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import SunatRequiredMessage from '@/components/ui/SunatRequiredMessage'
import { Modal } from '@/components/ui/Modal'
import { ProductPickerModal } from '@/components/sales/ProductPickerModal'
import { companyService } from '@/services/company.service'
import { contactsService, type Contact } from '@/services/contacts.service'
import { type Product } from '@/services/products.service'
import { billingService, type IndependentNoteItemInput } from '@/services/billing.service'
import { useBranch } from '@/contexts/BranchContext'
import { CREDIT_NOTE_REASONS, DEBIT_NOTE_REASONS } from '@/constants/sunatnote'
import { normalizeSunatUnit } from '@/constants/sunatUnits'
import { formatSaleMoney } from '@/utils/formatMoney'

const IGV_TYPES = [
  { code: '10', label: '10 - Gravado IGV' },
  { code: '20', label: '20 - Exonerado' },
  { code: '30', label: '30 - Inafecto' },
  { code: '40', label: '40 - Exportación' },
]

type DraftItem = IndependentNoteItemInput & { key: string; product_id?: number | null }

function emptyItem(): DraftItem {
  return {
    key: Math.random().toString(36).slice(2),
    description: '',
    unit: 'NIU',
    quantity: 1,
    unit_price: 0,
    igv_affectation_type: '10',
    price_includes_igv: true,
  }
}

/** Misma lógica que SalesRegisterPage/DespatchFormModal: producto del catálogo → línea, con
 * su precio e IGV reales — no queda a que el usuario los tipee de memoria. */
function itemFromProduct(p: Product): DraftItem {
  return {
    key: Math.random().toString(36).slice(2),
    product_id: p.id,
    code: p.code ?? '',
    description: p.name,
    unit: normalizeSunatUnit(p.unit ?? '', p.type ?? 'product'),
    quantity: 1,
    unit_price: p.sale_price ?? 0,
    igv_affectation_type: p.igv_affectation_type || '10',
    price_includes_igv: p.price_includes_igv !== false,
  }
}

/** Espejo simple de tax.CalcItem (Go) — solo para la vista previa de totales; el backend
 * recalcula y es la fuente de verdad. */
function calcItemPreview(item: DraftItem, companyRate: number): { subtotal: number; tax: number; total: number } {
  const rate = ['20', '30', '40'].includes(item.igv_affectation_type ?? '10') ? 0 : companyRate
  const gross = (item.quantity || 0) * (item.unit_price || 0)
  if (rate === 0) return { subtotal: gross, tax: 0, total: gross }
  if (item.price_includes_igv !== false) {
    const subtotal = gross / (1 + rate / 100)
    const tax = subtotal * (rate / 100)
    return { subtotal, tax, total: subtotal + tax }
  }
  const tax = gross * (rate / 100)
  return { subtotal: gross, tax, total: gross + tax }
}

function IndependentNoteCreateContent() {
  const navigate = useNavigate()
  const { activeBranchId, allowedBranches } = useBranch()

  const [sunatEnabled, setSunatEnabled] = useState<boolean | null>(null)
  const [companyRate, setCompanyRate] = useState(18)

  const [docType, setDocType] = useState<'07' | '08'>('07')
  const [reasonCode, setReasonCode] = useState('01')
  const [reason, setReason] = useState('')
  const [affectedDocType, setAffectedDocType] = useState<'01' | '03'>('01')
  const [affectedSeries, setAffectedSeries] = useState('')
  const [affectedNumber, setAffectedNumber] = useState('')
  const [branchId, setBranchId] = useState(0)

  const [contactQuery, setContactQuery] = useState('')
  const [contactOptions, setContactOptions] = useState<Contact[]>([])
  const [contactOpen, setContactOpen] = useState(false)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)

  const [items, setItems] = useState<DraftItem[]>([])
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [showManualModal, setShowManualModal] = useState(false)
  const [manualDraft, setManualDraft] = useState<DraftItem>(emptyItem())
  const [lastAddedProductId, setLastAddedProductId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const reasons = docType === '08' ? DEBIT_NOTE_REASONS : CREDIT_NOTE_REASONS

  useEffect(() => {
    companyService
      .getSunat()
      .then((d) => setSunatEnabled(d.sunat_enabled ?? false))
      .catch(() => setSunatEnabled(false))
    companyService
      .getConfig()
      .then((c) => setCompanyRate(c.tax_rate || 18))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (branchId === 0 && activeBranchId > 0) setBranchId(activeBranchId)
  }, [activeBranchId, branchId])

  // Al cambiar el tipo de nota, el motivo por defecto pasa al primero del catálogo que
  // corresponda (01 anulación para NC, 02 aumento en el valor para ND).
  useEffect(() => {
    setReasonCode(docType === '08' ? '02' : '01')
  }, [docType])

  useEffect(() => {
    const q = contactQuery.trim()
    if (q.length < 2) {
      setContactOptions([])
      return
    }
    const t = setTimeout(() => {
      contactsService
        .list(q, 'customer')
        .then((res) => setContactOptions((Array.isArray(res) ? res : (res as { data?: Contact[] })?.data) ?? []))
        .catch(() => setContactOptions([]))
    }, 300)
    return () => clearTimeout(t)
  }, [contactQuery])

  const totals = useMemo(() => {
    let subtotal = 0, tax = 0, total = 0
    for (const it of items) {
      const r = calcItemPreview(it, companyRate)
      subtotal += r.subtotal
      tax += r.tax
      total += r.total
    }
    return { subtotal, tax, total }
  }, [items, companyRate])

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }
  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key))
  }
  /** Mismo criterio que SalesRegisterPage: el modal queda abierto tras agregar, para poder
   * seguir sumando ítems sin reabrirlo cada vez; si el producto ya está en la lista, suma
   * cantidad en vez de duplicar la línea. */
  const addProductToItems = (p: Product) => {
    setItems((prev) => {
      const existing = prev.find((it) => it.product_id === p.id)
      if (existing) {
        return prev.map((it) => (it.product_id === p.id ? { ...it, quantity: it.quantity + 1 } : it))
      }
      return [...prev, itemFromProduct(p)]
    })
    setLastAddedProductId(p.id)
  }

  const openManualModal = () => {
    setManualDraft(emptyItem())
    setShowManualModal(true)
  }
  const submitManualItem = () => {
    if (!manualDraft.description.trim() || manualDraft.quantity <= 0) return
    setItems((prev) => [...prev, { ...manualDraft, key: Math.random().toString(36).slice(2) }])
    setShowManualModal(false)
  }

  const canSubmit =
    branchId > 0 &&
    affectedSeries.trim() !== '' &&
    affectedNumber.trim() !== '' &&
    selectedContact != null &&
    items.length > 0 &&
    items.every((it) => it.description.trim() !== '' && it.quantity > 0)

  const submit = async () => {
    if (!canSubmit || !selectedContact) return
    setSubmitting(true)
    try {
      const res = await billingService.createIndependentNote({
        branch_id: branchId,
        doc_type: docType,
        reason_code: reasonCode,
        reason: reason.trim() || undefined,
        affected_doc_type: affectedDocType,
        affected_series: affectedSeries.trim().toUpperCase(),
        affected_number: affectedNumber.trim(),
        contact_id: selectedContact.id,
        items: items.map((it) => ({
          code: it.code?.trim() || undefined,
          description: it.description.trim(),
          unit: it.unit || 'NIU',
          quantity: it.quantity,
          unit_price: it.unit_price,
          igv_affectation_type: it.igv_affectation_type,
          price_includes_igv: it.price_includes_igv,
        })),
      })
      toast.success(res.message ?? 'Nota encolada para emisión SUNAT')
      navigate('/billing')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'Error al emitir la nota')
    } finally {
      setSubmitting(false)
    }
  }

  if (sunatEnabled === null) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!sunatEnabled) return <SunatRequiredMessage />

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/billing')}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-800">Nota de crédito/débito independiente</h1>
          <p className="text-sm text-gray-500">
            Para un comprobante que no está registrado como venta en Tukifac — de otro sistema, histórico, o de otro canal.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 space-y-5">
        {/* Tipo y motivo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de nota *</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDocType('07')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border ${docType === '07' ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-gray-200 text-gray-600'}`}
              >
                Nota de crédito
              </button>
              <button
                type="button"
                onClick={() => setDocType('08')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border ${docType === '08' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-600'}`}
              >
                Nota de débito
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Motivo (SUNAT) *</label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            >
              {reasons.map((r) => (
                <option key={r.code} value={r.code}>{r.code} - {r.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Descripción (opcional)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={reasons.find((r) => r.code === reasonCode)?.label ?? ''}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
          />
        </div>

        {/* Comprobante afectado */}
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2">Comprobante afectado</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo *</label>
              <select
                value={affectedDocType}
                onChange={(e) => setAffectedDocType(e.target.value as '01' | '03')}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              >
                <option value="01">Factura</option>
                <option value="03">Boleta</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Serie *</label>
              <input
                value={affectedSeries}
                onChange={(e) => setAffectedSeries(e.target.value)}
                placeholder={affectedDocType === '01' ? 'F001' : 'B001'}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Número *</label>
              <input
                value={affectedNumber}
                onChange={(e) => setAffectedNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="123"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sucursal *</label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              >
                {branchId === 0 && <option value={0}>Elija sucursal</option>}
                {allowedBranches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Cliente */}
        <div className="relative">
          <label className="block text-xs font-medium text-gray-600 mb-1">Cliente *</label>
          {selectedContact ? (
            <div className="flex items-center justify-between border border-gray-200 rounded-xl px-3 py-2 bg-gray-50">
              <div className="text-sm">
                <span className="font-medium text-gray-800">{selectedContact.business_name}</span>
                <span className="text-gray-500 ml-2 font-mono text-xs">{selectedContact.doc_number}</span>
              </div>
              <button type="button" onClick={() => setSelectedContact(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={contactQuery}
                  onChange={(e) => { setContactQuery(e.target.value); setContactOpen(true) }}
                  onFocus={() => setContactOpen(true)}
                  placeholder="Buscar cliente por nombre o documento..."
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm"
                />
              </div>
              {contactOpen && contactOptions.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                  {contactOptions.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => { setSelectedContact(c); setContactOpen(false); setContactQuery('') }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                      >
                        <span className="text-gray-800">{c.business_name}</span>
                        <span className="block text-[10px] text-gray-400 font-mono">{c.doc_number}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Ítems */}
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <p className="text-xs font-semibold text-gray-700 w-full sm:w-auto sm:mr-auto">Ítems *</p>
            <button
              type="button"
              onClick={() => setShowProductPicker(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-medium hover:opacity-90"
            >
              <Plus size={14} /> Agregar producto
            </button>
            <button
              type="button"
              onClick={openManualModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50"
            >
              <Package size={14} /> Ítem manual
            </button>
          </div>
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-[11px] text-gray-500 uppercase">
                  <th className="px-2 py-2 text-left">Código</th>
                  <th className="px-2 py-2 text-left">Descripción</th>
                  <th className="px-2 py-2 text-left">Unidad</th>
                  <th className="px-2 py-2 text-right">Cant.</th>
                  <th className="px-2 py-2 text-right">P. Unit.</th>
                  <th className="px-2 py-2 text-left">Afect. IGV</th>
                  <th className="px-2 py-2 text-center">¿Incl. IGV?</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-2 py-6 text-center text-sm text-gray-400">
                      Sin ítems. Use <strong>Agregar producto</strong> o <strong>Ítem manual</strong>.
                    </td>
                  </tr>
                )}
                {items.map((it) => {
                  const preview = calcItemPreview(it, companyRate)
                  return (
                    <tr key={it.key} className="border-t border-gray-100">
                      <td className="px-2 py-1.5">
                        <input
                          value={it.code ?? ''}
                          onChange={(e) => updateItem(it.key, { code: e.target.value })}
                          className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={it.description}
                          onChange={(e) => updateItem(it.key, { description: e.target.value })}
                          className="w-full min-w-[160px] border border-gray-200 rounded-lg px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={it.unit ?? ''}
                          onChange={(e) => updateItem(it.key, { unit: e.target.value })}
                          className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          value={it.quantity}
                          onChange={(e) => updateItem(it.key, { quantity: Number(e.target.value) })}
                          className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs text-right"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={it.unit_price}
                          onChange={(e) => updateItem(it.key, { unit_price: Number(e.target.value) })}
                          className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs text-right"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={it.igv_affectation_type}
                          onChange={(e) => updateItem(it.key, { igv_affectation_type: e.target.value })}
                          className="border border-gray-200 rounded-lg px-1.5 py-1 text-xs"
                        >
                          {IGV_TYPES.map((t) => (
                            <option key={t.code} value={t.code}>{t.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={it.price_includes_igv !== false}
                          onChange={(e) => updateItem(it.key, { price_includes_igv: e.target.checked })}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs font-medium text-gray-700 whitespace-nowrap">
                        {formatSaleMoney(preview.total)}
                      </td>
                      <td className="px-1">
                        <button
                          type="button"
                          onClick={() => removeItem(it.key)}
                          className="text-gray-400 hover:text-red-600 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totales */}
        <div className="flex justify-end">
          <div className="w-56 text-sm space-y-1">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatSaleMoney(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>IGV</span>
              <span>{formatSaleMoney(totals.tax)}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-800 pt-1 border-t border-gray-200">
              <span>Total</span>
              <span>{formatSaleMoney(totals.total)}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={!canSubmit || submitting}
          onClick={() => void submit()}
          className="w-full py-2.5 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 disabled:opacity-50"
        >
          {submitting ? 'Emitiendo…' : docType === '08' ? 'Emitir nota de débito' : 'Emitir nota de crédito'}
        </button>
      </div>

      <Modal
        open={showProductPicker}
        onClose={() => setShowProductPicker(false)}
        contentClassName="max-w-2xl"
        closeOnBackdropClick={false}
      >
        <ProductPickerModal
          variant="sale"
          onAdd={addProductToItems}
          onClose={() => setShowProductPicker(false)}
          addedProductIds={items.map((it) => it.product_id).filter((id): id is number => id != null)}
          lastAddedProductId={lastAddedProductId}
        />
      </Modal>

      <Modal
        open={showManualModal}
        onClose={() => setShowManualModal(false)}
        contentClassName="max-w-lg"
        closeOnBackdropClick={false}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-gray-800 text-lg">Ítem manual</h3>
          <button type="button" onClick={() => setShowManualModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción *</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={manualDraft.description}
              onChange={(e) => setManualDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Nombre o detalle del ítem"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Código</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
                value={manualDraft.code ?? ''}
                onChange={(e) => setManualDraft((d) => ({ ...d, code: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unidad</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={manualDraft.unit ?? ''}
                onChange={(e) => setManualDraft((d) => ({ ...d, unit: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad</label>
              <input
                type="number"
                min={0}
                step="0.001"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={manualDraft.quantity}
                onChange={(e) => setManualDraft((d) => ({ ...d, quantity: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Precio unitario</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={manualDraft.unit_price}
                onChange={(e) => setManualDraft((d) => ({ ...d, unit_price: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Afectación IGV</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={manualDraft.igv_affectation_type}
              onChange={(e) => setManualDraft((d) => ({ ...d, igv_affectation_type: e.target.value }))}
            >
              {IGV_TYPES.map((t) => (
                <option key={t.code} value={t.code}>{t.label}</option>
              ))}
            </select>
          </div>
          {manualDraft.igv_affectation_type === '10' ? (
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={manualDraft.price_includes_igv !== false}
                onChange={(e) => setManualDraft((d) => ({ ...d, price_includes_igv: e.target.checked }))}
                className="h-4 w-4 accent-[rgb(var(--p600))]"
              />
              Precio incluye IGV
            </label>
          ) : (
            <p className="text-xs text-gray-500">Esta afectación no aplica IGV al total.</p>
          )}
          <div className="flex justify-between text-sm text-gray-600 pt-1 border-t border-gray-100">
            <span>Total estimado</span>
            <span className="font-semibold text-gray-900 tabular-nums">
              {formatSaleMoney(calcItemPreview(manualDraft, companyRate).total)}
            </span>
          </div>
        </div>
        <div className="flex gap-2 pt-3">
          <button
            type="button"
            onClick={() => setShowManualModal(false)}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submitManualItem}
            disabled={!manualDraft.description.trim() || manualDraft.quantity <= 0}
            className="flex-1 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            Agregar
          </button>
        </div>
      </Modal>
    </div>
  )
}

export default function IndependentNoteCreatePage() {
  return (
    <RequireModule moduleKey="billing">
      <IndependentNoteCreateContent />
    </RequireModule>
  )
}
