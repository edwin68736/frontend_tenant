import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Trash2, Search, X, Package } from 'lucide-react'
import { salesService, type CreateSaleInput } from '@/services/sales.service'
import { contactsService, type Contact } from '@/services/contacts.service'
import { productsService, type Product } from '@/services/products.service'
import { companyService } from '@/services/company.service'
import { useAuth } from '@/contexts/AuthContext'
import { useBranch, useOnBranchChange } from '@/contexts/BranchContext'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { ReceiptPrintModal } from '@/components/ui/ReceiptPrintModal'
import { QuickContactCreateModal } from '@/components/contacts/QuickContactCreateModal'
import { formatTipoDocIdentidadDisplay } from '@/constants/sunat'
import type { PrintData } from '@/types/printData'
import { getTipoComprobanteLabel } from '@/constants/sunat'
import { SUNAT_MAX_MONTO_CLIENTE_SIN_RUC, SUNAT_RUC_LENGTH } from '@/constants/sunat'
import { cashbankService, type CashSession, type PaymentMethodRecord } from '@/services/cashbank.service'
import { calcItem, getAfectacionGroup, type SunatAfectacionGroup } from '@/utils/taxCalc'
import { getTodayPeru } from '@/utils/datesPeru'
import { normalizeSunatUnit } from '@/constants/sunatUnits'

/** Tipo de serie de venta (desde API). */
type SeriesRow = { id: number; series: string; doc_type: string; sunat_code?: string; branch_id?: number }

/** Ítem del detalle en el formulario (incluye datos para cálculo y envío). */
export interface SaleFormItem {
  product_id: number | null
  code: string
  description: string
  unit: string
  quantity: number
  unit_price: number
  igv_affectation_type: string
  price_includes_igv: boolean
  /** Solo para productos con series; no usado en registro avanzado por defecto */
  serials?: string[]
}

const PER_PAGE = 10
const IGV_AFFECTATION_OPTIONS = [
  { code: '10', label: 'Gravado' },
  { code: '20', label: 'Exonerado' },
  { code: '30', label: 'Inafecto' },
  { code: '40', label: 'Exportación' },
]

/** Ítem es manual cuando no tiene product_id (no está en catálogo). */
function isManualItem(it: SaleFormItem): boolean {
  return it.product_id == null
}

function docTypeToSunatCode(docType: string): string {
  const u = (docType || '').toUpperCase()
  if (u.includes('NOTA') && u.includes('VENTA')) return '00'
  if (u === 'BOLETA') return '03'
  if (u === 'FACTURA') return '01'
  return ''
}

export type SalesRegisterMode = 'nota-venta' | 'comprobante'

function codesForMode(mode: SalesRegisterMode, billingOk: boolean): string[] {
  if (mode === 'nota-venta') return ['00']
  if (!billingOk) return []
  return ['03', '01']
}

function defaultCodeForMode(mode: SalesRegisterMode): string {
  return mode === 'nota-venta' ? '00' : '03'
}

function resolveCashMethodCode(methods: PaymentMethodRecord[]): string {
  const cash = methods.find(
    (m) => m.code === 'cash' || String(m.destination_type ?? '').toLowerCase() === 'cash',
  )
  return cash?.code ?? methods[0]?.code ?? 'cash'
}

type SalesRegisterPageProps = { mode?: SalesRegisterMode }

export default function SalesRegisterPage({ mode = 'comprobante' }: SalesRegisterPageProps) {
  return (
    <RequireModule moduleKey="sales">
      <SalesRegisterContent mode={mode} />
    </RequireModule>
  )
}

