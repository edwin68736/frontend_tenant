import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Plus, Minus, Trash2, Search, ShoppingCart, X, ChevronRight, Receipt, UserPlus, SearchCheck } from 'lucide-react'
import { productsService, getProductImageUrl, type Product, type Category, type ModifierGroup } from '@/services/products.service'
import { contactsService, type Contact, type CreateContactInput } from '@/services/contacts.service'
import { consultaService } from '@/services/consulta.service'
import { salesService } from '@/services/sales.service'
import { cashbankService, type CashSession, type PaymentMethodRecord } from '@/services/cashbank.service'
import { companyService, type SunatConfig } from '@/services/company.service'
import { useAuth } from '@/contexts/AuthContext'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { ReceiptPrintModal } from '@/components/ui/ReceiptPrintModal'
import type { PrintData } from '@/types/printData'
import {
  getTipoComprobanteLabel,
  getTipoDocIdentidadLabel,
  POS_SUNAT_CODE_ORDER,
  SUNAT_MAX_MONTO_CLIENTE_SIN_RUC,
  SUNAT_RUC_LENGTH,
  SUNAT_TIPO_DOC_IDENTIDAD_LIST,
} from '@/constants/sunat'
import { calcItem, getAfectacionGroup, type SunatAfectacionGroup } from '@/utils/taxCalc'
import { getTodayPeru } from '@/utils/datesPeru'

interface CartItem {
  product: Product
  quantity: number
  /** Precio unitario final (base + modificadores). Si no se define se usa product.sale_price */
  unitPrice?: number
  /** Números de serie elegidos (solo productos con manage_series) */
  serials?: string[]
  /** JSON de modificadores para el detalle de venta */
  modifiersJson?: string
}

interface PaymentLine {
  method: string
  amount: string
}

/** doc_type legacy → código SUNAT cuando sunat_code no viene en la serie */
function docTypeToSunatCode(docType: string): string {
  const u = (docType || '').toUpperCase()
  if (u.includes('NOTA') && u.includes('VENTA')) return '00'
  if (u === 'BOLETA') return '03'
  if (u === 'FACTURA') return '01'
  return ''
}

/** Códigos SUNAT únicos en orden: 00, 03, 01 (solo los que tengan serie en Empresa → Series). */
function sunatCodesFromSeries(series: { id: number; series: string; doc_type: string; sunat_code?: string }[]): string[] {
  const byCode = new Map<string, boolean>()
  series.forEach(s => {
    const code = (s.sunat_code ?? '').trim() || docTypeToSunatCode(s.doc_type)
    if (code) byCode.set(code, true)
  })
  const ordered: string[] = []
  for (const code of POS_SUNAT_CODE_ORDER) {
    if (byCode.has(code)) ordered.push(code)
  }
  byCode.forEach((_, code) => {
    if (!POS_SUNAT_CODE_ORDER.includes(code)) ordered.push(code)
  })
  return ordered
}

export default function POSPage() {
  // El POS forma parte del módulo de ventas
  return <RequireModule moduleKey="sales"><POSContent /></RequireModule>
}

