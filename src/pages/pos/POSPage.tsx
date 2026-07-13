import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Plus, Search, ShoppingCart, Trash2, X, ChevronRight, UserPlus, Package, ScanBarcode, LayoutGrid } from 'lucide-react'
import { clsx } from 'clsx'
import { productsService, getProductImageUrl, type Product, type Category } from '@/services/products.service'
import { contactsService, type Contact } from '@/services/contacts.service'
import { salesService } from '@/services/sales.service'
import { cashbankService, type CashSession, type PaymentMethodRecord, type BankAccount } from '@/services/cashbank.service'
import { tenantCanEmitFactura, type SunatConfig } from '@/services/company.service'
import { useAuth } from '@/contexts/AuthContext'
import { useBranch } from '@/contexts/BranchContext'
import { useBranchCheckoutSeries } from '@/contexts/BranchCheckoutSeriesContext'
import RequireModule from '@/components/ui/RequireModule'
import { ReceiptPrintModal } from '@/components/ui/ReceiptPrintModal'
import { QuickContactCreateModal } from '@/components/contacts/QuickContactCreateModal'
import { POSCheckoutModal, type CheckoutPaymentLine } from '@/components/pos/POSCheckoutModal'
import type { PrintData } from '@/types/printData'
import {
  SUNAT_MAX_MONTO_CLIENTE_SIN_RUC,
  SUNAT_RUC_LENGTH,
} from '@/constants/sunat'
import { isBonificacionGravada } from '@/constants/igvAffectation'
import { calcSaleCheckout } from '@/utils/saleEngine'
import { getAfectacionGroup, type SunatAfectacionGroup } from '@/utils/taxCalc'
import { getTodayPeru } from '@/utils/datesPeru'
import { formatMoney, formatSaleDocumentNumber } from '@/utils/format'
import { docTypeShortLabel } from '@/utils/paymentMethodVisual'
import { BranchSeriesEmptyState } from '@/components/pos/BranchSeriesEmptyState'
import { pickVariosContactId, isFacturaDocType, checkoutContactIsValid, isVariosContact } from '@/utils/checkoutContacts'
import { paidCoversTotal, roundSunat, sumMoney } from '@/utils/money'
import type { CheckoutDiscountMode } from '@/utils/checkoutDiscount'
import { buildTaxConfigFromSunat } from '@/constants/tax'
import { findPaymentMethodRecord, isPaymentMethodLinkedForSale } from '@/utils/paymentMethodCheckout'
import { defaultOperationalPaymentCode, filterOperationalPaymentMethods } from '@/utils/operationalPaymentMethods'
import { BILLING_NOT_ENABLED_MESSAGE, isElectronicBillingSunatCode } from '@/utils/posCheckoutSeries'
import { PosMobileCartDrawer } from '@/components/pos/PosMobileCartDrawer'
import { ManualProductModal } from '@/components/pos/ManualProductModal'
import { PosCategoriesModal } from '@/components/pos/PosCategoriesModal'
import { MoneyAmountInput } from '@/components/pos/MoneyAmountInput'
import { isTabletCapacitorDevice } from '@/lib/platform/detect'
import { PosCartLineRow } from '@/components/pos/PosCartLineRow'
import { ProductConfigureModal } from '@/components/pos/ProductConfigureModal'
import { roundMoney } from '@/utils/checkoutDiscount'
import {
  appendCatalogLine,
  applyCatalogLineUnitPrice,
  cartLineKey,
  cartLineUnitPrice,
  catalogLineModifiersJson,
  createCatalogCartLine,
  isCatalogCartLine,
  isManualCartLine,
  type CatalogCartLine,
  type ManualCartLine,
  type PosCartLine,
} from '@/utils/posCart'
import { useFlyToCart } from '@/hooks/useFlyToCart'
import { useBarcodeProductScanner } from '@/hooks/useBarcodeProductScanner'
import { BarcodeScannerModal } from '@/components/barcode/BarcodeScannerModal'
import { playCartAddSound, playCartRemoveSound } from '@/utils/cartSounds'
import { productConfigurationBadge, productNeedsSaleConfiguration } from '@/utils/productModifiers'

/** doc_type legacy → código SUNAT cuando sunat_code no viene en la serie */
function docTypeToSunatCode(docType: string): string {
  const u = (docType || '').toUpperCase()
  if (u.includes('NOTA') && u.includes('VENTA')) return '00'
  if (u === 'BOLETA') return '03'
  if (u === 'FACTURA') return '01'
  return ''
}

export default function POSPage() {
  // El POS forma parte del módulo de ventas
  return <RequireModule moduleKey="sales"><POSContent /></RequireModule>
}