function SalesRegisterContent({ mode }: { mode: SalesRegisterMode }) {
  const navigate = useNavigate()
  const isNotaVenta = mode === 'nota-venta'
  const { hasModule } = useAuth()
  const { activeBranchId } = useBranch()
  const [series, setSeries] = useState<SeriesRow[]>([])
  const [customers, setCustomers] = useState<Contact[]>([])
  const [taxRate, setTaxRate] = useState(18)
  const [taxConfig, setTaxConfig] = useState<{ taxRate: number; igvRegime?: string; taxBenefitZone?: boolean }>({ taxRate: 18 })
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [form, setForm] = useState<{
    branch_id: number
    contact_id: number | null
    sunat_code: string
    series_id: number | null
    issue_date: string
    due_date: string
    currency: string
    payment_method: string
    notes: string
  }>({
    branch_id: 0,
    contact_id: null,
    sunat_code: '03',
    series_id: null,
    issue_date: getTodayPeru(),
    due_date: getTodayPeru(),
    currency: 'PEN',
    payment_method: 'efectivo',
    notes: '',
  })
  const [items, setItems] = useState<SaleFormItem[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sunatEnabled, setSunatEnabled] = useState(true)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRecord[]>([])
  const [payments, setPayments] = useState<{ method: string; amount: string }[]>([{ method: 'cash', amount: '0.00' }])
  const [cashSession, setCashSession] = useState<CashSession | null>(null)
  const [printData, setPrintData] = useState<PrintData | null>(null)
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [lastSale, setLastSale] = useState<{ id: number; number: string; total: number } | null>(null)
  const [addClientOpen, setAddClientOpen] = useState(false)

  useEffect(() => {
    Promise.all([
      companyService.listSeries({ branch_id: activeBranchId, category: 'venta' }),
      companyService.getSunat(),
      contactsService.list('', 'customer'),
      contactsService.getDefault(),
      cashbankService.listPaymentMethods(),
      cashbankService.getOpenSession(activeBranchId || undefined),
    ])
      .then(([seriesList, sunat, customerList, defaultClient, methods, session]) => {
        setCashSession(session)
        setSunatEnabled(sunat?.sunat_enabled ?? true)
        const ventaSeries = (seriesList ?? []) as SeriesRow[]
        setSeries(ventaSeries)
        setTaxRate(sunat?.tax_rate ?? 18)
        setTaxConfig({ taxRate: sunat?.tax_rate ?? 18, igvRegime: sunat?.igv_regime, taxBenefitZone: sunat?.tax_benefit_zone })
        setCustomers(Array.isArray(customerList) ? customerList : [])
        const billingOk = hasModule('billing') && (sunat?.sunat_enabled ?? true)
        const modeCodes = codesForMode(mode, billingOk)
        const availableCodes = [
          ...new Set(
            ventaSeries
              .map((s) => (s.sunat_code ?? '').trim() || docTypeToSunatCode(s.doc_type))
              .filter((c) => c && modeCodes.includes(c)),
          ),
        ]
        let defaultCode = defaultCodeForMode(mode)
        if (!availableCodes.includes(defaultCode)) defaultCode = availableCodes[0] ?? defaultCode
        const matchSeries = ventaSeries.find(
          (s) => ((s.sunat_code ?? '').trim() || docTypeToSunatCode(s.doc_type)) === defaultCode,
        )
        setForm(f => ({
          ...f,
          branch_id: activeBranchId,
          sunat_code: defaultCode,
          series_id: matchSeries?.id ?? null,
          contact_id: defaultClient?.id ?? f.contact_id,
        }))
        if (Array.isArray(methods) && methods.length > 0) {
          const cashCode = resolveCashMethodCode(methods as PaymentMethodRecord[])
          setPaymentMethods(methods as PaymentMethodRecord[])
          setPayments((prev) =>
            prev.length === 1 ? [{ method: cashCode, amount: prev[0].amount || '0.00' }] : prev,
          )
        }
      })
      .catch(() => toast.error('Error cargando datos'))
      .finally(() => setLoading(false))
  }, [hasModule, mode, activeBranchId])

  useOnBranchChange(() => {
    setLoading(true)
    setItems([])
    setForm((f) => ({ ...f, branch_id: activeBranchId }))
    Promise.all([
      companyService.listSeries({ branch_id: activeBranchId, category: 'venta' }),
      companyService.getSunat(),
      contactsService.list('', 'customer'),
      contactsService.getDefault(),
      cashbankService.listPaymentMethods(),
      cashbankService.getOpenSession(activeBranchId || undefined),
    ])
      .then(([seriesList, sunat, customerList, defaultClient, methods, session]) => {
        setCashSession(session)
        setSunatEnabled(sunat?.sunat_enabled ?? true)
        const ventaSeries = (seriesList ?? []) as SeriesRow[]
        setSeries(ventaSeries)
        setTaxRate(sunat?.tax_rate ?? 18)
        setCustomers(Array.isArray(customerList) ? customerList : [])
        if (Array.isArray(methods) && methods.length > 0) {
          const cashCode = resolveCashMethodCode(methods as PaymentMethodRecord[])
          setPaymentMethods(methods as PaymentMethodRecord[])
          setPayments((prev) =>
            prev.length === 1 ? [{ method: cashCode, amount: prev[0].amount || '0.00' }] : prev,
          )
        }
        const billingOk = hasModule('billing') && (sunat?.sunat_enabled ?? true)
        const modeCodes = codesForMode(mode, billingOk)
        const availableCodes = [
          ...new Set(
            ventaSeries
              .map((s) => (s.sunat_code ?? '').trim() || docTypeToSunatCode(s.doc_type))
              .filter((c) => c && modeCodes.includes(c)),
          ),
        ]
        let defaultCode = defaultCodeForMode(mode)
        if (!availableCodes.includes(defaultCode)) defaultCode = availableCodes[0] ?? defaultCode
        const matchSeries = ventaSeries.find(
          (s) => ((s.sunat_code ?? '').trim() || docTypeToSunatCode(s.doc_type)) === defaultCode,
        )
        setForm((f) => ({
          ...f,
          contact_id: defaultClient?.id ?? f.contact_id,
          branch_id: activeBranchId,
          sunat_code: defaultCode,
          series_id: matchSeries?.id ?? null,
        }))
      })
      .finally(() => setLoading(false))
  })

  const billingOk = hasModule('billing') && sunatEnabled
  const seriesFiltered = series.filter(
    (s) => ((s.sunat_code ?? '').trim() || docTypeToSunatCode(s.doc_type)) === form.sunat_code,
  )
  const tipoOptions = codesForMode(mode, billingOk).filter((code) =>
    series.some((s) => ((s.sunat_code ?? '').trim() || docTypeToSunatCode(s.doc_type)) === code),
  )

  useEffect(() => {
    const first = seriesFiltered[0]
    setForm(f => ({
      ...f,
      series_id: first?.id ?? null,
    }))
  }, [form.sunat_code])

  const addProductToItems = (p: Product) => {
    setItems(prev => {
      const existing = prev.find(it => it.product_id === p.id)
      if (existing) {
        return prev.map(it => (it.product_id === p.id ? { ...it, quantity: it.quantity + 1 } : it))
      }
      return [
        ...prev,
        {
          product_id: p.id as number,
          code: p.code ?? '',
          description: p.name,
          unit: normalizeSunatUnit(p.unit ?? '', p.type ?? 'product'),
          quantity: 1,
          unit_price: p.sale_price ?? 0,
          igv_affectation_type: p.igv_affectation_type ?? '10',
          price_includes_igv: p.price_includes_igv ?? false,
        },
      ]
    })
    toast.success(`"${p.name}" agregado`)
  }

  const addManualItem = () => {
    setItems(prev => [
      ...prev,
      {
        product_id: null,
        code: 'MANUAL',
        description: '',
        unit: 'NIU',
        quantity: 1,
        unit_price: 0,
        igv_affectation_type: '10',
        price_includes_igv: false,
      },
    ])
    toast.success('Ítem manual agregado. Edite descripción y precio.')
  }

  const updateItem = (idx: number, field: keyof SaleFormItem, value: string | number | boolean) => {
    setItems(prev => prev.map((it, i) => (i !== idx ? it : { ...it, [field]: value })))
  }

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const getItemTotals = (it: SaleFormItem) =>
    calcItem(it.unit_price, it.quantity, 0, it.igv_affectation_type, it.price_includes_igv, taxRate, taxConfig)

  /** Totales por tipo de afectación SUNAT (gravado, exonerado, inafecto, exportación). */
  const totalsByAfectacion = items.reduce(
    (acc, it) => {
      const { subtotal, taxAmount, total } = getItemTotals(it)
      const group = getAfectacionGroup(it.igv_affectation_type)
      acc[group].subtotal += subtotal
      acc[group].taxAmount += taxAmount
      acc[group].total += total
      return acc
    },
    { gravado: { subtotal: 0, taxAmount: 0, total: 0 }, exonerado: { subtotal: 0, taxAmount: 0, total: 0 }, inafecto: { subtotal: 0, taxAmount: 0, total: 0 }, exportacion: { subtotal: 0, taxAmount: 0, total: 0 } } as Record<SunatAfectacionGroup, { subtotal: number; taxAmount: number; total: number }>
  )

  const subtotalGlobal = items.reduce((s, it) => s + getItemTotals(it).subtotal, 0)
  const taxGlobal = items.reduce((s, it) => s + getItemTotals(it).taxAmount, 0)
  const totalGlobal = items.reduce((s, it) => s + getItemTotals(it).total, 0)

  // Un solo método de pago: el monto efectivo sigue al total de la venta.
  useEffect(() => {
    if (payments.length !== 1) return
    const formatted = totalGlobal.toFixed(2)
    setPayments((prev) => {
      if (prev.length !== 1 || prev[0].amount === formatted) return prev
      return [{ ...prev[0], amount: formatted }]
    })
  }, [totalGlobal, payments.length])

  const selectedContact = form.contact_id ? customers.find(c => c.id === form.contact_id!) : null

  const handleSave = async () => {
    if (!activeBranchId) {
      toast.error('No hay sucursal activa')
      return
    }
    if (!form.contact_id) {
      toast.error('Toda venta debe tener un cliente. Configure el cliente por defecto (doc. 0, número 99999999) en Contactos.')
      return
    }
    if (items.length === 0) {
      toast.error('Agregue al menos un ítem')
      return
    }
    if (!form.series_id) {
      toast.error('Seleccione una serie')
      return
    }
    const sunatCode = form.sunat_code
    if (sunatCode === '01') {
      if (!selectedContact) {
        toast.error('Factura (01) requiere cliente con RUC')
        return
      }
      if (selectedContact.doc_type !== '6') {
        toast.error('La factura solo puede emitirse a clientes con RUC')
        return
      }
      const docNum = (selectedContact.doc_number ?? '').trim()
      if (docNum.length !== SUNAT_RUC_LENGTH || !/^\d+$/.test(docNum)) {
        toast.error(`El RUC del cliente debe tener ${SUNAT_RUC_LENGTH} dígitos numéricos`)
        return
      }
    }
    if (selectedContact?.doc_type === '0' && (sunatCode === '00' || sunatCode === '03')) {
      if (totalGlobal > SUNAT_MAX_MONTO_CLIENTE_SIN_RUC) {
        toast.error(`Con cliente sin RUC el monto máximo es S/ ${SUNAT_MAX_MONTO_CLIENTE_SIN_RUC}. Total: S/ ${totalGlobal.toFixed(2)}`)
        return
      }
    }
    for (const it of items) {
      if (!it.description.trim()) {
        toast.error('Todos los ítems deben tener descripción')
        return
      }
    }

    const validPayments = payments.filter(p => Number(p.amount) > 0)
    const totalPaid = validPayments.reduce((s, p) => s + Number(p.amount), 0)
    if (validPayments.length === 0) {
      toast.error('Ingrese al menos un pago')
      return
    }
    if (totalPaid < totalGlobal - 0.01) {
      toast.error('El total de pagos no cubre el monto de la venta')
      return
    }

    setSaving(true)
    try {
      const payload: CreateSaleInput = {
        branch_id: activeBranchId,
        contact_id: form.contact_id || null,
        doc_type: series.find(s => s.id === form.series_id)?.doc_type ?? 'BOLETA',
        series_id: form.series_id,
        currency: form.currency,
        cash_session_id: cashSession?.id ?? null,
        issue_date: form.issue_date,
        due_date: form.due_date,
        payments: validPayments.map(p => ({ method: p.method, amount: Number(p.amount) })),
        notes: form.notes || undefined,
        items: items.map(it => ({
          product_id: it.product_id ?? null,
          code: it.code,
          description: it.description.trim(),
          unit: it.unit,
          quantity: it.quantity,
          unit_price: it.unit_price,
          igv_affectation_type: it.igv_affectation_type,
          price_includes_igv: it.price_includes_igv,
        })),
      }
      const sale = await salesService.create(payload)
      toast.success('Venta registrada')
      setPrintData(sale.print_data ?? null)
      setLastSale({ id: sale.id, number: sale.number, total: sale.total })
      setReceiptModalOpen(true)
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error al registrar venta')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isNotaVenta && !billingOk) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 text-center space-y-4">
        <h2 className="text-lg font-bold text-gray-800">Nuevo comprobante</h2>
        <p className="text-sm text-gray-600">
          La facturación electrónica no está habilitada. Use notas de venta o active SUNAT en configuración.
        </p>
        <Link
          to="/sales/nota-venta"
          className="inline-flex px-5 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
        >
          Registrar nota de venta
        </Link>
      </div>
    )
  }

  if (!isNotaVenta && tipoOptions.length === 0) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 text-center space-y-4">
        <h2 className="text-lg font-bold text-gray-800">Nuevo comprobante</h2>
        <p className="text-sm text-gray-600">
          No hay series de boleta o factura para esta sucursal. Configúrelas en Empresa → Series.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">
          {isNotaVenta ? 'Registrar nota de venta' : 'Nuevo comprobante'}
        </h2>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Datos generales</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          <div className="sm:col-span-1 lg:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo comprobante</label>
            {isNotaVenta ? (
              <div className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-700">
                {getTipoComprobanteLabel('00')}
              </div>
            ) : (
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={form.sunat_code}
                onChange={(e) => setForm((f) => ({ ...f, sunat_code: e.target.value }))}
              >
                {tipoOptions.map((code) => (
                  <option key={code} value={code}>
                    {getTipoComprobanteLabel(code)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="sm:col-span-1 lg:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Serie</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
              value={form.series_id ?? ''}
              onChange={e => setForm(f => ({ ...f, series_id: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">Seleccionar...</option>
              {seriesFiltered.map(s => (
                <option key={s.id} value={s.id}>{s.series}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-6">
            <label className="block text-xs font-medium text-gray-600 mb-1">Cliente *</label>
            <div className="flex gap-2">
              <select
                className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={form.contact_id ?? ''}
                onChange={e => setForm(f => ({ ...f, contact_id: e.target.value ? Number(e.target.value) : null }))}
              >
                <option value="">Seleccionar cliente...</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.business_name}
                    {c.doc_type === '0' && c.doc_number === '99999999' ? ' (por defecto)' : ''}
                    {formatTipoDocIdentidadDisplay(c.doc_type, c.doc_number)
                      ? ` — ${formatTipoDocIdentidadDisplay(c.doc_type, c.doc_number)}`
                      : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setAddClientOpen(true)}
                className="shrink-0 rounded-xl border border-[rgb(var(--p500))] px-3 py-2 text-xs font-medium text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] min-h-[42px]"
              >
                Nuevo
              </button>
            </div>
          </div>
          <div className="lg:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.issue_date}
              onChange={e => {
                const newIssue = e.target.value
                setForm(f => ({
                  ...f,
                  issue_date: newIssue,
                  due_date: f.due_date === f.issue_date ? newIssue : f.due_date,
                }))
              }}
            />
          </div>
          <div className="lg:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de vencimiento</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.due_date}
              onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
            />
            {form.sunat_code === '01' && (
              <p className="text-xs text-gray-500 mt-0.5">Para factura se envía a SUNAT (cbc:DueDate).</p>
            )}
          </div>
          <div className="col-span-full">
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              placeholder="Opcional"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          </div>
        </section>

        <section className="border-t border-gray-100 pt-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">Detalle de venta</p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowProductPicker(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[rgb(var(--p300))] text-[rgb(var(--p600))] text-sm font-medium hover:bg-[rgb(var(--p50))] shrink-0"
              >
                <Plus size={14} /> Agregar producto
              </button>
              <button
                type="button"
                onClick={addManualItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50 shrink-0"
              >
                <Package size={14} /> Producto manual
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm min-w-[720px] table-fixed">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[32%]">Descripción</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[12%]">Código</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[7%]">Unid.</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[9%]">Cant.</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[11%]">P. unit.</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[13%]">Afectación</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[9%]">IGV incl.</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[10%]">Total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const { total } = getItemTotals(it)
                  const manual = isManualItem(it)
                  return (
                    <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5">
                        {manual ? (
                          <input
                            className="w-full min-w-[140px] border border-gray-200 rounded-lg px-2 py-1 text-sm"
                            value={it.description}
                            onChange={e => updateItem(idx, 'description', e.target.value)}
                            placeholder="Descripción"
                          />
                        ) : (
                          <span className="text-gray-800">{it.description || '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {manual ? (
                          <input
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm font-mono"
                            value={it.code}
                            onChange={e => updateItem(idx, 'code', e.target.value)}
                          />
                        ) : (
                          <span className="font-mono text-gray-600">{it.code || '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {manual ? (
                          <input
                            className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm"
                            value={it.unit}
                            onChange={e => updateItem(idx, 'unit', e.target.value)}
                          />
                        ) : (
                          <span className="text-gray-700">{it.unit}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          min={0.001}
                          step={0.01}
                          className="w-full max-w-[4.5rem] border border-gray-200 rounded-lg px-2 py-1 text-sm"
                          value={it.quantity}
                          onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="w-full max-w-[5.5rem] border border-gray-200 rounded-lg px-2 py-1 text-sm"
                          value={it.unit_price}
                          onChange={e => updateItem(idx, 'unit_price', Math.max(0, Number(e.target.value) || 0))}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        {manual ? (
                          <select
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs"
                            value={it.igv_affectation_type}
                            onChange={e => updateItem(idx, 'igv_affectation_type', e.target.value)}
                          >
                            {IGV_AFFECTATION_OPTIONS.map(o => (
                              <option key={o.code} value={o.code}>{o.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-700">{IGV_AFFECTATION_OPTIONS.find(o => o.code === it.igv_affectation_type)?.label ?? it.igv_affectation_type}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {manual ? (
                          <select
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs"
                            value={it.price_includes_igv ? '1' : '0'}
                            onChange={e => updateItem(idx, 'price_includes_igv', e.target.value === '1')}
                          >
                            <option value="0">No</option>
                            <option value="1">Sí</option>
                          </select>
                        ) : (
                          <span className="text-gray-700">{it.price_includes_igv ? 'Sí' : 'No'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-gray-700 text-right tabular-nums">S/ {total.toFixed(2)}</td>
                      <td className="px-2 py-2.5">
                        <button type="button" onClick={() => removeItem(idx)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {items.length === 0 && (
              <div className="text-center py-10 text-gray-400 text-sm">
                Sin ítems. Use <strong>Agregar producto</strong> o <strong>Producto manual</strong>.
              </div>
            )}
          </div>
        </section>

        <section className="border-t border-gray-100 pt-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Resumen</p>
          <div className="flex justify-end">
            <div className="w-full max-w-sm space-y-2 text-sm">
            {totalsByAfectacion.gravado.total > 0 && (
              <>
                <div className="flex justify-between text-gray-600"><span>Op. gravada – Subtotal</span><span className="tabular-nums">S/ {totalsByAfectacion.gravado.subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-gray-600"><span>Op. gravada – IGV</span><span className="tabular-nums">S/ {totalsByAfectacion.gravado.taxAmount.toFixed(2)}</span></div>
                <div className="flex justify-between font-medium text-gray-800"><span>Op. gravada – Total</span><span className="tabular-nums">S/ {totalsByAfectacion.gravado.total.toFixed(2)}</span></div>
              </>
            )}
            {totalsByAfectacion.exonerado.total > 0 && (
              <div className="flex justify-between text-gray-600"><span>Op. exonerada</span><span>S/ {totalsByAfectacion.exonerado.total.toFixed(2)}</span></div>
            )}
            {totalsByAfectacion.inafecto.total > 0 && (
              <div className="flex justify-between text-gray-600"><span>Op. inafecta</span><span>S/ {totalsByAfectacion.inafecto.total.toFixed(2)}</span></div>
            )}
            {totalsByAfectacion.exportacion.total > 0 && (
              <div className="flex justify-between text-gray-600"><span>Op. exportación</span><span className="tabular-nums">S/ {totalsByAfectacion.exportacion.total.toFixed(2)}</span></div>
            )}
            <div className="flex justify-between text-gray-600 pt-1">
              <span>Subtotal</span>
              <span className="tabular-nums">S/ {subtotalGlobal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>IGV</span>
              <span className="tabular-nums">S/ {taxGlobal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-baseline font-bold text-gray-900 text-base pt-2 mt-1 border-t border-gray-200">
              <span>Total venta</span>
              <span className="tabular-nums text-lg">S/ {totalGlobal.toFixed(2)}</span>
            </div>
          </div>
          </div>
        </section>

        <section className="border-t border-gray-100 pt-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Métodos de pago</p>
          <div className="space-y-2 max-w-xl">
            {payments.map((p, idx) => (
              <div key={idx} className="flex flex-wrap gap-2 items-center">
                <select
                  className="w-40 sm:w-44 border border-gray-200 rounded-xl px-3 py-2 text-sm shrink-0"
                  value={p.method}
                  onChange={e => setPayments(prev => prev.map((x, i) => i === idx ? { ...x, method: e.target.value } : x))}
                >
                  {paymentMethods.map(m => (
                    <option key={m.id} value={m.code}>{m.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="Monto"
                  className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums"
                  value={p.amount}
                  onChange={e => setPayments(prev => prev.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))}
                />
                {payments.length > 1 && (
                  <button type="button" onClick={() => setPayments(prev => prev.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 p-1 shrink-0">
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setPayments(prev => [...prev, { method: paymentMethods[0]?.code ?? 'cash', amount: '' }])}
              className="text-xs text-[rgb(var(--p600))] hover:underline"
            >
              + Agregar método de pago
            </button>
          </div>
        </section>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => navigate('/sales')}
            className="inline-flex items-center justify-center px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 sm:min-w-[7.5rem]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || items.length === 0}
            className="inline-flex items-center justify-center px-6 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50 sm:min-w-[9rem]"
          >
            {saving ? 'Guardando...' : isNotaVenta ? 'Registrar nota de venta' : 'Registrar comprobante'}
          </button>
        </div>
      </div>

      <Modal open={showProductPicker} onClose={() => setShowProductPicker(false)} contentClassName="max-w-2xl">
        <ProductPickerModal onAdd={addProductToItems} onClose={() => setShowProductPicker(false)} />
      </Modal>

      <QuickContactCreateModal
        open={addClientOpen}
        onClose={() => setAddClientOpen(false)}
        defaultDocType={form.sunat_code === '01' ? '6' : '1'}
        onCreated={(contact) => {
          setCustomers((prev) => [...prev, contact])
          setForm((f) => ({ ...f, contact_id: contact.id }))
        }}
      />

      <ReceiptPrintModal
        open={receiptModalOpen}
        onClose={() => {
          setReceiptModalOpen(false)
          setPrintData(null)
          const id = lastSale?.id
          setLastSale(null)
          navigate(isNotaVenta ? '/sales' : '/billing', { state: id ? { created: id } : undefined })
        }}
        printData={printData}
        saleNumber={lastSale?.number}
        total={lastSale?.total}
      />
    </div>
  )
}

function ProductPickerModal({ onAdd, onClose }: { onAdd: (p: Product) => void; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const loadProducts = () => {
    setLoading(true)
    productsService.list(search, undefined, undefined, true, page, PER_PAGE)
      .then(({ data, total: t }) => {
        setProducts(data ?? [])
        setTotal(t ?? 0)
      })
      .catch(() => toast.error('Error cargando productos'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadProducts() }, [page, search])

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-800 text-lg">Seleccionar producto</h3>
        <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
      </div>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm"
          placeholder="Buscar por nombre o código..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
      </div>
      <div className="min-h-[280px] max-h-[50vh] overflow-y-auto border border-gray-200 rounded-xl">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No hay productos o no coinciden con la búsqueda.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Código</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Producto</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">P. venta</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 font-mono text-gray-600">{p.code || '-'}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{p.name}</td>
                  <td className="px-4 py-2.5 text-gray-700">S/ {Number(p.sale_price ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5">
                    <button type="button" onClick={() => onAdd(p)} className="px-3 py-1.5 rounded-lg bg-[rgb(var(--p600))] text-white text-xs font-medium hover:opacity-90">
                      Agregar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Mostrando {(page - 1) * PER_PAGE + 1}-{Math.min(page * PER_PAGE, total)} de {total} productos
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs disabled:opacity-40">Anterior</button>
            <span className="text-xs text-gray-600">Pág. {page} de {totalPages}</span>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs disabled:opacity-40">Siguiente</button>
          </div>
        </div>
      )}
      <div className="pt-2">
        <button type="button" onClick={onClose} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cerrar</button>
      </div>
    </>
  )
}