function POSContent() {
  const { hasModule } = useAuth()
  // Caja (null en sesión hasta saber si hay caja abierta o no)
  const [session, setSession] = useState<CashSession | null>(null)
  /** Solo hasta terminar getOpenSession (no espera series/SUNAT/etc.). */
  const [cashSessionLoading, setCashSessionLoading] = useState(true)
  /** Con caja abierta: hasta tener SUNAT + series + métodos de pago (no bloquea por categorías/contacto). */
  const [posBootstrapLoading, setPosBootstrapLoading] = useState(true)
  const [sunat, setSunat] = useState<SunatConfig | null>(null)
  const [openingBalance, setOpeningBalance] = useState(0)
  const [openingSession, setOpeningSession] = useState(false)

  // Catálogo
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCat, setSelectedCat] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [loadingProducts, setLoadingProducts] = useState(true)

  // Carrito
  const [cart, setCart] = useState<CartItem[]>([])

  // Panel de cobro
  const [step, setStep] = useState<'cart' | 'payment'>('cart')
  const [selectedSunatCode, setSelectedSunatCode] = useState('') // Código SUNAT: 00, 03, 01
  const [series, setSeries] = useState<{ id: number; series: string; doc_type: string; sunat_code?: string }[]>([])
  const [sunatCodesForPOS, setSunatCodesForPOS] = useState<string[]>([]) // Solo códigos con serie en Empresa → Series
  const [selectedSeriesId, setSelectedSeriesId] = useState<number | null>(null)
  const [contactSearch, setContactSearch] = useState('')
  const [contactResults, setContactResults] = useState<Contact[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [payments, setPayments] = useState<PaymentLine[]>([{ method: 'cash', amount: '' }])
  const [processing, setProcessing] = useState(false)
  const [successSale, setSuccessSale] = useState<{ series: string; number: string; total: number } | null>(null)
  const [printData, setPrintData] = useState<PrintData | null>(null)
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [cartModalOpen, setCartModalOpen] = useState(false)
  const [productToConfigure, setProductToConfigure] = useState<Product | null>(null)
  const [productDetail, setProductDetail] = useState<{ modifier_group_ids: number[] } | null>(null)
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([])
  const [availableSerials, setAvailableSerials] = useState<{ serial: string; branch_id: number; status: string }[]>([])
  const [configVariant, setConfigVariant] = useState<{ groupId: number; optionId: number; name: string; extraPrice: number } | null>(null)
  const [configSerials, setConfigSerials] = useState<string[]>([])
  const [configModifiers, setConfigModifiers] = useState<{ optionId: number; name: string; extraPrice: number }[]>([])
  const [configLoading, setConfigLoading] = useState(false)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRecord[]>([])
  const [addClientModal, setAddClientModal] = useState(false)
  const [tenantRuc, setTenantRuc] = useState('')
  const [quickClientForm, setQuickClientForm] = useState<{ doc_type: string; doc_number: string; business_name: string; address: string; ubigeo: string }>({ doc_type: '1', doc_number: '', business_name: '', address: '', ubigeo: '' })
  const [validandoDoc, setValidandoDoc] = useState(false)
  const [savingClient, setSavingClient] = useState(false)
  const contactTimeout = useRef<ReturnType<typeof setTimeout>>()
  const categoriesScrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({ isDragging: false, startX: 0, startScrollLeft: 0 })
  const mouseUpRef = useRef<(() => void) | null>(null)
  const DRAG_THRESHOLD = 5

  useEffect(() => {
    setCashSessionLoading(true)
    setPosBootstrapLoading(true)

    cashbankService
      .getOpenSession()
      .then(sess => setSession(sess))
      .catch(() => {
        setSession(null)
        toast.error('Error comprobando caja')
      })
      .finally(() => setCashSessionLoading(false))

    Promise.all([
      companyService.getSunat(),
      companyService.listSeries({ category: 'venta' }),
      cashbankService.listPaymentMethods(),
    ])
      .then(([sun, ser, methods]) => {
        setSunat(sun)
        const ventaSeries = (ser ?? []) as { id: number; series: string; doc_type: string; sunat_code?: string }[]
        setSeries(ventaSeries)
        let codes = sunatCodesFromSeries(ventaSeries)
        if (!hasModule('billing') || (sun && !sun.sunat_enabled)) codes = codes.filter(c => c === '00')
        setSunatCodesForPOS(codes)
        setSelectedSunatCode(prev => (codes.includes(prev) ? prev : codes[0] ?? ''))
        if (Array.isArray(methods) && methods.length > 0) setPaymentMethods(methods as PaymentMethodRecord[])
      })
      .catch(() => toast.error('Error iniciando POS'))
      .finally(() => setPosBootstrapLoading(false))

    productsService
      .listCategories()
      .then(cats => setCategories(Array.isArray(cats) ? cats : []))
      .catch(() => {})

    contactsService
      .getDefault()
      .then(defaultContact => {
        if (defaultContact) setSelectedContact(defaultContact)
      })
      .catch(() => {})

    companyService.getConfig().then(c => setTenantRuc(c?.ruc ?? '')).catch(() => setTenantRuc(''))
  }, [hasModule])

  useEffect(() => {
    if (!session) return
    setLoadingProducts(true)
    productsService
      .list(q, selectedCat ?? undefined)
      .then(({ data }) => setProducts(data ?? []))
      .catch(() => {})
      .finally(() => setLoadingProducts(false))
  }, [q, selectedCat, session])

  // Cargar detalle y opciones cuando se abre el modal de configurar producto
  useEffect(() => {
    if (!productToConfigure) return
    setConfigLoading(true)
    setConfigVariant(null)
    setConfigSerials([])
    setConfigModifiers([])
    const branchId = session?.branch_id ?? 1
    Promise.all([
      productsService.get(productToConfigure.id),
      productsService.listModifierGroups(),
      productToConfigure.manage_series ? productsService.getSerials(productToConfigure.id) : Promise.resolve([]),
    ]).then(([detail, groups, serials]) => {
      setProductDetail(detail)
      setModifierGroups(groups ?? [])
      setAvailableSerials((serials ?? []).filter((s: { branch_id: number; status: string }) => s.branch_id === branchId && s.status === 'available'))
    }).catch(() => toast.error('Error al cargar opciones')).finally(() => setConfigLoading(false))
  }, [productToConfigure, session?.branch_id])

  const addConfiguredToCart = () => {
    if (!productToConfigure || !productDetail) return
    const p = productToConfigure
    const groupIds = productDetail.modifier_group_ids ?? []
    const variantGroup = modifierGroups.find(g => groupIds.includes(g.id) && g.required && !g.multi_select)
    if (p.has_variants && variantGroup && !configVariant) {
      toast.error('Selecciona una variante')
      return
    }
    const n = 1
    const unitPrice = p.sale_price + (configVariant?.extraPrice ?? 0) + configModifiers.reduce((s, m) => s + m.extraPrice, 0)
    const serialsToUse = p.manage_series ? (configSerials.length >= n ? configSerials.slice(0, n) : availableSerials.slice(0, n).map(s => s.serial)) : undefined
    if (p.manage_series && (serialsToUse?.length ?? 0) < n) {
      toast.error('No hay suficientes series disponibles')
      return
    }
    const modifiersPayload = [
      ...(configVariant ? [{ option_id: configVariant.optionId, name: configVariant.name, extra_price: configVariant.extraPrice }] : []),
      ...configModifiers.map(m => ({ option_id: m.optionId, name: m.name, extra_price: m.extraPrice })),
    ]
    setCart(c => [...c, {
      product: p,
      quantity: 1,
      unitPrice,
      serials: serialsToUse,
      modifiersJson: JSON.stringify(modifiersPayload),
    }])
    setProductToConfigure(null)
    setProductDetail(null)
  }

  // Al cambiar código SUNAT, seleccionar primera serie de ese tipo
  useEffect(() => {
    const match = series.find(s => ((s.sunat_code ?? '').trim() || docTypeToSunatCode(s.doc_type)) === selectedSunatCode)
    setSelectedSeriesId(match?.id ?? null)
  }, [selectedSunatCode, series])

  // Factura (01) solo admite cliente con RUC: si se cambia a 01 y el cliente es doc. 0, quitar selección
  useEffect(() => {
    if (selectedSunatCode === '01' && selectedContact?.doc_type === '0') {
      setSelectedContact(null)
      setContactSearch('')
    }
  }, [selectedSunatCode])

  // Arrastre horizontal en la lista de categorías (touch + ratón)
  const onCategoriesPointerDown = (clientX: number) => {
    const el = categoriesScrollRef.current
    if (!el) return
    dragRef.current.startX = clientX
    dragRef.current.startScrollLeft = el.scrollLeft
    dragRef.current.isDragging = false
  }
  const onCategoriesPointerMove = (clientX: number) => {
    const el = categoriesScrollRef.current
    if (!el) return
    const dx = dragRef.current.startX - clientX
    if (!dragRef.current.isDragging && Math.abs(dx) > DRAG_THRESHOLD) dragRef.current.isDragging = true
    el.scrollLeft = dragRef.current.startScrollLeft + dx
  }
  const onCategoryClick = (e: React.MouseEvent, fn: () => void) => {
    if (dragRef.current.isDragging) {
      e.preventDefault()
      e.stopPropagation()
      dragRef.current.isDragging = false
      return
    }
    fn()
  }

  const handleCategoriesMouseDown = (e: React.MouseEvent) => {
    onCategoriesPointerDown(e.clientX)
    const onMove = (ev: MouseEvent) => onCategoriesPointerMove(ev.clientX)
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (mouseUpRef.current === onUp) mouseUpRef.current = null
    }
    mouseUpRef.current = onUp
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Buscar contactos con debounce (Factura 01 requiere RUC)
  useEffect(() => {
    if (contactTimeout.current) clearTimeout(contactTimeout.current)
    if (!contactSearch.trim()) { setContactResults([]); return }
    contactTimeout.current = setTimeout(() => {
      const type = selectedSunatCode === '01' ? 'customer' : ''
      contactsService.list(contactSearch, type).then(d => setContactResults(d?.slice(0, 5) ?? []))
    }, 300)
  }, [contactSearch, selectedSunatCode])

  const taxRate = sunat?.tax_rate ?? 18
  const taxConfig = { taxRate, igvRegime: sunat?.igv_regime, taxBenefitZone: sunat?.tax_benefit_zone }

  const addToCart = (product: Product) => {
    const needsConfig = product.has_variants || product.manage_series || product.has_modifiers
    if (needsConfig) {
      setProductToConfigure(product)
      return
    }
    setCart(c => {
      const idx = c.findIndex(i => i.product.id === product.id && !i.serials?.length && !i.modifiersJson)
      if (idx >= 0) return c.map((i, k) => k === idx ? { ...i, quantity: i.quantity + 1 } : i)
      return [...c, { product, quantity: 1 }]
    })
  }

  const updateQty = (index: number, delta: number) => {
    setCart(c => c.map((i, k) => k === index ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i))
  }

  const removeFromCart = (index: number) => setCart(c => c.filter((_, k) => k !== index))

  const getCartItemTotals = (item: CartItem) => {
    const p = item.product
    const unitPrice = item.unitPrice ?? p.sale_price
    return calcItem(unitPrice, item.quantity, 0, p.igv_affectation_type ?? '10', p.price_includes_igv ?? false, taxRate, taxConfig)
  }

  const calcItemTotal = (item: CartItem) => getCartItemTotals(item).total

  const totalCart = cart.reduce((s, i) => s + calcItemTotal(i), 0)
  const totalsByAfectacion = cart.reduce(
    (acc, i) => {
      const { subtotal, taxAmount, total } = getCartItemTotals(i)
      const group = getAfectacionGroup(i.product.igv_affectation_type ?? '10')
      acc[group].subtotal += subtotal
      acc[group].taxAmount += taxAmount
      acc[group].total += total
      return acc
    },
    { gravado: { subtotal: 0, taxAmount: 0, total: 0 }, exonerado: { subtotal: 0, taxAmount: 0, total: 0 }, inafecto: { subtotal: 0, taxAmount: 0, total: 0 }, exportacion: { subtotal: 0, taxAmount: 0, total: 0 } } as Record<SunatAfectacionGroup, { subtotal: number; taxAmount: number; total: number }>
  )

  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const change = totalPaid - totalCart

  const addPaymentLine = () => setPayments(p => [...p, { method: paymentMethods[0]?.code ?? 'cash', amount: '' }])
  const removePaymentLine = (idx: number) => setPayments(p => p.filter((_, i) => i !== idx))
  const updatePayment = (idx: number, field: 'method' | 'amount', val: string) =>
    setPayments(p => p.map((x, i) => i === idx ? { ...x, [field]: val } : x))

  const goToPayment = () => {
    setPayments([{ method: paymentMethods[0]?.code ?? 'cash', amount: totalCart.toFixed(2) }])
    setStep('payment')
  }

  const handleOpenSession = async () => {
    setOpeningSession(true)
    try {
      const sess = await cashbankService.openSession({ branch_id: 1, opening_balance: openingBalance })
      setSession(sess)
      toast.success('Caja abierta')
    } catch { toast.error('Error abriendo caja') }
    finally { setOpeningSession(false) }
  }

  const selectedSeries = series.find(s => s.id === selectedSeriesId)

  const handleCheckout = async () => {
    if (cart.length === 0) { toast.error('Carrito vacío'); return }
    if (!selectedSeriesId || !selectedSeries) { toast.error('Selecciona una serie'); return }
    if (selectedSunatCode === '01') {
      if (!selectedContact) { toast.error('Factura (01) requiere cliente con RUC'); return }
      if (selectedContact.doc_type !== '6') {
        toast.error('La factura solo puede emitirse a clientes con RUC (documento tipo 6)')
        return
      }
      const docNum = (selectedContact.doc_number ?? '').trim()
      if (docNum.length !== SUNAT_RUC_LENGTH) {
        toast.error(`El RUC del cliente debe tener exactamente ${SUNAT_RUC_LENGTH} dígitos`)
        return
      }
      if (!/^\d+$/.test(docNum)) {
        toast.error('El RUC del cliente debe contener solo dígitos')
        return
      }
    }
    if (selectedContact?.doc_type === '0' && (selectedSunatCode === '00' || selectedSunatCode === '03')) {
      if (totalCart > SUNAT_MAX_MONTO_CLIENTE_SIN_RUC) {
        toast.error(`Con cliente sin RUC (doc. 0) el monto máximo permitido por SUNAT es S/ ${SUNAT_MAX_MONTO_CLIENTE_SIN_RUC}. Total: S/ ${totalCart.toFixed(2)}`)
        return
      }
    }
    const validPayments = payments.filter(p => Number(p.amount) > 0)
    if (validPayments.length === 0) { toast.error('Ingresa al menos un pago'); return }
    if (totalPaid < totalCart - 0.01) { toast.error('El pago no cubre el total'); return }

    setProcessing(true)
    try {
      const today = getTodayPeru()
      const sale = await salesService.create({
        branch_id: session?.branch_id ?? 1,
        contact_id: selectedContact?.id ?? null,
        doc_type: selectedSeries.doc_type,
        series_id: selectedSeriesId,
        currency: 'PEN',
        cash_session_id: session?.id ?? null,
        issue_date: today,
        due_date: today,
        payments: validPayments.map(p => ({ method: p.method, amount: Number(p.amount) })),
        items: cart.map(i => ({
          product_id: i.product.id,
          code: i.product.code,
          description: i.product.name,
          unit: i.product.unit,
          quantity: i.quantity,
          unit_price: i.unitPrice ?? i.product.sale_price,
          igv_affectation_type: i.product.igv_affectation_type,
          price_includes_igv: i.product.price_includes_igv,
          modifiers_json: i.modifiersJson ?? '',
          serials: i.serials ?? [],
        }))
      })
      setSuccessSale({ series: sale.series, number: sale.number, total: sale.total })
      setPrintData(sale.print_data ?? null)
      setReceiptModalOpen(true)
      setCart([]); setStep('cart'); setSelectedContact(null); setContactSearch(''); setPayments([{ method: paymentMethods[0]?.code ?? 'cash', amount: '' }])
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Error procesando venta') }
    finally { setProcessing(false) }
  }

  const openAddClientModal = () => {
    const num = contactSearch.trim().replace(/-/g, '')
    const docType = selectedSunatCode === '01' ? '6' : '1'
    setQuickClientForm({ doc_type: docType, doc_number: num, business_name: '', address: '', ubigeo: '' })
    setAddClientModal(true)
  }

  const handleValidarDoc = async () => {
    const docType = quickClientForm.doc_type
    const num = quickClientForm.doc_number.trim().replace(/-/g, '')
    const isRUC = docType === '6'
    const isDNI = docType === '1'
    if (isRUC && num.length !== 11) { toast.error('Ingrese un RUC de 11 dígitos'); return }
    if (isDNI && num.length !== 8) { toast.error('Ingrese un DNI de 8 dígitos'); return }
    if (!isRUC && !isDNI) { toast.error('Use DNI o RUC para validar'); return }
    if (!tenantRuc || tenantRuc.length !== 11) { toast.error('RUC de la empresa no configurado'); return }
    setValidandoDoc(true)
    try {
      if (isRUC) {
        const res = await consultaService.ruc(tenantRuc, num)
        if (!res.success || !res.razon_social) { toast.error('No se encontró el RUC'); return }
        setQuickClientForm(f => ({ ...f, business_name: res.razon_social ?? '', address: res.direccion ?? '', ubigeo: (res.ubigeo && res.ubigeo.length >= 6) ? res.ubigeo.slice(0, 6) : '' }))
      } else {
        const res = await consultaService.dni(tenantRuc, num)
        if (!res.success || !res.nombre_completo) { toast.error('No se encontró el DNI'); return }
        setQuickClientForm(f => ({ ...f, business_name: res.nombre_completo ?? '' }))
      }
      toast.success('Datos obtenidos')
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Error al validar') }
    finally { setValidandoDoc(false) }
  }

  const handleRegistrarCliente = async () => {
    const { doc_type, doc_number, business_name, address, ubigeo } = quickClientForm
    const num = doc_number.trim().replace(/-/g, '')
    if (!num) { toast.error('Ingrese número de documento'); return }
    if (!business_name.trim()) { toast.error('Ingrese nombre o razón social'); return }
    setSavingClient(true)
    try {
      const payload: CreateContactInput = { type: 'customer', doc_type, doc_number: num, business_name: business_name.trim(), address: address || undefined, ubigeo: ubigeo || undefined }
      const created = await contactsService.create(payload)
      setSelectedContact(created)
      setContactSearch(created.business_name)
      setContactResults([])
      setAddClientModal(false)
      toast.success('Cliente registrado')
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Error al registrar') }
    finally { setSavingClient(false) }
  }

  const cartCount = cart.length

  if (cashSessionLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 md:min-h-[50vh] gap-3" aria-busy="true" aria-live="polite">
        <div className="w-9 h-9 border-2 border-gray-200 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Comprobando caja…</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShoppingCart size={40} className="text-gray-300 mb-4" />
        <h3 className="text-xl font-bold text-gray-700">Caja cerrada</h3>
        <p className="text-gray-400 text-sm mt-1 mb-6">Debes abrir la caja para usar el POS</p>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">Balance inicial: S/</span>
          <input type="number" min={0} step={0.01} className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={openingBalance} onChange={e => setOpeningBalance(Number(e.target.value))} />
          <button onClick={handleOpenSession} disabled={openingSession}
            className="px-5 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {openingSession ? 'Abriendo...' : 'Abrir caja'}
          </button>
        </div>
      </div>
    )
  }

  if (posBootstrapLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 md:min-h-[50vh] gap-3" aria-busy="true" aria-live="polite">
        <div className="w-9 h-9 border-2 border-gray-200 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Preparando punto de venta…</p>
      </div>
    )
  }

  const floatingCartButton = typeof window !== 'undefined'
    ? createPortal(
        <button
          type="button"
          onClick={() => cartCount > 0 && setCartModalOpen(true)}
          className={`md:hidden fixed bottom-4 right-4 z-[60] flex items-center justify-center w-14 h-14 rounded-full shadow-lg ${
            cartCount > 0
              ? 'bg-[rgb(var(--p600))] text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-70'
          }`}
        >
          <ShoppingCart size={22} />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold">
              {cartCount}
            </span>
          )}
        </button>,
        document.body,
      )
    : null

  return (
    <div className="flex flex-col md:flex-row gap-4 md:h-[calc(100vh-120px)] md:overflow-hidden relative">
      {/* Columna izquierda: catálogo */}
      <div className="flex-1 flex flex-col min-w-0 space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm bg-white"
            placeholder="Buscar producto..." value={q} onChange={e => setQ(e.target.value)} />
        </div>

        {/* Filtro categorías: "Todos" fijo + lista de categorías con scroll/arrastre */}
        <div className="flex gap-2 items-center min-w-0">
          <button
            type="button"
            onClick={() => setSelectedCat(null)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${selectedCat === null ? 'bg-[rgb(var(--p600))] text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
          >
            Todos
          </button>
          <div
            ref={categoriesScrollRef}
            className="flex gap-2 overflow-x-auto overflow-y-hidden pb-1 scrollbar-hide scroll-drag-x select-none cursor-grab active:cursor-grabbing min-w-0 flex-1"
            onTouchStart={e => onCategoriesPointerDown(e.touches[0].clientX)}
            onTouchMove={e => {
              e.preventDefault()
              onCategoriesPointerMove(e.touches[0].clientX)
            }}
            onMouseDown={handleCategoriesMouseDown}
            style={{ touchAction: 'pan-x' }}
          >
            {categories.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={e => onCategoryClick(e, () => setSelectedCat(c.id))}
                className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${selectedCat === c.id ? 'bg-[rgb(var(--p600))] text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Grid de productos */}
        <div className="md:flex-1 md:overflow-y-auto">
          {loadingProducts ? (
            <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {products.filter(p => p.active).map(p => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="group bg-white rounded-2xl border border-gray-200 shadow-sm p-3 text-left hover:shadow-md hover:border-[rgb(var(--p300))] hover:ring-2 hover:ring-[rgb(var(--p100))] transition-all duration-200 active:scale-[0.98]"
                >
                  <div className="w-full h-20 bg-gray-50 rounded-xl flex items-center justify-center mb-2.5 overflow-hidden border border-gray-100 ring-1 ring-black/5">
                    {p.image_url ? (
                      <img
                        src={getProductImageUrl(p.image_url)}
                        alt={p.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-2xl font-bold text-[rgb(var(--p300))]">
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-tight">{p.name}</p>
                  <p className="text-sm font-bold text-[rgb(var(--p600))] mt-1">S/ {Number(p.sale_price).toFixed(2)}</p>
                  {p.category_name && <p className="text-xs text-gray-400 mt-0.5 truncate">{p.category_name}</p>}
                </button>
              ))}
            </div>
          )}
          {!loadingProducts && products.filter(p => p.active).length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">Sin productos</div>
          )}
        </div>
      </div>

      {/* Columna centro/derecha: carrito + cobro (solo desktop) */}
      <div className="hidden md:flex md:w-80 md:flex-shrink-0 flex-col bg-white rounded-2xl shadow-sm overflow-hidden md:mt-0">
        <div className="flex border-b border-gray-100">
          <button onClick={() => setStep('cart')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${step === 'cart' ? 'text-[rgb(var(--p600))] border-b-2 border-[rgb(var(--p600))]' : 'text-gray-400'}`}>
            Carrito ({cart.length})
          </button>
          <button onClick={() => cart.length > 0 && goToPayment()}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${step === 'payment' ? 'text-[rgb(var(--p600))] border-b-2 border-[rgb(var(--p600))]' : 'text-gray-400'} ${cart.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}>
            Cobrar
          </button>
        </div>

        {step === 'cart' && (
          <>
            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-10">
                  <ShoppingCart size={28} className="text-gray-300 mb-2" />
                  <p className="text-gray-400 text-sm">Carrito vacío</p>
                </div>
              ) : cart.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{item.product.name}</p>
                    <p className="text-xs text-[rgb(var(--p600))] font-bold">S/ {calcItemTotal(item).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(idx, -1)} className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200"><Minus size={10} /></button>
                    <span className="w-6 text-center text-xs font-bold">{item.quantity}</span>
                    <button onClick={() => updateQty(idx, 1)} className="w-6 h-6 rounded-lg bg-[rgb(var(--p100))] flex items-center justify-center hover:bg-[rgb(var(--p200))]"><Plus size={10} /></button>
                    <button onClick={() => removeFromCart(idx)} className="w-6 h-6 rounded-lg text-red-400 hover:bg-red-50 flex items-center justify-center"><Trash2 size={10} /></button>
                  </div>
                </div>
              ))}
            </div>

            {cart.length > 0 && (
              <div className="p-3 border-t border-gray-100 space-y-2">
                {totalsByAfectacion.gravado.total > 0 && (
                  <>
                    <div className="flex justify-between text-xs text-gray-500"><span>Op. gravada – Subtotal</span><span>S/ {totalsByAfectacion.gravado.subtotal.toFixed(2)}</span></div>
                    <div className="flex justify-between text-xs text-gray-500"><span>Op. gravada – IGV</span><span>S/ {totalsByAfectacion.gravado.taxAmount.toFixed(2)}</span></div>
                  </>
                )}
                {totalsByAfectacion.exonerado.total > 0 && (
                  <div className="flex justify-between text-xs text-gray-500"><span>Op. exonerada</span><span>S/ {totalsByAfectacion.exonerado.total.toFixed(2)}</span></div>
                )}
                {totalsByAfectacion.inafecto.total > 0 && (
                  <div className="flex justify-between text-xs text-gray-500"><span>Op. inafecta</span><span>S/ {totalsByAfectacion.inafecto.total.toFixed(2)}</span></div>
                )}
                {totalsByAfectacion.exportacion.total > 0 && (
                  <div className="flex justify-between text-xs text-gray-500"><span>Op. exportación</span><span>S/ {totalsByAfectacion.exportacion.total.toFixed(2)}</span></div>
                )}
                <div className="flex justify-between font-bold text-gray-800"><span>Total</span><span>S/ {totalCart.toFixed(2)}</span></div>
                <button onClick={goToPayment}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-bold hover:opacity-90">
                  Ir a cobrar <ChevronRight size={15} />
                </button>
              </div>
            )}
          </>
        )}

        {step === 'payment' && (
          <div className="flex-1 flex flex-col overflow-y-auto">
            <div className="p-3 space-y-3 flex-1 overflow-y-auto">
              {/* Tipo de comprobante por código SUNAT (00 N. Venta, 03 Boleta, 01 Factura) */}
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Tipo de comprobante</label>
                <div className="flex gap-1">
                  {sunatCodesForPOS.map(code => (
                    <button key={code} onClick={() => setSelectedSunatCode(code)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedSunatCode === code ? 'bg-[rgb(var(--p600))] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {getTipoComprobanteLabel(code)}
                    </button>
                  ))}
                </div>
                {sunatCodesForPOS.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">Registra series de venta en Empresa → Series</p>
                )}
              </div>

              {/* Serie: vinculada a las series de la vista Series para el código SUNAT elegido */}
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Serie</label>
                <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={selectedSeriesId ?? ''} onChange={e => setSelectedSeriesId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Seleccionar serie...</option>
                  {series.filter(s => ((s.sunat_code ?? '').trim() || docTypeToSunatCode(s.doc_type)) === selectedSunatCode).map(s => (
                    <option key={s.id} value={s.id}>{s.series}</option>
                  ))}
                </select>
              </div>

              {/* Cliente (Factura 01 requiere RUC - código 6) */}
              <div className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {selectedSunatCode === '01' ? 'Cliente (RUC) *' : 'Cliente (opcional)'}
                </label>
                {selectedContact ? (
                  <div className="flex items-center gap-2 bg-[rgb(var(--p50))] border border-[rgb(var(--p200))] rounded-xl px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{selectedContact.business_name}</p>
                      <p className="text-xs text-gray-500">{getTipoDocIdentidadLabel(selectedContact.doc_type)} {selectedContact.doc_number}</p>
                    </div>
                    <button onClick={() => { setSelectedContact(null); setContactSearch('') }} className="text-gray-400 hover:text-red-500"><X size={13} /></button>
                  </div>
                ) : (
                  <>
                    <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                      placeholder="Buscar por nombre o doc..." value={contactSearch} onChange={e => setContactSearch(e.target.value)} />
                    {contactResults.length > 0 && (
                      <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden max-h-40 overflow-y-auto">
                        {contactResults.map(c => (
                          <button key={c.id} onClick={() => { setSelectedContact(c); setContactSearch(''); setContactResults([]) }}
                            className="w-full text-left px-3 py-2 hover:bg-[rgb(var(--p50))] text-xs border-b border-gray-50 last:border-0">
                            <p className="font-medium text-gray-800">{c.business_name}</p>
                            <p className="text-gray-400">{getTipoDocIdentidadLabel(c.doc_type)} {c.doc_number}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {contactSearch.trim() && contactResults.length === 0 && (
                      <button type="button" onClick={openAddClientModal}
                        className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-[rgb(var(--p300))] text-[rgb(var(--p600))] text-sm font-medium hover:bg-[rgb(var(--p50))] transition-colors">
                        <UserPlus size={16} /> Agregar cliente
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Métodos de pago internos (control caja). Para SUNAT siempre se envía forma de pago Contado. */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600">Métodos de pago</label>
                  <button onClick={addPaymentLine} className="text-xs text-[rgb(var(--p600))] hover:underline">+ Agregar</button>
                </div>
                <div className="space-y-2">
                  {payments.map((p, idx) => (
                    <div key={idx} className="flex gap-1 items-center">
                      <select className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                        value={p.method} onChange={e => updatePayment(idx, 'method', e.target.value)}>
                        {paymentMethods.map(m => <option key={m.id} value={m.code}>{m.name}</option>)}
                      </select>
                      <div className="relative w-24">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">S/</span>
                        <input type="number" min={0} step={0.01} className="w-full border border-gray-200 rounded-lg pl-6 pr-2 py-1.5 text-xs"
                          value={p.amount} onChange={e => updatePayment(idx, 'amount', e.target.value)} />
                      </div>
                      {payments.length > 1 && (
                        <button onClick={() => removePaymentLine(idx)} className="text-red-400 hover:text-red-600"><X size={12} /></button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-xs mt-2 text-gray-500">
                  <span>Total pagado</span><span className={totalPaid >= totalCart ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>S/ {totalPaid.toFixed(2)}</span>
                </div>
                {change > 0.01 && <p className="text-xs text-green-600 font-medium mt-1">Vuelto: S/ {change.toFixed(2)}</p>}
              </div>
            </div>

            <div className="p-3 border-t border-gray-100 space-y-2">
              <div className="flex justify-between font-bold text-gray-800 text-sm"><span>Total a cobrar</span><span>S/ {totalCart.toFixed(2)}</span></div>
              <button onClick={handleCheckout} disabled={processing}
                className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50">
                {processing ? 'Procesando...' : <><Receipt size={15} /> Confirmar venta</>}
              </button>
              <button onClick={() => setStep('cart')} className="w-full py-2 text-xs text-gray-500 hover:text-gray-700">← Volver al carrito</button>
            </div>
          </div>
        )}
      </div>

      {/* Botón flotante de carrito (móvil, portal al body para evitar interferencias de layout) */}
      {floatingCartButton}

      {/* Modal carrito + cobro (móvil) */}
      <Modal open={cartModalOpen} onClose={() => setCartModalOpen(false)} contentClassName="max-w-md">
        <div className="flex flex-col max-h-[80vh]">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setStep('cart')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                step === 'cart'
                  ? 'text-[rgb(var(--p600))] border-b-2 border-[rgb(var(--p600))]'
                  : 'text-gray-400'
              }`}
            >
              Carrito ({cart.length})
            </button>
            <button
              onClick={() => cart.length > 0 && goToPayment()}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                step === 'payment'
                  ? 'text-[rgb(var(--p600))] border-b-2 border-[rgb(var(--p600))]'
                  : 'text-gray-400'
              } ${cart.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              Cobrar
            </button>
          </div>

          {step === 'cart' && (
            <>
              <div className="flex-1 overflow-y-auto">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-10">
                    <ShoppingCart size={28} className="text-gray-300 mb-2" />
                    <p className="text-gray-400 text-sm">Carrito vacío</p>
                  </div>
                ) : (
                  cart.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">
                          {item.product.name}
                        </p>
                        <p className="text-xs text-[rgb(var(--p600))] font-bold">
                          S/ {calcItemTotal(item).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQty(idx, -1)}
                          className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                        >
                          <Minus size={10} />
                        </button>
                        <span className="w-6 text-center text-xs font-bold">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQty(idx, 1)}
                          className="w-6 h-6 rounded-lg bg-[rgb(var(--p100))] flex items-center justify-center hover:bg-[rgb(var(--p200))]"
                        >
                          <Plus size={10} />
                        </button>
                        <button
                          onClick={() => removeFromCart(idx)}
                          className="w-6 h-6 rounded-lg text-red-400 hover:bg-red-50 flex items-center justify-center"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {cart.length > 0 && (
                <div className="p-3 border-t border-gray-100 space-y-2">
                  {totalsByAfectacion.gravado.total > 0 && (
                    <>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Op. gravada – Subtotal</span>
                        <span>S/ {totalsByAfectacion.gravado.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Op. gravada – IGV</span>
                        <span>S/ {totalsByAfectacion.gravado.taxAmount.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  {totalsByAfectacion.exonerado.total > 0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Op. exonerada</span>
                      <span>S/ {totalsByAfectacion.exonerado.total.toFixed(2)}</span>
                    </div>
                  )}
                  {totalsByAfectacion.inafecto.total > 0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Op. inafecta</span>
                      <span>S/ {totalsByAfectacion.inafecto.total.toFixed(2)}</span>
                    </div>
                  )}
                  {totalsByAfectacion.exportacion.total > 0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Op. exportación</span>
                      <span>S/ {totalsByAfectacion.exportacion.total.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-gray-800">
                    <span>Total</span>
                    <span>S/ {totalCart.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={goToPayment}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-bold hover:opacity-90"
                  >
                    Ir a cobrar <ChevronRight size={15} />
                  </button>
                </div>
              )}
            </>
          )}

          {step === 'payment' && (
            <div className="flex-1 flex flex-col overflow-y-auto">
              <div className="p-3 space-y-3 flex-1 overflow-y-auto">
                {/* Tipo de comprobante */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Tipo de comprobante
                  </label>
                  <div className="flex gap-1">
                    {sunatCodesForPOS.map(code => (
                      <button
                        key={code}
                        onClick={() => setSelectedSunatCode(code)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          selectedSunatCode === code
                            ? 'bg-[rgb(var(--p600))] text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {getTipoComprobanteLabel(code)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Serie */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Serie</label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    value={selectedSeriesId ?? ''}
                    onChange={e =>
                      setSelectedSeriesId(e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">Seleccionar serie...</option>
                    {series
                      .filter(
                        s =>
                          ((s.sunat_code ?? '').trim() || docTypeToSunatCode(s.doc_type)) ===
                          selectedSunatCode,
                      )
                      .map(s => (
                        <option key={s.id} value={s.id}>
                          {s.series}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Cliente */}
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {selectedSunatCode === '01'
                      ? 'Cliente (RUC) *'
                      : 'Cliente (opcional)'}
                  </label>
                  {selectedContact ? (
                    <div className="flex items-center gap-2 bg-[rgb(var(--p50))] border border-[rgb(var(--p200))] rounded-xl px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">
                          {selectedContact.business_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {getTipoDocIdentidadLabel(selectedContact.doc_type)}{' '}
                          {selectedContact.doc_number}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedContact(null)
                          setContactSearch('')
                        }}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                        placeholder="Buscar por nombre o doc..."
                        value={contactSearch}
                        onChange={e => setContactSearch(e.target.value)}
                      />
                      {contactResults.length > 0 && (
                        <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden max-h-40 overflow-y-auto">
                          {contactResults.map(c => (
                            <button
                              key={c.id}
                              onClick={() => {
                                setSelectedContact(c)
                                setContactSearch('')
                                setContactResults([])
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-[rgb(var(--p50))] text-xs border-b border-gray-50 last:border-0"
                            >
                              <p className="font-medium text-gray-800">{c.business_name}</p>
                              <p className="text-gray-400">
                                {getTipoDocIdentidadLabel(c.doc_type)} {c.doc_number}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                      {contactSearch.trim() && contactResults.length === 0 && (
                        <button
                          type="button"
                          onClick={openAddClientModal}
                          className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-[rgb(var(--p300))] text-[rgb(var(--p600))] text-sm font-medium hover:bg-[rgb(var(--p50))] transition-colors"
                        >
                          <UserPlus size={16} /> Agregar cliente
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Métodos de pago */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-gray-600">
                      Métodos de pago
                    </label>
                    <button
                      onClick={addPaymentLine}
                      className="text-xs text-[rgb(var(--p600))] hover:underline"
                    >
                      + Agregar
                    </button>
                  </div>
                  <div className="space-y-2">
                    {payments.map((p, idx) => (
                      <div key={idx} className="flex gap-1 items-center">
                        <select
                          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                          value={p.method}
                          onChange={e => updatePayment(idx, 'method', e.target.value)}
                        >
                          {paymentMethods.map(m => (
                            <option key={m.id} value={m.code}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                        <div className="relative w-24">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                            S/
                          </span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className="w-full border border-gray-200 rounded-lg pl-6 pr-2 py-1.5 text-xs"
                            value={p.amount}
                            onChange={e => updatePayment(idx, 'amount', e.target.value)}
                          />
                        </div>
                        {payments.length > 1 && (
                          <button
                            onClick={() => removePaymentLine(idx)}
                            className="text-red-400 hover:text-red-600"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs mt-2 text-gray-500">
                    <span>Total pagado</span>
                    <span
                      className={
                        totalPaid >= totalCart
                          ? 'text-green-600 font-bold'
                          : 'text-red-500 font-bold'
                      }
                    >
                      S/ {totalPaid.toFixed(2)}
                    </span>
                  </div>
                  {change > 0.01 && (
                    <p className="text-xs text-green-600 font-medium mt-1">
                      Vuelto: S/ {change.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>

              <div className="p-3 border-t border-gray-100 space-y-2">
                <div className="flex justify-between font-bold text-gray-800 text-sm">
                  <span>Total a cobrar</span>
                  <span>S/ {totalCart.toFixed(2)}</span>
                </div>
                <button
                  onClick={handleCheckout}
                  disabled={processing}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50"
                >
                  {processing ? 'Procesando...' : <><Receipt size={15} /> Confirmar venta</>}
                </button>
                <button
                  onClick={() => setStep('cart')}
                  className="w-full py-2 text-xs text-gray-500 hover:text-gray-700"
                >
                  ← Volver al carrito
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal configurar producto (variante, series, modificadores) */}
      <Modal open={!!productToConfigure} onClose={() => setProductToConfigure(null)} contentClassName="max-w-md">
        {productToConfigure && (
          <>
            <h3 className="font-bold text-gray-800">{productToConfigure.name}</h3>
            {configLoading ? (
              <div className="flex justify-center py-6"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <div className="space-y-4">
                {productToConfigure.has_variants && productDetail && (() => {
                  const groupIds = productDetail.modifier_group_ids ?? []
                  const variantGroup = modifierGroups.find(g => groupIds.includes(g.id) && g.required && !g.multi_select)
                  if (!variantGroup) return null
                  return (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Variante: {variantGroup.name}</label>
                      <div className="flex flex-wrap gap-2">
                        {(variantGroup.options ?? []).map(opt => (
                          <button key={opt.id} type="button"
                            onClick={() => setConfigVariant(configVariant?.optionId === opt.id ? null : { groupId: variantGroup.id, optionId: opt.id, name: opt.name, extraPrice: opt.extra_price ?? 0 })}
                            className={`px-3 py-1.5 rounded-xl text-sm font-medium ${configVariant?.optionId === opt.id ? 'bg-[rgb(var(--p600))] text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                            {opt.name}{(opt.extra_price ?? 0) > 0 ? ` (+S/ ${Number(opt.extra_price).toFixed(2)})` : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}
                {productToConfigure.manage_series && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Serie (obligatorio)</label>
                    {availableSerials.length === 0 ? (
                      <p className="text-xs text-amber-600">No hay series disponibles en esta sucursal.</p>
                    ) : (
                      <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={configSerials[0] ?? ''} onChange={e => setConfigSerials(e.target.value ? [e.target.value] : [])}>
                        <option value="">Seleccionar...</option>
                        {availableSerials.map(s => (
                          <option key={s.serial} value={s.serial}>{s.serial}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                {productToConfigure.has_modifiers && productDetail && (() => {
                  const groupIds = productDetail.modifier_group_ids ?? []
                  const modGroups = modifierGroups.filter(g => groupIds.includes(g.id) && (g.multi_select || !g.required))
                  if (modGroups.length === 0) return null
                  return (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Modificadores</label>
                      {modGroups.map(g => (
                        <div key={g.id} className="mb-2">
                          <p className="text-xs text-gray-500 mb-1">{g.name}</p>
                          <div className="flex flex-wrap gap-1">
                            {(g.options ?? []).map(opt => {
                              const isSelected = configModifiers.some(m => m.optionId === opt.id)
                              return (
                                <button key={opt.id} type="button"
                                  onClick={() => setConfigModifiers(prev => isSelected ? prev.filter(m => m.optionId !== opt.id) : [...prev, { optionId: opt.id, name: opt.name, extraPrice: opt.extra_price ?? 0 }])}
                                  className={`px-2 py-1 rounded-lg text-xs ${isSelected ? 'bg-[rgb(var(--p600))] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                  {opt.name}{(opt.extra_price ?? 0) > 0 ? ` +S/ ${Number(opt.extra_price).toFixed(2)}` : ''}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setProductToConfigure(null)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
                  <button type="button" onClick={addConfiguredToCart} disabled={configLoading || (productToConfigure.manage_series && configSerials.length === 0 && availableSerials.length > 0)} className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
                    Agregar al carrito
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* Modal registro rápido de cliente (POS) */}
      <Modal open={addClientModal} onClose={() => setAddClientModal(false)} contentClassName="max-w-md">
        <h3 className="font-bold text-gray-800 text-lg mb-3">Registro rápido de cliente</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de documento</label>
              <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={quickClientForm.doc_type} onChange={e => setQuickClientForm(f => ({ ...f, doc_type: e.target.value }))}>
                {SUNAT_TIPO_DOC_IDENTIDAD_LIST.filter(d => d.code === '1' || d.code === '6').map(d => (
                  <option key={d.code} value={d.code}>{d.shortLabel}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">N° Documento</label>
              <div className="flex border border-gray-200 rounded-xl overflow-hidden bg-white focus-within:ring-2 focus-within:ring-[rgb(var(--p600))] focus-within:border-[rgb(var(--p600))]">
                <input
                  className="flex-1 min-w-0 px-3 py-2 border-0 text-sm focus:outline-none focus:ring-0"
                  value={quickClientForm.doc_number} onChange={e => setQuickClientForm(f => ({ ...f, doc_number: e.target.value }))}
                  placeholder={quickClientForm.doc_type === '6' ? 'RUC 11 dígitos' : 'DNI 8 dígitos'}
                />
                <button
                  type="button"
                  onClick={handleValidarDoc}
                  disabled={validandoDoc || !quickClientForm.doc_number.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 border-l border-gray-200 text-sm text-gray-600 hover:bg-gray-50 bg-gray-50/80 whitespace-nowrap disabled:opacity-50"
                  title="Validar documento en SUNAT"
                >
                  <SearchCheck size={14} className={validandoDoc ? 'animate-pulse' : ''} />
                  {validandoDoc ? '...' : 'Validar'}
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre / Razón social *</label>
            <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              placeholder="Se completa con Validar o ingrese manual"
              value={quickClientForm.business_name} onChange={e => setQuickClientForm(f => ({ ...f, business_name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dirección (opcional)</label>
            <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              placeholder="Se completa con Validar RUC"
              value={quickClientForm.address} onChange={e => setQuickClientForm(f => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setAddClientModal(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="button" onClick={handleRegistrarCliente} disabled={savingClient || !quickClientForm.business_name.trim()}
              className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {savingClient ? 'Guardando...' : 'Registrar cliente'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de éxito con opciones de impresión */}
      <ReceiptPrintModal
        open={receiptModalOpen && !!successSale}
        onClose={() => { setReceiptModalOpen(false); setSuccessSale(null); setPrintData(null) }}
        printData={printData}
        saleNumber={successSale ? (successSale.number?.includes('-') ? successSale.number : `${successSale.series}-${String(successSale.number).padStart(8, '0')}`) : undefined}
        total={successSale?.total}
      />
    </div>
  )
}