function POSContent() {
  const { hasModule } = useAuth()
  const { activeBranchId } = useBranch()
  const { checkoutSeries, seriesMetaReady, hasCheckoutSeries, sunat: cachedSunat } =
    useBranchCheckoutSeries()
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
  const [cart, setCart] = useState<PosCartLine[]>([])
  const [manualProductOpen, setManualProductOpen] = useState(false)

  // Cobro (modal)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [seriesId, setSeriesId] = useState(0)
  const [docType, setDocType] = useState('NOTA DE VENTA')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactId, setContactId] = useState<number | null>(null)
  const [payments, setPayments] = useState<CheckoutPaymentLine[]>([])
  const [processing, setProcessing] = useState(false)
  const [successSale, setSuccessSale] = useState<{ id: number; series: string; number: string; total: number; clientEmail?: string } | null>(null)
  const [printData, setPrintData] = useState<PrintData | null>(null)
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [cartModalOpen, setCartModalOpen] = useState(false)
  const [productToConfigure, setProductToConfigure] = useState<Product | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRecord[]>([])
  const checkoutPaymentMethods = useMemo(() => filterOperationalPaymentMethods(paymentMethods), [paymentMethods])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [checkoutDiscountMode, setCheckoutDiscountMode] = useState<CheckoutDiscountMode>('percent')
  const [checkoutDiscountValue, setCheckoutDiscountValue] = useState(0)
  const [addClientModal, setAddClientModal] = useState(false)
  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false)
  const categoriesScrollRef = useRef<HTMLDivElement>(null)
  const cartBtnRef = useRef<HTMLButtonElement>(null)
  const desktopCartRef = useRef<HTMLDivElement>(null)
  const configureFlySourceRef = useRef<HTMLElement | undefined>(undefined)
  const { flyToCart, FlyToCartLayer, cancelFlyAnimations } = useFlyToCart(cartBtnRef, { desktopCartRef })
  const dragRef = useRef({ isDragging: false, startX: 0, startScrollLeft: 0 })
  const mouseUpRef = useRef<(() => void) | null>(null)
  const DRAG_THRESHOLD = 5

  useEffect(() => {
    setCashSessionLoading(true)
    setPosBootstrapLoading(true)

    cashbankService
      .getOpenSession(activeBranchId || undefined)
      .then(sess => setSession(sess))
      .catch(() => {
        setSession(null)
        toast.error('Error comprobando caja')
      })
      .finally(() => setCashSessionLoading(false))

    if (!activeBranchId) {
      setPosBootstrapLoading(false)
      return
    }

    cashbankService
      .listPaymentMethods()
      .then((methods) => {
        if (Array.isArray(methods) && methods.length > 0) setPaymentMethods(methods as PaymentMethodRecord[])
      })
      .catch(() => {})

    cashbankService
      .listBankAccounts(true)
      .then((accounts) => setBankAccounts(Array.isArray(accounts) ? accounts : []))
      .catch(() => setBankAccounts([]))
      .finally(() => setPosBootstrapLoading(false))

    productsService
      .listCategories()
      .then(cats => setCategories(Array.isArray(cats) ? cats : []))
      .catch(() => {})

    contactsService
      .list('', 'customer')
      .then((list) => {
        setContacts(list ?? [])
        const variosId = pickVariosContactId(list ?? [])
        if (variosId) setContactId((prev) => prev ?? variosId)
      })
      .catch(() => setContacts([]))
  }, [activeBranchId])

  useEffect(() => {
    if (cachedSunat) setSunat(cachedSunat)
  }, [cachedSunat])

  useEffect(() => {
    if (!seriesMetaReady || checkoutSeries.length === 0) {
      setSeriesId(0)
      return
    }
    const def =
      checkoutSeries.find((s) => docTypeToSunatCode(s.doc_type) === '00' || (s.sunat_code ?? '').trim() === '00') ??
      checkoutSeries[0]
    if (def) {
      setSeriesId(def.id)
      setDocType(String(def.doc_type || '').trim() || 'NOTA DE VENTA')
    }
  }, [checkoutSeries, seriesMetaReady])

  useEffect(() => {
    if (!session) return
    setLoadingProducts(true)
    productsService
      .list(q, selectedCat ?? undefined)
      .then(({ data }) => setProducts(data ?? []))
      .catch(() => {})
      .finally(() => setLoadingProducts(false))
  }, [q, selectedCat, session])

  const billingModule = hasModule('billing')
  const sunatEnabled = billingModule && Boolean(cachedSunat?.sunat_enabled ?? sunat?.sunat_enabled)
  const canFactura = tenantCanEmitFactura(cachedSunat ?? sunat)

  const handleConfigureConfirm = (line: CatalogCartLine) => {
    const source = configureFlySourceRef.current
    configureFlySourceRef.current = undefined
    let merged = false
    setCart((c) => {
      const result = appendCatalogLine(c, line)
      merged = result.merged
      return result.cart
    })
    if (!merged && source) flyToCart(source, getProductImageUrl(line.product.image_url))
    playCartAddSound()
    setProductToConfigure(null)
  }

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

  // Centra la categoría seleccionada dentro de la barra horizontal (sin afectar el scroll de la página).
  useEffect(() => {
    const el = categoriesScrollRef.current
    if (!el) return
    if (selectedCat === null) {
      el.scrollTo({ left: 0, behavior: 'smooth' })
      return
    }
    const btn = el.querySelector<HTMLElement>(`[data-cat-id="${selectedCat}"]`)
    if (!btn) return
    const containerRect = el.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    const delta = btnRect.left - containerRect.left - (el.clientWidth - btn.clientWidth) / 2
    el.scrollTo({ left: el.scrollLeft + delta, behavior: 'smooth' })
  }, [selectedCat, categories])

  const taxConfig = buildTaxConfigFromSunat(cachedSunat ?? sunat ?? undefined)
  const taxRate = taxConfig.taxRate

  const addToCart = useCallback(
    (product: Product, sourceEl?: HTMLElement) => {
      if (productNeedsSaleConfiguration(product)) {
        configureFlySourceRef.current = sourceEl
        cancelFlyAnimations()
        setProductToConfigure(product)
        return
      }
      const imageUrl = getProductImageUrl(product.image_url)
      let merged = false
      setCart((c) => {
        const result = appendCatalogLine(c, createCatalogCartLine(product))
        merged = result.merged
        return result.cart
      })
      if (!merged && sourceEl) flyToCart(sourceEl, imageUrl)
      playCartAddSound()
    },
    [flyToCart, cancelFlyAnimations],
  )

  const barcodeScan = useBarcodeProductScanner({
    products,
    branchId: activeBranchId ?? session?.branch_id,
    onProductFound: product => addToCart(product),
    onClearSearch: () => setQ(''),
  })

  const setCartQty = (index: number, qty: number) => {
    if (qty <= 0) {
      playCartRemoveSound()
      setCart(c => c.filter((_, k) => k !== index))
    } else setCart(c => c.map((i, k) => (k === index ? { ...i, quantity: qty } : i)))
  }

  const setCartUnitPrice = (index: number, raw: string) => {
    const parsed = Number.parseFloat(raw.replace(',', '.'))
    if (Number.isNaN(parsed) || parsed < 0) return
    setCart(c =>
      c.map((x, i) => {
        if (i !== index) return x
        if (x.kind === 'manual') return { ...x, unit_price: roundMoney(parsed) }
        return applyCatalogLineUnitPrice(x, parsed)
      }),
    )
  }

  const removeFromCart = (index: number) => {
    playCartRemoveSound()
    setCart(c => c.filter((_, k) => k !== index))
  }

  const emptyCart = () => {
    if (cart.length === 0) return
    cancelFlyAnimations()
    setCart([])
    playCartRemoveSound()
    toast.success('Carrito vaciado')
  }

  const renderCartHeader = (className?: string) => (
    <div className={clsx('flex items-center justify-between gap-2 shrink-0', className)}>
      <h3 className="text-sm font-semibold text-gray-800">Carrito ({cart.length})</h3>
      {cart.length > 0 && (
        <button
          type="button"
          onClick={emptyCart}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 transition-colors"
          title="Vaciar carrito"
        >
          <Trash2 size={13} />
          Vaciar
        </button>
      )}
    </div>
  )

  const addManualToCart = (line: ManualCartLine) => {
    setCart(c => [...c, line])
    playCartAddSound()
    toast.success('Producto manual agregado')
  }

  const cartToSaleLine = (item: PosCartLine) => {
    if (isManualCartLine(item)) {
      return {
        unitPrice: item.unit_price,
        quantity: item.quantity,
        igvAffectationType: item.igv_affectation_type,
        priceIncludesIgv: item.price_includes_igv,
      }
    }
    const p = item.product
    return {
      unitPrice: cartLineUnitPrice(item),
      quantity: item.quantity,
      igvAffectationType: p.igv_affectation_type ?? '10',
      priceIncludesIgv: p.price_includes_igv ?? true,
    }
  }

  const saleCalc = useMemo(
    () =>
      calcSaleCheckout({
        lines: cart.map(cartToSaleLine),
        globalDiscountMode: checkoutDiscountMode,
        globalDiscountValue: checkoutDiscountValue,
        taxRate,
        taxConfig,
      }),
    [cart, checkoutDiscountMode, checkoutDiscountValue, taxRate, taxConfig.igvRegime, taxConfig.taxBenefitZone],
  )

  const getCartItemTotals = (_item: PosCartLine, idx: number) => {
    const l = saleCalc.lines[idx]
    return { subtotal: l?.subtotal ?? 0, taxAmount: l?.taxAmount ?? 0, total: l?.total ?? 0 }
  }

  const renderCartLines = () =>
    cart.map((item, i) => {
      const aff = isManualCartLine(item) ? item.igv_affectation_type : (item.product.igv_affectation_type ?? '10')
      const lineTotals = getCartItemTotals(item, i)
      const subtotalLabel = isBonificacionGravada(aff)
        ? `Bonif. ref. ${formatMoney(lineTotals.subtotal)}`
        : `Subtotal: ${formatMoney(lineTotals.total)}`
      return (
      <PosCartLineRow
        key={cartLineKey(item)}
        line={item}
        subtotalLabel={subtotalLabel}
        onQtyChange={(d) => setCartQty(i, item.quantity + d)}
        onUnitPriceChange={(v) => setCartUnitPrice(i, v)}
        onRemove={() => removeFromCart(i)}
      />
    )})

  const checkoutDiscountAmount = saleCalc.globalDiscountAmount
  const payableTotal = saleCalc.total
  const taxGlobal = saleCalc.taxAmount
  const rawSubtotalGlobal = useMemo(
    () => roundSunat(saleCalc.lines.reduce((s, l) => s + l.grossSubtotal, 0)),
    [saleCalc],
  )

  const displayCartTotal = payableTotal

  const totalsByAfectacion = useMemo(
    () =>
      cart.reduce(
        (acc, i, idx) => {
          const { subtotal, taxAmount, total } = getCartItemTotals(i, idx)
          const aff = isManualCartLine(i) ? i.igv_affectation_type : (i.product.igv_affectation_type ?? '10')
          const group = getAfectacionGroup(aff)
          acc[group].subtotal = roundSunat(acc[group].subtotal + subtotal)
          acc[group].taxAmount = roundSunat(acc[group].taxAmount + taxAmount)
          acc[group].total = roundSunat(acc[group].total + total)
          return acc
        },
        {
          gravado: { subtotal: 0, taxAmount: 0, total: 0 },
          exonerado: { subtotal: 0, taxAmount: 0, total: 0 },
          inafecto: { subtotal: 0, taxAmount: 0, total: 0 },
          exportacion: { subtotal: 0, taxAmount: 0, total: 0 },
        } as Record<SunatAfectacionGroup, { subtotal: number; taxAmount: number; total: number }>,
      ),
    [cart, saleCalc, taxRate, taxConfig.igvRegime, taxConfig.taxBenefitZone],
  )

  const defaultContactId = useMemo(() => pickVariosContactId(contacts), [contacts])
  const effectiveContactId = contactId ?? defaultContactId
  const selectedSeries = useMemo(
    () => checkoutSeries.find((s) => s.id === seriesId) ?? null,
    [checkoutSeries, seriesId],
  )
  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === effectiveContactId) ?? null,
    [contacts, effectiveContactId],
  )
  const selectedSunatCode = useMemo(
    () => (selectedSeries ? (selectedSeries.sunat_code ?? '').trim() || docTypeToSunatCode(selectedSeries.doc_type) : ''),
    [selectedSeries],
  )

  const resetCheckoutToNotaVenta = useCallback(() => {
    const def =
      checkoutSeries.find((s) => docTypeToSunatCode(s.doc_type) === '00' || (s.sunat_code ?? '').trim() === '00') ??
      null
    if (def) {
      setSeriesId(def.id)
      setDocType(String(def.doc_type || '').trim() || 'NOTA DE VENTA')
    }
    const variosId = pickVariosContactId(contacts)
    if (variosId) setContactId(variosId)
  }, [checkoutSeries, contacts])

  const openCheckout = () => {
    if (branchSeriesMissing) return
    if (cart.length === 0) return
    resetCheckoutToNotaVenta()
    const cashCode = defaultOperationalPaymentCode(paymentMethods)
    setPayments([{ method: cashCode, amount: roundSunat(payableTotal), reference: '' }])
    setCheckoutOpen(true)
  }

  useEffect(() => {
    if (!checkoutOpen || payments.length !== 1) return
    setPayments((prev) => {
      if (prev.length !== 1) return prev
      const nextAmount = roundSunat(payableTotal)
      if (Math.abs((prev[0]?.amount ?? 0) - nextAmount) < 0.009) return prev
      return [{ ...prev[0], amount: nextAmount }]
    })
  }, [checkoutOpen, payableTotal, payments.length])

  useEffect(() => {
    if (!checkoutOpen) {
      setCheckoutDiscountValue(0)
      setCheckoutDiscountMode('percent')
    }
  }, [checkoutOpen])

  const handleOpenSession = async () => {
    setOpeningSession(true)
    try {
      const branchId = activeBranchId
      if (!branchId) { toast.error('Seleccione una sucursal activa'); return }
      const sess = await cashbankService.openSession({ branch_id: branchId, opening_balance: openingBalance })
      setSession(sess)
      toast.success('Caja abierta')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Error abriendo caja')
    } finally { setOpeningSession(false) }
  }

  const handleCheckout = async () => {
    if (branchSeriesMissing) return
    if (cart.length === 0) { toast.error('Carrito vacío'); return }
    if (!seriesId || !selectedSeries) return

    if (!sunatEnabled && isElectronicBillingSunatCode(selectedSeries.sunat_code ?? selectedSunatCode)) {
      toast.error(BILLING_NOT_ENABLED_MESSAGE)
      return
    }

    const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    if (!paidCoversTotal(paid, payableTotal)) {
      toast.error('El monto pagado debe cubrir el total')
      return
    }

    const contactForCheckout = contacts.find((c) => c.id === effectiveContactId) ?? null
    if (!checkoutContactIsValid(contactForCheckout, docType, selectedSeries.sunat_code)) {
      toast.error(
        isFacturaDocType(docType, selectedSeries.sunat_code)
          ? 'La factura requiere un cliente con RUC'
          : 'Selecciona un cliente',
      )
      return
    }

    if (isFacturaDocType(docType, selectedSeries.sunat_code)) {
      const docNum = (contactForCheckout?.doc_number ?? '').trim()
      if (docNum.length !== SUNAT_RUC_LENGTH || !/^\d+$/.test(docNum)) {
        toast.error(`El RUC del cliente debe tener exactamente ${SUNAT_RUC_LENGTH} dígitos`)
        return
      }
    }

    if (contactForCheckout && isVariosContact(contactForCheckout) && (selectedSunatCode === '00' || selectedSunatCode === '03')) {
      if (payableTotal > SUNAT_MAX_MONTO_CLIENTE_SIN_RUC) {
        toast.error(`Con cliente sin RUC el monto máximo permitido por SUNAT es S/ ${SUNAT_MAX_MONTO_CLIENTE_SIN_RUC}`)
        return
      }
    }

    if (paymentMethods.length > 0) {
      for (const p of payments) {
        if (Number(p.amount) <= 0) continue
        const pm = findPaymentMethodRecord(paymentMethods, p.method)
        if (!pm) {
          toast.error('Método de pago no configurado. Revísalo en Caja → Métodos de pago.')
          return
        }
        if (!isPaymentMethodLinkedForSale(pm, bankAccounts)) {
          toast.error(`El método "${pm.name}" no tiene una cuenta vinculada.`)
          return
        }
      }
    }

    const validPayments = payments.filter((p) => Number(p.amount) > 0)
    // Ventas con total 0 (p. ej. solo bonificaciones/gratuitas) no requieren pago.
    const requiresPayment = roundSunat(payableTotal) > 0.009
    if (requiresPayment && validPayments.length === 0) { toast.error('Ingresa al menos un pago'); return }

    const branchId = activeBranchId || session?.branch_id
    if (!branchId) {
      toast.error('Seleccione una sucursal activa')
      return
    }

    setProcessing(true)
    try {
      const today = getTodayPeru()
      const sale = await salesService.create({
        branch_id: branchId,
        contact_id: contactForCheckout?.id ?? null,
        doc_type: selectedSeries.doc_type,
        series_id: seriesId,
        currency: 'PEN',
        cash_session_id: session?.id ?? null,
        issue_date: today,
        due_date: today,
        payments: validPayments.map((p) => ({ method: p.method, amount: roundSunat(Number(p.amount)) })),
        global_discount_mode: checkoutDiscountValue > 0 ? checkoutDiscountMode : undefined,
        global_discount_value: checkoutDiscountValue > 0 ? checkoutDiscountValue : undefined,
        items: cart.map((i) => {
          if (isManualCartLine(i)) {
            return {
              product_id: null,
              code: i.code,
              description: i.description,
              unit: i.unit,
              quantity: i.quantity,
              unit_price: i.unit_price,
              igv_affectation_type: i.igv_affectation_type || '10',
              price_includes_igv: i.price_includes_igv,
              modifiers_json: '',
              serials: [],
            }
          }
          const unitPrice = cartLineUnitPrice(i)
          return {
            product_id: i.product.id,
            code: i.product.code,
            description: i.product.name,
            unit: i.product.unit,
            quantity: i.quantity,
            unit_price: unitPrice,
            igv_affectation_type: i.product.igv_affectation_type ?? '10',
            price_includes_igv: i.product.price_includes_igv ?? true,
            modifiers_json: catalogLineModifiersJson(i),
            serials: i.serials ?? [],
          }
        }),
      })
      setSuccessSale({
        id: sale.id,
        series: sale.series,
        number: sale.number,
        total: sale.total,
        clientEmail: contactForCheckout?.email?.trim(),
      })
      setPrintData(sale.print_data ?? null)
      setReceiptModalOpen(true)
      const docLabel = docTypeShortLabel(sale.doc_type ?? selectedSeries.doc_type, selectedSunatCode)
      const docNum = formatSaleDocumentNumber(sale.series, sale.number)
      toast.success(`${docLabel} ${docNum} registrada`)
      setCheckoutOpen(false)
      resetCheckoutToNotaVenta()
      setCart([])
      setPayments([])
      setCheckoutDiscountValue(0)
      setCheckoutDiscountMode('percent')
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error procesando venta')
    } finally { setProcessing(false) }
  }

  const openAddClientModal = () => setAddClientModal(true)

  const cartCount = cart.length
  const branchSeriesMissing = Boolean(activeBranchId) && seriesMetaReady && !hasCheckoutSeries
  const posTablet = isTabletCapacitorDevice()

  const posSeriesLoading = Boolean(session) && Boolean(activeBranchId) && !seriesMetaReady

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
          <MoneyAmountInput className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={openingBalance} onChange={setOpeningBalance} emptyWhenZero placeholder="0.00" />
          <button onClick={handleOpenSession} disabled={openingSession}
            className="px-5 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {openingSession ? 'Abriendo...' : 'Abrir caja'}
          </button>
        </div>
      </div>
    )
  }

  if (posBootstrapLoading || posSeriesLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 md:min-h-[50vh] gap-3" aria-busy="true" aria-live="polite">
        <div className="w-9 h-9 border-2 border-gray-200 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Preparando punto de venta…</p>
      </div>
    )
  }

  if (branchSeriesMissing) {
    return (
      <div className="max-w-lg mx-auto py-8 px-4">
        <BranchSeriesEmptyState />
      </div>
    )
  }

  const floatingCartButton =
    !cartModalOpen && typeof window !== 'undefined'
      ? createPortal(
          <button
            ref={cartBtnRef}
            type="button"
            onClick={() => cartCount > 0 && setCartModalOpen(true)}
            disabled={cartCount === 0}
            className={clsx(
              'pos-cart-fab fixed z-[105] touch-manipulation transition-transform',
              cartCount > 0 ? 'hover:bg-primary-700 active:scale-95' : 'pos-cart-fab--empty cursor-default',
            )}
            aria-label={cartCount > 0 ? `Abrir carrito, ${cartCount} artículos` : 'Carrito vacío'}
          >
            <ShoppingCart size={posTablet ? 32 : 28} strokeWidth={2.25} aria-hidden />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[1.35rem] h-[1.35rem] px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[11px] font-bold ring-2 ring-white tabular-nums">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>,
          document.body,
        )
      : null

  return (
    <div className="pos-layout -m-2 flex h-[calc(100dvh-9.5rem)] min-h-[28rem] flex-col overflow-hidden pt-2 sm:pt-3 sm:-m-3 md:-m-4 md:pt-3">
      {/* Columna izquierda: catálogo */}
      <div className="flex w-full min-w-0 max-w-full flex-1 flex-col min-h-0 overflow-hidden">
        {/* Filtro categorías */}
        <div className="flex w-full gap-1.5 overflow-x-auto pb-2 pt-0.5 min-w-0 shrink-0 scroll-drag-x mb-2">
          <button
            type="button"
            onClick={() => setSelectedCat(null)}
            className={clsx(
              'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              selectedCat === null
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100',
            )}
          >
            Todas
          </button>
          <div
            ref={categoriesScrollRef}
            className="flex gap-1.5 overflow-x-auto overflow-y-hidden min-w-0 flex-1 select-none cursor-grab active:cursor-grabbing"
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
                data-cat-id={c.id}
                onClick={e => onCategoryClick(e, () => setSelectedCat(c.id))}
                className={clsx(
                  'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border whitespace-nowrap',
                  selectedCat === c.id
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
          {categories.length > 0 && (
            <button
              type="button"
              onClick={() => setCategoriesModalOpen(true)}
              title="Ver todas las categorías"
              aria-label="Ver todas las categorías"
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-primary-600 bg-white text-primary-700 hover:bg-primary-50 transition-colors"
            >
              <LayoutGrid size={14} aria-hidden />
              <span className="hidden sm:inline">Todas</span>
            </button>
          )}
        </div>

        {/* Panel de productos (mismo diseño que POS restaurante) */}
        <div className="flex w-full max-w-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-sm sm:rounded-2xl">
          <div className="px-2 py-1.5 sm:px-3 sm:py-2 border-b border-stone-100 shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0 flex items-center">
                {barcodeScan.scannerMode ? (
                  <ScanBarcode size={16} className="absolute left-2.5 text-primary-600 pointer-events-none" aria-hidden />
                ) : (
                  <Search size={16} className="absolute left-2.5 text-stone-400 pointer-events-none" aria-hidden />
                )}
                <input
                  ref={barcodeScan.searchInputRef}
                  type="search"
                  className={clsx(
                    'w-full rounded-xl border bg-white py-1.5 pl-8 pr-3 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:border-primary-400',
                    barcodeScan.scannerMode
                      ? 'border-primary-300 focus:ring-primary-500/40'
                      : 'border-stone-200 focus:ring-primary-500/30',
                  )}
                  placeholder={
                    barcodeScan.scannerMode
                      ? barcodeScan.useCameraBarcodeScanner
                        ? 'Cámara activa — apunta al código'
                        : 'Escanear código de barras…'
                      : 'Buscar producto...'
                  }
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  onKeyDown={barcodeScan.handleSearchKeyDown}
                  disabled={barcodeScan.scanProcessing}
                />
                {(loadingProducts || barcodeScan.scanProcessing) && (
                  <div className="absolute right-2.5 h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" aria-hidden />
                )}
              </div>
              <button
                type="button"
                onClick={barcodeScan.toggleScannerMode}
                className={clsx(
                  'shrink-0 inline-flex items-center justify-center rounded-xl border p-2 transition-colors touch-manipulation',
                  barcodeScan.scannerMode
                    ? 'border-primary-300 bg-primary-50 text-primary-700'
                    : 'border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100',
                )}
                title={
                  barcodeScan.scannerMode
                    ? 'Modo escáner activo: Enter agrega al carrito'
                    : 'Activar escáner de código de barras'
                }
                aria-label="Escanear código de barras"
              >
                <ScanBarcode size={18} aria-hidden />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 w-full overflow-y-auto p-1.5 sm:p-3 md:min-h-[280px]">
            {loadingProducts && products.filter(p => p.active).length === 0 ? (
              <div className="py-8 text-center text-stone-400 text-sm">
                <div className="inline-block w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="grid w-full max-w-full grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 md:grid-cols-5 lg:grid-cols-6 justify-items-stretch">
                {products.filter(p => p.active).map(p => {
                  const imgUrl = getProductImageUrl(p.image_url)
                  const configBadge = productConfigurationBadge(p)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={(e) => {
                        const visual = (e.currentTarget as HTMLElement).querySelector(
                          '[data-product-visual]',
                        ) as HTMLElement | null
                        addToCart(p, visual ?? e.currentTarget)
                      }}
                      className="group rounded-xl border border-stone-200 bg-stone-50/50 overflow-hidden text-left transition-all duration-200 hover:border-primary-400 hover:shadow-md hover:shadow-primary-100/50 hover:bg-white focus:outline-none focus:ring-2 focus:ring-primary-400/50 active:scale-[0.98]"
                    >
                      <div data-product-visual className="aspect-square bg-stone-200/80 relative overflow-hidden">
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt={p.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-stone-400">
                            <Package className="w-8 h-8" aria-hidden />
                          </div>
                        )}
                      </div>
                      <div className="p-2">
                        <p className="font-medium text-stone-800 text-xs leading-tight line-clamp-2 min-h-[2rem]">
                          {p.name}
                        </p>
                        {configBadge ? (
                          <p className="text-[9px] text-[rgb(var(--p700))] leading-tight mt-0.5 line-clamp-1">
                            {configBadge}
                          </p>
                        ) : null}
                        <p className="text-primary-600 font-semibold text-xs mt-1 tabular-nums">
                          {productNeedsSaleConfiguration(p) ? 'Desde ' : ''}
                          {formatMoney(Number(p.sale_price))}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            {!loadingProducts && products.filter(p => p.active).length === 0 && (
              <div className="py-8 text-center text-stone-400 text-xs sm:text-sm">
                No hay productos con este filtro.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Columna derecha: carrito (solo landscape ancho) */}
      <div
        ref={desktopCartRef}
        className="pos-cart-sidebar md:w-80 lg:w-[22rem] md:min-h-0 md:h-full md:max-h-full md:flex-shrink-0 flex-col bg-white rounded-2xl shadow-sm border border-stone-200/80 overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          {renderCartHeader()}
        </div>
        <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain list-none m-0 p-0">
          {cart.length === 0 ? (
            <li className="flex flex-col items-center justify-center h-full min-h-[12rem] text-center py-10">
              <ShoppingCart size={28} className="text-gray-300 mb-2" />
              <p className="text-gray-400 text-sm">Carrito vacío</p>
            </li>
          ) : (
            renderCartLines()
          )}
        </ul>
        <div className="p-3 border-t border-gray-100 space-y-2 shrink-0 bg-white">
          <button
            type="button"
            onClick={() => setManualProductOpen(true)}
            className="w-full inline-flex items-center justify-center gap-1 py-2 border border-amber-300 bg-amber-50 text-amber-900 rounded-xl text-xs font-semibold hover:bg-amber-100"
          >
            <Plus size={14} /> Producto manual
          </button>
        {cart.length > 0 && (
          <>
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
            <div className="flex justify-between font-bold text-gray-800"><span>Total</span><span>{formatMoney(displayCartTotal)}</span></div>
            <button
              type="button"
              onClick={openCheckout}
              disabled={branchSeriesMissing}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50"
            >
              Cobrar <ChevronRight size={15} />
            </button>
          </>
        )}
        </div>
      </div>

      {/* Botón flotante de carrito (portrait / móvil) */}
      {floatingCartButton}

      <FlyToCartLayer />

      {/* Panel carrito móvil (bottom sheet) */}
      <PosMobileCartDrawer
        open={cartModalOpen}
        onClose={() => setCartModalOpen(false)}
        itemCount={cartCount}
        footer={
          <div className="p-3 sm:p-4 border-t border-gray-100 space-y-2 shrink-0 bg-white pb-[max(0.75rem,var(--safe-bottom))]">
            <button
              type="button"
              onClick={() => setManualProductOpen(true)}
              className="w-full inline-flex items-center justify-center gap-1 py-2.5 border border-amber-300 bg-amber-50 text-amber-900 rounded-xl text-xs font-semibold hover:bg-amber-100"
            >
              <Plus size={14} /> Producto manual
            </button>
            {cart.length > 0 && (
              <>
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
                <div className="flex justify-between font-bold text-gray-800 text-base">
                  <span>Total</span>
                  <span>{formatMoney(displayCartTotal)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCartModalOpen(false)
                    openCheckout()
                  }}
                  disabled={branchSeriesMissing}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50"
                >
                  Cobrar <ChevronRight size={15} />
                </button>
              </>
            )}
          </div>
        }
      >
        {cart.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-100 shrink-0 flex justify-end">
            <button
              type="button"
              onClick={emptyCart}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={13} />
              Vaciar
            </button>
          </div>
        )}
        <ul className="flex-1 min-h-[min(50dvh,22rem)] overflow-y-auto overscroll-contain list-none m-0 p-0">
          {cart.length === 0 ? (
            <li className="flex flex-col items-center justify-center text-center py-16 px-4">
              <ShoppingCart size={36} className="text-gray-300 mb-3" />
              <p className="text-gray-400 text-sm">Carrito vacío</p>
            </li>
          ) : (
            renderCartLines()
          )}
        </ul>
      </PosMobileCartDrawer>

      {/* Modal configurar producto (presentaciones, extras, series) */}
      <ProductConfigureModal
        product={productToConfigure}
        branchId={session?.branch_id ?? activeBranchId}
        onClose={() => setProductToConfigure(null)}
        onConfirm={handleConfigureConfirm}
      />

      <QuickContactCreateModal
        open={addClientModal}
        onClose={() => setAddClientModal(false)}
        stacked
        defaultDocType={isFacturaDocType(docType, selectedSeries?.sunat_code) ? '6' : '1'}
        onCreated={(contact) => {
          setContacts((prev) => [...prev, contact])
          setContactId(contact.id)
        }}
      />

      <POSCheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        loading={processing}
        rawTotal={rawSubtotalGlobal}
        payableTotal={payableTotal}
        discountMode={checkoutDiscountMode}
        discountValue={checkoutDiscountValue}
        onDiscountModeChange={setCheckoutDiscountMode}
        onDiscountValueChange={setCheckoutDiscountValue}
        igvAmount={taxGlobal}
        series={checkoutSeries}
        seriesId={seriesId}
        docType={docType}
        onSeriesChange={(id, dt) => {
          setSeriesId(id)
          setDocType(dt)
        }}
        contactId={effectiveContactId}
        contacts={contacts}
        onContactChange={setContactId}
        onAddContact={openAddClientModal}
        onPreferVariosContact={() => {
          const variosId = pickVariosContactId(contacts)
          if (variosId) setContactId(variosId)
        }}
        paymentMethods={checkoutPaymentMethods}
        payments={payments}
        onPaymentsChange={setPayments}
        onConfirm={handleCheckout}
        confirmDisabled={!checkoutContactIsValid(selectedContact, docType, selectedSeries?.sunat_code) || !seriesId}
        allowDiscount
        sunatEnabled={sunatEnabled}
        billingModule={billingModule}
        canFactura={canFactura}
      />

      {/* Modal de éxito con opciones de impresión */}
      <ReceiptPrintModal
        open={receiptModalOpen && !!successSale}
        onClose={() => { setReceiptModalOpen(false); setSuccessSale(null); setPrintData(null) }}
        printData={printData}
        saleId={successSale?.id}
        defaultEmail={successSale?.clientEmail ?? printData?.client?.email ?? ''}
        saleNumber={successSale ? (successSale.number?.includes('-') ? successSale.number : `${successSale.series}-${String(successSale.number).padStart(8, '0')}`) : undefined}
        total={successSale?.total}
        autoShowTicketOnWeb
      />

      <ManualProductModal
        open={manualProductOpen}
        onClose={() => setManualProductOpen(false)}
        onAdd={addManualToCart}
      />

      <BarcodeScannerModal
        open={barcodeScan.cameraScannerOpen}
        onClose={barcodeScan.closeScanner}
        onScan={barcodeScan.handleBarcodeScan}
        busy={barcodeScan.scanProcessing}
        title="Escanear producto"
        subtitle="Apunta al código de barras"
        footerHint="El producto se agregará al carrito al detectar el código"
      />

      <PosCategoriesModal
        open={categoriesModalOpen}
        onClose={() => setCategoriesModalOpen(false)}
        categories={categories}
        selectedCat={selectedCat}
        onSelect={setSelectedCat}
      />
    </div>
  )
}
