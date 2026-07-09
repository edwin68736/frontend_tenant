import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Trash2, X, Package, UserPlus, ScanBarcode, Pencil, Loader2, Wallet } from 'lucide-react'
import { salesService, type CreateSaleInput } from '@/services/sales.service'
import { contactsService, type Contact } from '@/services/contacts.service'
import { productsService, type Product } from '@/services/products.service'
import { companyService, type CompanyConfig } from '@/services/company.service'
import { BRAND_APP_LOGO } from '@/config/branding'
import { resolveCompanyLogoDisplayUrl } from '@/config/apiBaseUrl'
import { useAuth } from '@/contexts/AuthContext'
import { useBranch, useOnBranchChange } from '@/contexts/BranchContext'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { SearchableSelect } from '@/components/SearchableSelect'
import { ReceiptPrintModal } from '@/components/ui/ReceiptPrintModal'
import { QuickContactCreateModal } from '@/components/contacts/QuickContactCreateModal'
import { ProductPickerModal } from '@/components/sales/ProductPickerModal'
import { PaymentMethodSelect } from '@/components/sales/PaymentMethodSelect'
import { SalePaymentConditionSection } from '@/components/sales/SalePaymentConditionSection'
import { ProductConfigureModal, productNeedsSaleConfiguration } from '@/components/pos/ProductConfigureModal'
import { MoneyAmountInput } from '@/components/pos/MoneyAmountInput'
import { TenantCompanyEditModal } from '@/components/sales/TenantCompanyEditModal'
import { SaleReceiptPreviewModal } from '@/components/sales/SaleReceiptPreviewModal'
import {
  catalogLineModifiersJson,
  createCatalogCartLine,
  type CatalogCartLine,
} from '@/utils/posCart'
import { formatModifierLines, parseStoredModifiers } from '@/utils/productModifiers'
import {
  SaleAdditionalInfoDrawer,
  emptySaleFiscalForm,
  type SaleFiscalFormState,
} from '@/components/sales/SaleAdditionalInfoDrawer'
import { SaleTermsConditionsControl } from '@/components/sales/SaleTermsConditionsControl'
import { usersService, type TenantUser } from '@/services/users.service'
import { buildFiscalReferences, hasFiscalContextContent, previewIgvRetention, validateIgvRetentionAtSave } from '@/utils/fiscalRetention'
import { formatSaleMoney, saleCurrencySymbol } from '@/utils/formatMoney'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { catalogsService, type DetraccionGood } from '@/services/catalogs.service'
import { previewDetraccion, DETRACCION_PAYMENT_METHOD_CODE, DETRACCION_PAYMENT_METHOD_NAME } from '@/utils/fiscalDetraction'
import { filterOperationalPaymentMethods } from '@/utils/operationalPaymentMethods'
import {
  formatTipoDocIdentidadDisplay,
  SALES_OPERATION_TYPE_OPTIONS,
  SUNAT_TIPO_OPERACION_DETRACCION,
  SUNAT_TIPO_OPERACION_VENTA_INTERNA,
} from '@/constants/sunat'
import {
  applyPrepaymentDeductionToTotals,
  inferPrepaymentAffectationGroup,
  inferPrepaymentRelatedDocType,
  saleDeductibleBaseForGroup,
  validatePrepaymentItems,
  type PrepaymentAffectationGroup,
  type PrepaymentDeductionRow,
} from '@/utils/fiscalPrepayment'
import { usePrepaymentConfig } from '@/hooks/usePrepaymentConfig'
import { PrepaymentEmitSummary } from '@/components/prepayment/PrepaymentEmitSummary'
import type { PrintData } from '@/types/printData'
import { getTipoComprobanteLabel } from '@/constants/sunat'
import { SUNAT_MAX_MONTO_CLIENTE_SIN_RUC, SUNAT_RUC_LENGTH } from '@/constants/sunat'
import { cashbankService, type BankAccount, type CashSession, type PaymentMethodRecord } from '@/services/cashbank.service'
import { calcSaleCheckout } from '@/utils/saleEngine'
import { calcItem, calcItemWithSubtotalDiscount, getAfectacionGroup, type SunatAfectacionGroup } from '@/utils/taxCalc'
import { clampIssueDatePeru, getMaxIssueDatePeru, getMinIssueDatePeru, getTodayPeru, isIssueDateAllowed } from '@/utils/datesPeru'
import { normalizeSunatUnit, sunatUnitSelectOptions } from '@/constants/sunatUnits'
import { PRODUCT_IGV_AFFECTATION_OPTIONS } from '@/constants/igvAffectation'
import type { CheckoutDiscountMode } from '@/utils/checkoutDiscount'
import { roundSunat, calcPaymentChange, sumMoney } from '@/utils/money'
import { quotationsService } from '@/services/quotations.service'
import { useBarcodeProductScanner } from '@/hooks/useBarcodeProductScanner'
import { BarcodeScannerModal } from '@/components/barcode/BarcodeScannerModal'
import {
  buildSalePreviewPrintData,
  validateSalePreviewInput,
  type SalePreviewSeries,
} from '@/utils/salePreviewPrintData'
import {
  type CreditInstallmentDraft,
  type CreditInstallmentMode,
  type PaymentConditionCode,
  roundMoney,
  splitIntoInstallments,
  sumInstallmentAmounts,
} from '@/utils/saleCreditPayment'

/** Tipo de serie de venta (desde API). */
type SeriesRow = SalePreviewSeries & { id: number; doc_type: string; branch_id?: number }

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
  line_discount_mode?: CheckoutDiscountMode
  line_discount_value?: number
  /** Solo para productos con series; no usado en registro avanzado por defecto */
  serials?: string[]
  /** Clave de fusión cuando el mismo producto tiene distinta configuración */
  line_key?: string
  modifiers_json?: string
  item_note?: string
}

const PER_PAGE = 10
const IGV_AFFECTATION_OPTIONS = PRODUCT_IGV_AFFECTATION_OPTIONS

type ManualItemDraft = Omit<SaleFormItem, 'product_id' | 'serials'>

const INITIAL_MANUAL_ITEM_DRAFT: ManualItemDraft = {
  code: 'MANUAL',
  description: '',
  unit: 'NIU',
  quantity: 1,
  unit_price: 0,
  igv_affectation_type: '10',
  price_includes_igv: true,
}

function docTypeToSunatCode(docType: string): string {
  const u = (docType || '').toUpperCase()
  if (u.includes('NOTA') && u.includes('VENTA')) return '00'
  if (u === 'BOLETA') return '03'
  if (u === 'FACTURA') return '01'
  return ''
}

export type SalesRegisterMode = 'nota-venta' | 'comprobante' | 'quotation'

function seriesCategoryForMode(mode: SalesRegisterMode): string {
  return mode === 'quotation' ? 'cotizacion' : 'venta'
}

function codesForMode(mode: SalesRegisterMode, billingOk: boolean): string[] {
  if (mode === 'quotation') return ['QT']
  if (mode === 'nota-venta') return ['00']
  if (!billingOk) return []
  return ['03', '01']
}

function defaultCodeForMode(mode: SalesRegisterMode): string {
  if (mode === 'quotation') return 'QT'
  return mode === 'nota-venta' ? '00' : '03'
}

function resolveCashMethodCode(methods: PaymentMethodRecord[]): string {
  const cash = methods.find(
    (m) => m.code === 'cash' || String(m.destination_type ?? '').toLowerCase() === 'cash',
  )
  return cash?.code ?? methods[0]?.code ?? 'cash'
}

function catalogLineToSaleItem(line: CatalogCartLine): SaleFormItem {
  const p = line.product
  return {
    product_id: p.id,
    line_key: line.configureKey,
    code: p.code ?? '',
    description: p.name,
    unit: normalizeSunatUnit(p.unit ?? '', p.type ?? 'product'),
    quantity: line.quantity,
    unit_price: line.unit_price,
    igv_affectation_type: p.igv_affectation_type ?? '10',
    price_includes_igv: p.price_includes_igv ?? true,
    modifiers_json: catalogLineModifiersJson(line),
    item_note: line.notes?.trim() || undefined,
    serials: line.serials,
  }
}

function saleItemFromProduct(p: Product): SaleFormItem {
  return catalogLineToSaleItem(createCatalogCartLine(p))
}

function saleItemMergeKey(it: SaleFormItem): string {
  return it.line_key ?? `pid-${it.product_id ?? 'manual'}-${it.code}-${it.unit_price}`
}

type SalesRegisterPageProps = { mode?: SalesRegisterMode; quotationId?: number }

export default function SalesRegisterPage({ mode = 'comprobante', quotationId }: SalesRegisterPageProps) {
  return (
    <RequireModule moduleKey="sales">
      <SalesRegisterContent mode={mode} quotationId={quotationId} />
    </RequireModule>
  )
}

function SalesRegisterContent({ mode, quotationId }: { mode: SalesRegisterMode; quotationId?: number }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromQuotationParam = searchParams.get('from_quotation')
  const fromQuotationId =
    fromQuotationParam && Number.isFinite(Number(fromQuotationParam)) ? Number(fromQuotationParam) : null
  const isNotaVenta = mode === 'nota-venta'
  const isQuotation = mode === 'quotation'
  const editingQuotationId = isQuotation && quotationId && quotationId > 0 ? quotationId : null
  const linkQuotationId = fromQuotationId ?? null
  const { user, hasModule } = useAuth()
  const { activeBranchId, activeBranch } = useBranch()
  const [series, setSeries] = useState<SeriesRow[]>([])
  const [customers, setCustomers] = useState<Contact[]>([])
  const [taxRate, setTaxRate] = useState(18)
  const [taxConfig, setTaxConfig] = useState<{ taxRate: number; igvRegime?: string; taxBenefitZone?: boolean }>({ taxRate: 18 })
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [productToConfigure, setProductToConfigure] = useState<Product | null>(null)
  const [showManualItemModal, setShowManualItemModal] = useState(false)
  const [form, setForm] = useState<{
    branch_id: number
    contact_id: number | null
    sunat_code: string
    series_id: number | null
    issue_date: string
    due_date: string
    currency: string
    operation_type_code: string
    exchange_rate: string
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
    operation_type_code: SUNAT_TIPO_OPERACION_VENTA_INTERNA,
    exchange_rate: '',
    payment_method: 'efectivo',
    notes: '',
  })
  const [items, setItems] = useState<SaleFormItem[]>([])
  const [lastAddedProductId, setLastAddedProductId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sunatEnabled, setSunatEnabled] = useState(true)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRecord[]>([])
  const [payments, setPayments] = useState<{ method: string; amount: string; reference: string }[]>([
    { method: 'cash', amount: '0.00', reference: '' },
  ])
  const [paymentConditionCode, setPaymentConditionCode] = useState<PaymentConditionCode>('cash')
  const [creditMode, setCreditMode] = useState<CreditInstallmentMode>('single')
  const [installmentCount, setInstallmentCount] = useState(3)
  const [creditFirstDueDate, setCreditFirstDueDate] = useState(getTodayPeru())
  const [creditInstallments, setCreditInstallments] = useState<CreditInstallmentDraft[]>([])
  const [cashSession, setCashSession] = useState<CashSession | null>(null)
  const [openingCash, setOpeningCash] = useState(false)
  const [cashOpeningBalance, setCashOpeningBalance] = useState(0)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [printData, setPrintData] = useState<PrintData | null>(null)
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [lastSale, setLastSale] = useState<{ id: number; number: string; total: number } | null>(null)
  const [addClientOpen, setAddClientOpen] = useState(false)
  const [companyConfig, setCompanyConfig] = useState<CompanyConfig | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [companyEditOpen, setCompanyEditOpen] = useState(false)
  const [previewPrintData, setPreviewPrintData] = useState<PrintData | null>(null)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [discountMode, setDiscountMode] = useState<CheckoutDiscountMode>('percent')
  const [discountValue, setDiscountValue] = useState(0)
  const [fiscalDrawerOpen, setFiscalDrawerOpen] = useState(false)
  const [fiscalForm, setFiscalForm] = useState<SaleFiscalFormState>(() => {
    let sellerId: number | null = null
    try {
      const raw = localStorage.getItem('user')
      if (raw) {
        const parsed = JSON.parse(raw) as { id?: number }
        if (typeof parsed.id === 'number') sellerId = parsed.id
      }
    } catch {
      /* ignore */
    }
    return emptySaleFiscalForm(sellerId)
  })
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([])
  const [detraccionGoods, setDetraccionGoods] = useState<DetraccionGood[]>([])
  const [detraccionGoodCode, setDetraccionGoodCode] = useState('')
  const [emitPrepayment, setEmitPrepayment] = useState(false)
  const [deductPrepayment, setDeductPrepayment] = useState(false)
  const [prepaymentDeductionRows, setPrepaymentDeductionRows] = useState<PrepaymentDeductionRow[]>([])
  const [prepaymentAffectationGroup, setPrepaymentAffectationGroup] =
    useState<PrepaymentAffectationGroup>('gravado')

  const {
    loading: tcLoading,
    error: tcError,
    exchangeRate: tcAutoRate,
    isFallback: tcIsFallback,
    meta: tcMeta,
  } = useExchangeRate(form.issue_date, { enabled: !isQuotation })

  const isDetraccion = form.operation_type_code === SUNAT_TIPO_OPERACION_DETRACCION
  const isPrepaymentEmit = emitPrepayment
  const prepaymentDeductionBase = useMemo(
    () => prepaymentDeductionRows.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0),
    [prepaymentDeductionRows],
  )
  const isPrepaymentDeduct =
    deductPrepayment && prepaymentDeductionRows.some((r) => r.source_sale_id && r.amount > 0)
  const prepaymentConfigQuery = usePrepaymentConfig(!isNotaVenta && !isQuotation)
  const prepaymentConfig = prepaymentConfigQuery.config

  const parsedExchangeRate = useMemo(() => {
    const n = parseFloat(form.exchange_rate.replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? n : null
  }, [form.exchange_rate])

  const moneySym = saleCurrencySymbol(form.currency)
  const fmt = (n: number) => formatSaleMoney(n, form.currency)

  useEffect(() => {
    if (!tcAutoRate || isQuotation) return
    setForm((f) => (f.exchange_rate === tcAutoRate ? f : { ...f, exchange_rate: tcAutoRate }))
  }, [tcAutoRate, isQuotation])

  useEffect(() => {
    if (!user?.id) return
    setFiscalForm((f) => (f.seller_user_id == null ? { ...f, seller_user_id: user.id } : f))
  }, [user?.id])

  useEffect(() => {
    if (isNotaVenta || isQuotation) return
    catalogsService.detraccionGoods().then(setDetraccionGoods).catch(() => {})
  }, [isNotaVenta, isQuotation])

  useEffect(() => {
    if (form.sunat_code !== '01' && form.operation_type_code === SUNAT_TIPO_OPERACION_DETRACCION) {
      setForm((f) => ({ ...f, operation_type_code: SUNAT_TIPO_OPERACION_VENTA_INTERNA }))
      setDetraccionGoodCode('')
    }
  }, [form.sunat_code, form.operation_type_code])

  useEffect(() => {
    if (!emitPrepayment) return
    const inferred = inferPrepaymentAffectationGroup(items)
    if (inferred) setPrepaymentAffectationGroup(inferred)
  }, [emitPrepayment, items])

  useEffect(() => {
    if (isDetraccion) {
      setEmitPrepayment(false)
      setDeductPrepayment(false)
      setPrepaymentDeductionRows([])
    }
  }, [isDetraccion])

  useEffect(() => {
    if (isDetraccion && form.currency !== 'PEN') {
      setForm((f) => ({ ...f, currency: 'PEN' }))
    }
  }, [isDetraccion, form.currency])

  useEffect(() => {
    const seriesCategory = seriesCategoryForMode(mode)
    Promise.all([
      companyService.getConfig(),
      companyService.listSeries({ branch_id: activeBranchId, category: seriesCategory }),
      companyService.getSunat(),
      contactsService.list('', 'customer'),
      contactsService.getDefault(),
      cashbankService.listPaymentMethods(),
      cashbankService.getOpenSession(activeBranchId || undefined),
      usersService.listUsers().catch(() => []),
      cashbankService.listBankAccounts(true).catch(() => [] as BankAccount[]),
    ])
      .then(([company, seriesList, sunat, customerList, defaultClient, methods, session, users, banks]) => {
        setCompanyConfig(company ?? null)
        setBankAccounts(Array.isArray(banks) ? banks : [])
        // Preferencia global de empresa (no solo la venta actual).
        if (!editingQuotationId) {
          setFiscalForm((prev) => ({
            ...prev,
            show_terms_conditions: Boolean(company?.show_terms_conditions),
          }))
        }
        setCashSession(session)
        setTenantUsers(Array.isArray(users) ? users : [])
        setSunatEnabled(sunat?.sunat_enabled ?? true)
        const ventaSeries = (seriesList ?? []) as SeriesRow[]
        setSeries(ventaSeries)
        setTaxRate(sunat?.tax_rate ?? 18)
        setTaxConfig({ taxRate: sunat?.tax_rate ?? 18, igvRegime: sunat?.igv_regime, taxBenefitZone: sunat?.tax_benefit_zone })
        setCustomers(Array.isArray(customerList) ? customerList : [])
        const billingOk = hasModule('billing') && (sunat?.sunat_enabled ?? true)
        const modeCodes = codesForMode(mode, billingOk)
        const availableCodes = isQuotation
          ? ventaSeries.map((s) => (s.sunat_code ?? '').trim() || 'QT').filter(Boolean)
          : [
              ...new Set(
                ventaSeries
                  .map((s) => (s.sunat_code ?? '').trim() || docTypeToSunatCode(s.doc_type))
                  .filter((c) => c && modeCodes.includes(c)),
              ),
            ]
        let defaultCode = defaultCodeForMode(mode)
        if (!availableCodes.includes(defaultCode)) defaultCode = availableCodes[0] ?? defaultCode
        const matchSeries = isQuotation
          ? ventaSeries[0]
          : ventaSeries.find(
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
            prev.length === 1
              ? [{ method: cashCode, amount: prev[0].amount || '0.00', reference: prev[0].reference ?? '' }]
              : prev,
          )
        }
      })
      .catch(() => toast.error('Error cargando datos'))
      .finally(() => setLoading(false))
  }, [hasModule, mode, activeBranchId])

  useOnBranchChange(() => {
    setLoading(true)
    setItems([])
    setDiscountValue(0)
    setDiscountMode('percent')
    setForm((f) => ({ ...f, branch_id: activeBranchId }))
    const seriesCategory = seriesCategoryForMode(mode)
    Promise.all([
      companyService.listSeries({ branch_id: activeBranchId, category: seriesCategory }),
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
            prev.length === 1
              ? [{ method: cashCode, amount: prev[0].amount || '0.00', reference: prev[0].reference ?? '' }]
              : prev,
          )
        }
        const billingOk = hasModule('billing') && (sunat?.sunat_enabled ?? true)
        const modeCodes = codesForMode(mode, billingOk)
        const availableCodes = isQuotation
          ? ventaSeries.map((s) => (s.sunat_code ?? '').trim() || 'QT').filter(Boolean)
          : [
              ...new Set(
                ventaSeries
                  .map((s) => (s.sunat_code ?? '').trim() || docTypeToSunatCode(s.doc_type))
                  .filter((c) => c && modeCodes.includes(c)),
              ),
            ]
        let defaultCode = defaultCodeForMode(mode)
        if (!availableCodes.includes(defaultCode)) defaultCode = availableCodes[0] ?? defaultCode
        const matchSeries = isQuotation
          ? ventaSeries[0]
          : ventaSeries.find(
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

  const applyQuotationPrefill = (qId: number) => {
    quotationsService
      .get(qId)
      .then((detail) => {
        const q = detail.quotation
        if (q.status === 'converted') {
          toast.error('Esta cotización ya fue convertida')
          return
        }
        const issueYmd = clampIssueDatePeru((q.issue_date ?? '').slice(0, 10) || getTodayPeru())
        const validYmd = q.valid_until ? String(q.valid_until).slice(0, 10) : issueYmd
        setForm((f) => ({
          ...f,
          contact_id: q.contact_id ?? f.contact_id,
          issue_date: issueYmd || f.issue_date,
          due_date: isQuotation ? validYmd : f.due_date,
          currency: q.currency || f.currency,
          exchange_rate: q.exchange_rate != null ? String(q.exchange_rate) : f.exchange_rate,
          notes: q.notes || '',
          series_id: isQuotation ? q.series_id : f.series_id,
        }))
        if (isQuotation) {
          setFiscalForm((prev) => ({
            ...prev,
            show_terms_conditions: Boolean(q.show_terms_conditions),
          }))
        }
        setItems(
          (detail.items ?? []).map((it) => ({
            product_id: it.product_id ?? null,
            code: it.code || '',
            description: it.description,
            unit: it.unit || 'NIU',
            quantity: it.quantity,
            unit_price: it.unit_price,
            igv_affectation_type: it.igv_affectation_type || '10',
            price_includes_igv: it.price_includes_igv ?? true,
          })),
        )
        if (linkQuotationId) {
          toast.success(`Cotización ${q.number} cargada — puede modificar ítems antes de registrar la venta`)
        }
      })
      .catch(() => toast.error('No se pudo cargar la cotización'))
  }

  useEffect(() => {
    const qId = editingQuotationId ?? linkQuotationId
    if (!qId || loading) return
    applyQuotationPrefill(qId)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefill once after initial load
  }, [editingQuotationId, linkQuotationId, loading])

  const billingOk = hasModule('billing') && sunatEnabled
  const seriesFiltered = isQuotation
    ? series
    : series.filter(
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

  const appendSaleItem = (item: SaleFormItem) => {
    const key = saleItemMergeKey(item)
    setItems(prev => {
      const existing = prev.find(it => saleItemMergeKey(it) === key)
      if (existing) {
        return prev.map(it =>
          saleItemMergeKey(it) === key ? { ...it, quantity: it.quantity + item.quantity } : it,
        )
      }
      return [...prev, item]
    })
    if (item.product_id != null) {
      setLastAddedProductId(item.product_id)
    }
    toast.success(`"${item.description}" agregado`)
  }

  const cartProductIds = useMemo(
    () => [...new Set(items.map((it) => it.product_id).filter((id): id is number => id != null))],
    [items],
  )

  const pickerLastAddedProductId =
    lastAddedProductId != null && cartProductIds.includes(lastAddedProductId)
      ? lastAddedProductId
      : null

  const addProductToItems = (p: Product) => {
    if (productNeedsSaleConfiguration(p)) {
      setShowProductPicker(false)
      setProductToConfigure(p)
      toast.message(`Configura «${p.name}» antes de agregarlo`, { duration: 3500 })
      return
    }
    appendSaleItem(saleItemFromProduct(p))
  }

  const handleSaleConfigureConfirm = (line: CatalogCartLine) => {
    appendSaleItem(catalogLineToSaleItem(line))
    setProductToConfigure(null)
  }

  const barcodeScan = useBarcodeProductScanner({
    branchId: activeBranchId,
    onProductFound: addProductToItems,
    showSuccessToast: false,
  })

  const addManualItem = (draft: ManualItemDraft) => {
    const description = draft.description.trim()
    if (!description) {
      toast.error('Ingrese la descripción del ítem')
      return
    }
    if (draft.quantity <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }
    setItems(prev => [
      ...prev,
      {
        product_id: null,
        code: draft.code.trim() || 'MANUAL',
        description,
        unit: normalizeSunatUnit(draft.unit, 'product'),
        quantity: Math.max(1, Math.floor(draft.quantity)),
        unit_price: Math.max(0, draft.unit_price),
        igv_affectation_type: draft.igv_affectation_type,
        price_includes_igv: draft.price_includes_igv,
      },
    ])
    toast.success(`"${description}" agregado`)
    setShowManualItemModal(false)
  }

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona una imagen (PNG, JPG, etc.)')
      return
    }
    setUploadingLogo(true)
    companyService
      .uploadLogo(file)
      .then(res => {
        const logo_url = res.logo_url ?? res.data?.logo_url ?? ''
        if (res.data) {
          setCompanyConfig({ ...res.data, logo_url: logo_url || res.data.logo_url })
        } else if (logo_url) {
          setCompanyConfig(prev => (prev ? { ...prev, logo_url } : prev))
        }
        toast.success('Logo actualizado')
      })
      .catch((err: { response?: { data?: { error?: string } } }) => {
        toast.error(err.response?.data?.error ?? 'Error al guardar el logo')
      })
      .finally(() => {
        setUploadingLogo(false)
        if (logoInputRef.current) logoInputRef.current.value = ''
      })
  }

  const updateItem = (idx: number, field: keyof SaleFormItem, value: string | number | boolean) => {
    setItems(prev => prev.map((it, i) => (i !== idx ? it : { ...it, [field]: value })))
  }

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const saleCalc = useMemo(
    () =>
      calcSaleCheckout({
        lines: items.map((it) => ({
          unitPrice: it.unit_price,
          quantity: it.quantity,
          igvAffectationType: it.igv_affectation_type,
          priceIncludesIgv: it.price_includes_igv,
          lineDiscountMode: it.line_discount_mode,
          lineDiscountValue: it.line_discount_value,
        })),
        globalDiscountMode: discountMode,
        globalDiscountValue: discountValue,
        taxRate,
        taxConfig,
      }),
    [items, discountMode, discountValue, taxRate, taxConfig],
  )

  const lineDiscountTotal = useMemo(
    () => roundSunat(saleCalc.lines.reduce((s, l) => s + l.lineDiscountSubtotal, 0)),
    [saleCalc],
  )
  const checkoutDiscountAmount = saleCalc.globalDiscountAmount
  const subtotalGlobal = saleCalc.subtotal
  const taxGlobal = saleCalc.taxAmount
  const totalGlobal = saleCalc.total

  const getItemTotals = (_it: SaleFormItem, idx: number) => {
    const l = saleCalc.lines[idx]
    return { subtotal: l?.subtotal ?? 0, taxAmount: l?.taxAmount ?? 0, total: l?.total ?? 0 }
  }

  /** Totales por tipo de afectación SUNAT (gravado, exonerado, inafecto, exportación). */
  const totalsByAfectacion = items.reduce(
    (acc, it, idx) => {
      const { subtotal, taxAmount, total } = getItemTotals(it, idx)
      const group = getAfectacionGroup(it.igv_affectation_type)
      acc[group].subtotal += subtotal
      acc[group].taxAmount += taxAmount
      acc[group].total += total
      return acc
    },
    { gravado: { subtotal: 0, taxAmount: 0, total: 0 }, exonerado: { subtotal: 0, taxAmount: 0, total: 0 }, inafecto: { subtotal: 0, taxAmount: 0, total: 0 }, exportacion: { subtotal: 0, taxAmount: 0, total: 0 } } as Record<SunatAfectacionGroup, { subtotal: number; taxAmount: number; total: number }>
  )

  const prepaymentAdjustedTotals = useMemo(() => {
    if (!isPrepaymentDeduct || prepaymentDeductionBase <= 0) return null
    return applyPrepaymentDeductionToTotals({
      group: prepaymentAffectationGroup,
      gravadoSubtotal: totalsByAfectacion.gravado.subtotal,
      gravadoTax: totalsByAfectacion.gravado.taxAmount,
      exoneradoSubtotal: totalsByAfectacion.exonerado.subtotal,
      inafectoSubtotal: totalsByAfectacion.inafecto.subtotal,
      subtotal: subtotalGlobal,
      taxAmount: taxGlobal,
      total: totalGlobal,
      deductionBase: prepaymentDeductionBase,
      taxRate,
    })
  }, [
    isPrepaymentDeduct,
    prepaymentDeductionBase,
    prepaymentAffectationGroup,
    totalsByAfectacion,
    subtotalGlobal,
    taxGlobal,
    totalGlobal,
    taxRate,
  ])

  const checkoutSubtotal = prepaymentAdjustedTotals?.subtotal ?? subtotalGlobal
  const checkoutTax = prepaymentAdjustedTotals?.taxAmount ?? taxGlobal
  const checkoutTotal = prepaymentAdjustedTotals?.total ?? totalGlobal
  const prepaymentDeductionTotal = prepaymentAdjustedTotals?.deductionTotal ?? 0
  const prepaymentPayableTotal = Math.max(0, checkoutTotal)
  const prepaymentCoversAll = isPrepaymentDeduct && prepaymentPayableTotal <= 0.009
  const saleDeductibleBase = saleDeductibleBaseForGroup(prepaymentAffectationGroup, totalsByAfectacion)

  const selectedContact = form.contact_id ? customers.find(c => c.id === form.contact_id!) : null

  const retentionPreview = previewIgvRetention(
    fiscalForm.has_igv_retention && !isDetraccion,
    form.sunat_code,
    selectedContact ?? null,
    checkoutTotal,
    fiscalForm.igv_retention_manual_override,
    form.currency,
    parsedExchangeRate,
  )

  const selectedGood = detraccionGoods.find((g) => g.code === detraccionGoodCode)
  const detractionBnAccount = companyConfig?.detraction_bn_account?.trim() ?? ''
  const detractionPreview = previewDetraccion({
    sunatCode: form.sunat_code,
    operationTypeCode: form.operation_type_code,
    currency: form.currency,
    gravadoTotal: totalsByAfectacion.gravado.total,
    saleTotal: totalGlobal,
    goodCode: detraccionGoodCode,
    goodRatePercent: selectedGood?.rate_percent ?? 0,
    minAmountPen: selectedGood?.min_amount_pen ?? 700,
    bankAccount: detractionBnAccount,
    contactEsPercepcion: selectedContact?.es_agente_de_percepcion,
  })

  const issueDateMin = getMinIssueDatePeru()
  const issueDateMax = getMaxIssueDatePeru()

  const handleIssueDateChange = (raw: string) => {
    const newIssue = clampIssueDatePeru(raw)
    setForm((f) => ({
      ...f,
      issue_date: newIssue,
      due_date: f.due_date === f.issue_date ? newIssue : f.due_date,
    }))
  }

  const directPaymentMethods = useMemo(() => filterOperationalPaymentMethods(paymentMethods), [paymentMethods])

  const directPayableTarget =
    isDetraccion && detractionPreview.applicable
      ? detractionPreview.netPayable
      : !isNotaVenta && fiscalForm.has_igv_retention && retentionPreview.applicable
        ? retentionPreview.netCollectible
        : isPrepaymentDeduct
          ? prepaymentPayableTotal
          : totalGlobal

  const paymentsTotalPaid = useMemo(
    () => sumMoney(...payments.map(p => Number(p.amount) || 0)),
    [payments],
  )

  const paymentChange = useMemo(
    () => calcPaymentChange(paymentsTotalPaid, directPayableTarget),
    [paymentsTotalPaid, directPayableTarget],
  )

  const creditAmount = useMemo(
    () => roundMoney(Math.max(0, directPayableTarget - paymentsTotalPaid)),
    [directPayableTarget, paymentsTotalPaid],
  )

  useEffect(() => {
    if (paymentConditionCode !== 'credit') return
    if (creditAmount <= 0) {
      setCreditInstallments([])
      return
    }
    if (!creditFirstDueDate?.trim()) return
    if (creditMode === 'monthly') {
      setCreditInstallments(splitIntoInstallments(creditAmount, installmentCount, creditFirstDueDate))
    } else {
      setCreditInstallments([{ due_date: creditFirstDueDate, amount: creditAmount.toFixed(2) }])
    }
  }, [paymentConditionCode, creditMode, installmentCount, creditAmount, creditFirstDueDate])

  const handlePaymentConditionChange = (code: PaymentConditionCode) => {
    setPaymentConditionCode(code)
    if (code === 'credit' && payments.length === 1 && paymentsTotalPaid >= directPayableTarget - 0.01) {
      setPayments(prev => prev.map((p, i) => (i === 0 ? { ...p, amount: '0.00' } : p)))
    }
  }

  const documentDueDate =
    !isQuotation && paymentConditionCode === 'credit' && creditInstallments.length > 0
      ? creditInstallments[creditInstallments.length - 1].due_date
      : form.due_date

  // Un solo método de pago directo: el monto sigue al neto cobrable (1001) o al total (contado).
  useEffect(() => {
    if (paymentConditionCode !== 'cash') return
    if (payments.length !== 1) return
    const formatted = directPayableTarget.toFixed(2)
    setPayments((prev) => {
      if (prev.length !== 1 || prev[0].amount === formatted) return prev
      return [{ ...prev[0], amount: formatted }]
    })
  }, [directPayableTarget, payments.length, paymentConditionCode])

  useEffect(() => {
    if (!prepaymentCoversAll) return
    if (paymentConditionCode !== 'cash') setPaymentConditionCode('cash')
  }, [prepaymentCoversAll, paymentConditionCode])

  const operationTypeOptions = useMemo(() => {
    if (form.sunat_code === '01') return SALES_OPERATION_TYPE_OPTIONS
    return SALES_OPERATION_TYPE_OPTIONS.filter((o) => o.code === SUNAT_TIPO_OPERACION_VENTA_INTERNA)
  }, [form.sunat_code])

  const buildFiscalPayload = () => ({
    has_igv_retention: fiscalForm.has_igv_retention,
    igv_retention_manual_override: fiscalForm.igv_retention_manual_override,
    show_terms_conditions: fiscalForm.show_terms_conditions,
    fiscal_observations: fiscalForm.fiscal_observations.trim() || undefined,
    purchase_order_number: fiscalForm.purchase_order_number.trim() || undefined,
    seller_user_id: fiscalForm.seller_user_id ?? undefined,
    references: buildFiscalReferences(fiscalForm),
  })

  const selectedSeries = useMemo(
    () => series.find((s) => s.id === form.series_id) ?? null,
    [series, form.series_id],
  )

  const sellerName = useMemo(() => {
    const id = fiscalForm.seller_user_id
    if (id) {
      const u = tenantUsers.find((tu) => tu.id === id)
      if (u?.name?.trim()) return u.name.trim()
    }
    return user?.name?.trim() || undefined
  }, [fiscalForm.seller_user_id, tenantUsers, user?.name])

  const buildSalePreviewInput = () => ({
    mode,
    form: {
      sunat_code: form.sunat_code,
      series_id: form.series_id,
      issue_date: form.issue_date,
      due_date: form.due_date,
      currency: form.currency,
      operation_type_code: form.operation_type_code,
      exchange_rate: parsedExchangeRate,
      notes: form.notes,
    },
    items,
    saleCalc,
    subtotalGlobal: prepaymentAdjustedTotals?.subtotal ?? subtotalGlobal,
    taxGlobal: prepaymentAdjustedTotals?.taxAmount ?? taxGlobal,
    totalGlobal: prepaymentAdjustedTotals?.total ?? totalGlobal,
    lineDiscountTotal,
    checkoutDiscountAmount,
    selectedSeries,
    selectedContact: selectedContact ?? null,
    companyConfig,
    branchName: activeBranch?.name ?? 'Principal',
    payments,
    fiscalForm,
    isNotaVenta,
    isDetraccion,
    detractionPreview,
    detraccionGoodCode,
    detraccionGoodLabel: selectedGood?.description,
    detractionBnAccount,
    retentionPreview,
    sellerName,
    paymentConditionCode,
    creditInstallments:
      paymentConditionCode === 'credit'
        ? creditInstallments.map(r => ({ due_date: r.due_date, amount: r.amount }))
        : undefined,
    bankAccounts,
    isPrepaymentEmit,
    prepaymentConfig,
    prepaymentAffectationGroup,
    prepaymentDeduction:
      isPrepaymentDeduct && prepaymentDeductionTotal > 0
        ? {
            total: prepaymentDeductionTotal,
            rows: prepaymentDeductionRows
              .filter((r) => r.source_sale_id && r.document_number && r.total > 0)
              .map((r) => ({
                document_number: r.document_number,
                related_doc_type: inferPrepaymentRelatedDocType(r.document_number),
                amount: r.amount,
                total: r.total,
              })),
          }
        : undefined,
  })

  const handleSalePreview = async () => {
    const input = buildSalePreviewInput()
    const err = validateSalePreviewInput(input)
    if (err) {
      toast.error(err)
      return
    }
    setPreviewLoading(true)
    try {
      setPreviewPrintData(buildSalePreviewPrintData(input))
      setPreviewModalOpen(true)
    } catch (e) {
      console.error(e)
      toast.error('No se pudo generar la previsualización')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleOpenCashSession = async () => {
    if (!activeBranchId) {
      toast.error('No hay sucursal activa')
      return
    }
    setOpeningCash(true)
    try {
      const sess = await cashbankService.openSession({
        branch_id: activeBranchId,
        opening_balance: cashOpeningBalance,
      })
      setCashSession(sess)
      toast.success('Caja abierta. Ya puede registrar ventas.')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'No se pudo abrir la caja')
    } finally {
      setOpeningCash(false)
    }
  }

  const handleSave = async () => {
    if (!activeBranchId) {
      toast.error('No hay sucursal activa')
      return
    }
    if (!isQuotation && !cashSession?.id) {
      toast.error('Debe abrir una sesión de caja antes de registrar ventas')
      return
    }
    if (!form.contact_id) {
      toast.error(
        isQuotation
          ? 'Seleccione un cliente para la cotización'
          : 'Toda venta debe tener un cliente. Configure el cliente por defecto (doc. 0, número 99999999) en Contactos.',
      )
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
    for (const it of items) {
      if (!it.description.trim()) {
        toast.error('Todos los ítems deben tener descripción')
        return
      }
    }

    if (!isIssueDateAllowed(form.issue_date)) {
      toast.error('La fecha de emisión debe ser hoy o hasta 3 días anteriores (hora Perú).')
      return
    }

    if (isQuotation) {
      setSaving(true)
      try {
        const payload = {
          branch_id: activeBranchId,
          contact_id: form.contact_id || null,
          series_id: form.series_id!,
          issue_date: form.issue_date,
          valid_until: form.due_date || undefined,
          currency: form.currency,
          exchange_rate: form.currency === 'USD' ? parsedExchangeRate ?? undefined : undefined,
          notes: form.notes || undefined,
          show_terms_conditions: fiscalForm.show_terms_conditions,
          items: items.map((it, idx) => ({
            product_id: it.product_id ?? null,
            code: it.code,
            description: it.description.trim(),
            unit: it.unit,
            quantity: it.quantity,
            unit_price: it.unit_price,
            discount: saleCalc.lines[idx]?.storedDiscount ?? 0,
            igv_affectation_type: it.igv_affectation_type,
            price_includes_igv: it.price_includes_igv,
            modifiers_json: it.modifiers_json ?? '',
            serials: it.serials ?? [],
          })),
        }
        let result
        if (editingQuotationId) {
          result = await quotationsService.update(editingQuotationId, payload)
          toast.success('Cotización actualizada')
        } else {
          result = await quotationsService.create(payload)
          toast.success('Cotización registrada')
        }
        setPrintData(result.print_data ?? null)
        setLastSale({
          id: result.quotation.id,
          number: result.quotation.number,
          total: result.quotation.total,
        })
        setReceiptModalOpen(true)
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        toast.error(msg ?? 'Error al guardar cotización')
      } finally {
        setSaving(false)
      }
      return
    }

    const sunatCode = form.sunat_code
    if (sunatCode === '01') {
      if (!selectedContact) {
        toast.error('Factura (01) requiere cliente con RUC')
        return
      }
      if (selectedContact.es_agente_de_percepcion && form.operation_type_code === SUNAT_TIPO_OPERACION_DETRACCION) {
        toast.error('No se permite detracción con cliente agente de percepción')
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

    const validPayments = payments.filter(p => Number(p.amount) > 0)
    const totalPaid = validPayments.reduce((s, p) => s + Number(p.amount), 0)
    const requiredDirect =
      isDetraccion && detractionPreview.applicable
        ? detractionPreview.netPayable
        : !isNotaVenta && fiscalForm.has_igv_retention && retentionPreview.applicable
          ? retentionPreview.netCollectible
          : isPrepaymentDeduct
            ? prepaymentPayableTotal
            : checkoutTotal
    const noPaymentRequired = requiredDirect <= 0.009

    if (paymentConditionCode === 'cash') {
      if (!noPaymentRequired) {
        if (validPayments.length === 0) {
          toast.error('Ingrese al menos un método de pago')
          return
        }
        if (totalPaid < requiredDirect - 0.01) {
          toast.error(
            isDetraccion && detractionPreview.applicable
              ? 'Los pagos directos no cubren el neto cobrable'
              : 'El total de pagos no cubre el monto de la venta',
          )
          return
        }
      }
    } else {
      if (noPaymentRequired) {
        toast.error('El total está cubierto por anticipos. Use condición de pago al contado.')
        return
      }
      const creditBalance = roundMoney(Math.max(0, requiredDirect - totalPaid))
      if (creditBalance <= 0.009) {
        toast.error('El saldo a crédito debe ser mayor a cero. Reduzca el anticipo o elija contado.')
        return
      }
      if (creditInstallments.length === 0) {
        toast.error('Indique la fecha de vencimiento de la(s) cuota(s)')
        return
      }
      for (const row of creditInstallments) {
        if (!row.due_date?.trim()) {
          toast.error('Todas las cuotas deben tener fecha de vencimiento')
          return
        }
      }
      const instSum = sumInstallmentAmounts(creditInstallments)
      if (Math.abs(instSum - creditBalance) > 0.02) {
        toast.error('Las cuotas deben igualar el saldo a crédito')
        return
      }
    }
    if (isDetraccion) {
      if (!detractionPreview.applicable) {
        toast.error(detractionPreview.reason || 'Verifique los datos de detracción')
        return
      }
    }
    if (isPrepaymentEmit) {
      const prepErr = validatePrepaymentItems(prepaymentAffectationGroup, items)
      if (prepErr) {
        toast.error(prepErr)
        return
      }
      if (isDetraccion) {
        toast.error('No se puede combinar anticipo con detracción')
        return
      }
    }
    if (isPrepaymentDeduct) {
      const prepErr = validatePrepaymentItems(prepaymentAffectationGroup, items)
      if (prepErr) {
        toast.error(prepErr)
        return
      }
      if (isDetraccion) {
        toast.error('No se puede combinar deducción de anticipos con detracción')
        return
      }
      if (!form.contact_id) {
        toast.error('Seleccione un cliente para deducir anticipos')
        return
      }
      if (prepaymentDeductionTotal > totalGlobal + 0.02) {
        toast.error('El anticipo deducido no puede superar el total de la venta')
        return
      }
      if (prepaymentDeductionBase > saleDeductibleBase + 0.02) {
        toast.error('El monto base deducido supera el total de la venta')
        return
      }
    }
    if (!isNotaVenta && !isDetraccion && fiscalForm.has_igv_retention) {
      const retentionErr = validateIgvRetentionAtSave(
        fiscalForm.has_igv_retention,
        form.sunat_code,
        selectedContact ?? null,
        totalGlobal,
        fiscalForm.igv_retention_manual_override,
        form.currency,
        parsedExchangeRate,
      )
      if (retentionErr) {
        toast.error(retentionErr)
        return
      }
    }

    setSaving(true)
    try {
      let notes = isNotaVenta ? form.notes.trim() : ''
      if (linkQuotationId) {
        const refNote = `(Desde cotización #${linkQuotationId})`
        notes = notes ? `${notes} ${refNote}` : refNote
      }
      const payload: CreateSaleInput = {
        branch_id: activeBranchId,
        contact_id: form.contact_id || null,
        doc_type: series.find(s => s.id === form.series_id)?.doc_type ?? 'BOLETA',
        series_id: form.series_id,
        currency: form.currency,
        operation_type_code: form.operation_type_code,
        exchange_rate: form.currency === 'USD' ? parsedExchangeRate ?? undefined : undefined,
        cash_session_id: cashSession?.id ?? null,
        issue_date: form.issue_date,
        due_date:
          paymentConditionCode === 'credit' && creditInstallments.length > 0
            ? creditInstallments[creditInstallments.length - 1].due_date
            : form.due_date,
        payment_condition_code: paymentConditionCode,
        credit_installments:
          paymentConditionCode === 'credit'
            ? creditInstallments.map(r => ({
                due_date: r.due_date,
                amount: Number(r.amount),
              }))
            : undefined,
        payments: validPayments.map((p) => ({
          method: p.method,
          amount: Number(p.amount),
          reference: p.reference.trim() || undefined,
        })),
        notes: notes || undefined,
        from_quotation_id: linkQuotationId ?? undefined,
        fiscal_context: !isDetraccion && hasFiscalContextContent(fiscalForm) ? buildFiscalPayload() : undefined,
        detraccion: isDetraccion && detraccionGoodCode
          ? { good_code: detraccionGoodCode }
          : undefined,
        prepayment: isPrepaymentEmit
          ? { emit: true, affectation_group: prepaymentAffectationGroup }
          : isPrepaymentDeduct
            ? {
                affectation_group: prepaymentAffectationGroup,
                deductions: prepaymentDeductionRows
                  .filter((r) => r.source_sale_id && r.amount > 0)
                  .map((r) => ({ source_sale_id: r.source_sale_id!, amount: r.amount })),
              }
            : undefined,
        global_discount_mode: discountValue > 0 ? discountMode : undefined,
        global_discount_value: discountValue > 0 ? discountValue : undefined,
        items: items.map((it) => ({
          product_id: it.product_id ?? null,
          code: it.code,
          description: it.description.trim(),
          unit: it.unit,
          quantity: it.quantity,
          unit_price: it.unit_price,
          line_discount_mode: (it.line_discount_value ?? 0) > 0 ? (it.line_discount_mode ?? 'amount') : undefined,
          line_discount_value: (it.line_discount_value ?? 0) > 0 ? it.line_discount_value : undefined,
          igv_affectation_type: it.igv_affectation_type,
          price_includes_igv: it.price_includes_igv,
          modifiers_json: it.modifiers_json ?? '',
          serials: it.serials ?? [],
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

  if (!isNotaVenta && !isQuotation && !billingOk) {
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

  if (!isNotaVenta && !isQuotation && tipoOptions.length === 0) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 text-center space-y-4">
        <h2 className="text-lg font-bold text-gray-800">Nuevo comprobante</h2>
        <p className="text-sm text-gray-600">
          No hay series de boleta o factura para esta sucursal. Configúrelas en Empresa → Series.
        </p>
      </div>
    )
  }

  if (isQuotation && series.length === 0) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 text-center space-y-4">
        <h2 className="text-lg font-bold text-gray-800">Nueva cotización</h2>
        <p className="text-sm text-gray-600">
          No hay series de cotización para esta sucursal. Configúrelas en Empresa → Series (categoría cotización).
        </p>
        <Link
          to="/company/series"
          className="inline-flex px-5 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
        >
          Ir a series
        </Link>
        <Link
          to="/quotations"
          className="inline-flex px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
        >
          Volver al listado
        </Link>
      </div>
    )
  }

  const companyDisplayName = (companyConfig?.trade_name || companyConfig?.business_name || '').trim()
  const companyContactLine = [companyConfig?.email?.trim(), companyConfig?.phone?.trim()].filter(Boolean).join(' - ')
  const companyLogoSrc = resolveCompanyLogoDisplayUrl(companyConfig?.logo_url)

  /** Preferencia de empresa: aplica a ventas futuras hasta que se desactive. */
  const handleShowTermsPreferenceChange = (checked: boolean) => {
    setFiscalForm((prev) => ({ ...prev, show_terms_conditions: checked }))
    setCompanyConfig((c) => (c ? { ...c, show_terms_conditions: checked } : c))
    void companyService
      .updateConfig({ show_terms_conditions: checked })
      .catch(() => {
        toast.error('No se pudo guardar la preferencia de términos y condiciones')
        setFiscalForm((prev) => ({ ...prev, show_terms_conditions: !checked }))
        setCompanyConfig((c) => (c ? { ...c, show_terms_conditions: !checked } : c))
      })
  }
  const headerLogoSrc = companyLogoSrc || BRAND_APP_LOGO

  return (
    <div className="space-y-4 relative">
      {!isQuotation && !cashSession && !loading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Wallet size={18} className="text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Caja cerrada</p>
              <p className="text-xs text-amber-800 mt-0.5">
                Debe abrir su sesión de caja para registrar ventas (incluye administrador).
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="text-xs text-amber-900 flex items-center gap-1.5">
              Saldo inicial
              <input
                type="number"
                min={0}
                step={0.01}
                className="w-24 border border-amber-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                value={cashOpeningBalance}
                onChange={(e) => setCashOpeningBalance(Number(e.target.value) || 0)}
              />
            </label>
            <button
              type="button"
              onClick={() => void handleOpenCashSession()}
              disabled={openingCash || !activeBranchId}
              className="px-4 py-2 bg-amber-700 text-white rounded-xl text-sm font-medium hover:bg-amber-800 disabled:opacity-50"
            >
              {openingCash ? 'Abriendo…' : 'Abrir caja'}
            </button>
            <Link to="/cashbank/cash" className="text-xs text-amber-800 underline hover:text-amber-950">
              Ir a Caja
            </Link>
          </div>
        </div>
      )}
      {linkQuotationId && !isQuotation && (
        <div className="rounded-xl border border-[rgb(var(--p200))] bg-[rgb(var(--p50))] px-4 py-3 text-sm text-[rgb(var(--p800))]">
          Cotización #{linkQuotationId} precargada — puede agregar o quitar productos antes de registrar la venta.
        </div>
      )}
      {!isNotaVenta && !isQuotation && (
        <SaleAdditionalInfoDrawer
          open={fiscalDrawerOpen}
          onOpenChange={setFiscalDrawerOpen}
          value={fiscalForm}
          onChange={setFiscalForm}
          sunatCode={form.sunat_code}
          saleTotal={checkoutTotal}
          currency={form.currency}
          exchangeRate={parsedExchangeRate}
          contact={selectedContact ?? null}
          users={tenantUsers}
          disabled={saving}
          termsText={companyConfig?.terms_and_conditions ?? ''}
          onTermsSaved={(terms) =>
            setCompanyConfig((c) => (c ? { ...c, terms_and_conditions: terms } : c))
          }
          onShowTermsChange={handleShowTermsPreferenceChange}
          prepayment={
            form.sunat_code === '01' || form.sunat_code === '03'
              ? {
                  emit: emitPrepayment,
                  onEmitChange: (checked) => {
                    setEmitPrepayment(checked)
                    if (checked) {
                      setDeductPrepayment(false)
                      setPrepaymentDeductionRows([])
                      setDetraccionGoodCode('')
                    }
                  },
                  affectationGroup: prepaymentAffectationGroup,
                  onAffectationGroupChange: setPrepaymentAffectationGroup,
                  config: prepaymentConfig,
                  configLoading: prepaymentConfigQuery.loading,
                  configError: prepaymentConfigQuery.error,
                  items,
                  sunatCode: form.sunat_code,
                  total: checkoutTotal,
                  currency: form.currency,
                  disabled: saving || isDetraccion || deductPrepayment,
                  formatMoney: fmt,
                }
              : undefined
          }
          prepaymentDeduction={
            form.sunat_code === '01' || form.sunat_code === '03'
              ? {
                  deduct: deductPrepayment,
                  onDeductChange: (checked) => {
                    setDeductPrepayment(checked)
                    if (checked) {
                      setEmitPrepayment(false)
                      setDetraccionGoodCode('')
                      const inferred = inferPrepaymentAffectationGroup(items)
                      if (inferred) setPrepaymentAffectationGroup(inferred)
                    } else {
                      setPrepaymentDeductionRows([])
                    }
                  },
                  affectationGroup: prepaymentAffectationGroup,
                  onAffectationGroupChange: (group) => {
                    setPrepaymentAffectationGroup(group)
                    setPrepaymentDeductionRows([])
                  },
                  rows: prepaymentDeductionRows,
                  onRowsChange: setPrepaymentDeductionRows,
                  config: prepaymentConfig,
                  contactId: form.contact_id,
                  items,
                  saleAfectacionTotals: totalsByAfectacion,
                  taxRate,
                  disabled: saving || isDetraccion || emitPrepayment,
                  formatMoney: fmt,
                }
              : undefined
          }
        />
      )}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 space-y-5">
        {/* Cabecera: logo + empresa (izq.) y fechas en fila (der.) */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between pb-4 border-b border-gray-100">
          <div className="flex items-start gap-5 min-w-0">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoFile}
            />
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
              className="relative shrink-0 rounded-lg p-0.5 hover:ring-2 hover:ring-[rgb(var(--p300))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--p400))] disabled:opacity-60"
              title="Clic para cambiar el logo de la empresa"
            >
              <img
                key={companyConfig?.logo_url ?? 'default-logo'}
                src={headerLogoSrc}
                alt="Logo empresa"
                className="h-11 w-auto max-w-[7.5rem] object-contain"
                decoding="async"
              />
              {uploadingLogo && (
                <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70">
                  <span className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                </span>
              )}
            </button>
            <div className="min-w-0 text-left pt-0.5">
              {companyDisplayName ? (
                <p className="text-sm font-bold text-gray-900 uppercase leading-snug">{companyDisplayName}</p>
              ) : null}
              {companyConfig?.address?.trim() ? (
                <p className="text-xs text-gray-600 mt-0.5 leading-snug">{companyConfig.address.trim()}</p>
              ) : null}
              <div className="mt-0.5 flex items-center gap-1 min-w-0">
                {companyContactLine ? (
                  <p className="text-xs text-gray-500 leading-snug min-w-0">{companyContactLine}</p>
                ) : (
                  <p className="text-xs text-gray-400 leading-snug">Sin teléfono / correo</p>
                )}
                <button
                  type="button"
                  onClick={() => setCompanyEditOpen(true)}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                  title="Editar datos de la empresa"
                  aria-label="Editar datos de la empresa"
                >
                  <Pencil size={14} strokeWidth={2.25} />
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-1 shrink-0 sm:ml-4">
            <div className="flex flex-row flex-wrap items-end gap-3">
              <div className="w-[9.5rem]">
                <label className="block text-xs font-medium text-gray-600 mb-1">Fec. Emisión</label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-sm"
                  value={form.issue_date}
                  min={issueDateMin}
                  max={issueDateMax}
                  title={`Entre ${issueDateMin} y ${issueDateMax} (hora Perú)`}
                  onChange={(e) => handleIssueDateChange(e.target.value)}
                />
              </div>
              <div className="w-[9.5rem]">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {isQuotation ? 'Vigencia hasta' : paymentConditionCode === 'credit' ? 'Vencimiento doc.' : 'Fec. Vencimiento'}
                </label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-sm"
                  value={documentDueDate}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  disabled={!isQuotation && paymentConditionCode === 'credit'}
                  title={
                    !isQuotation && paymentConditionCode === 'credit'
                      ? 'Para crédito, configure las fechas en Condición de pago'
                      : undefined
                  }
                />
              </div>
            </div>
            {form.sunat_code === '01' && (
              <p className="text-[10px] text-gray-500 text-right">Para factura se envía a SUNAT (cbc:DueDate).</p>
            )}
          </div>
        </header>

        {/* Documento y condiciones comerciales */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo comprobante</label>
            {isNotaVenta ? (
              <div className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-700">
                {getTipoComprobanteLabel('00')}
              </div>
            ) : isQuotation ? (
              <div className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-700">
                Cotización
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
          <div className={isNotaVenta || isQuotation ? 'lg:col-span-8' : 'lg:col-span-2'}>
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
          {!isNotaVenta && !isQuotation && (
            <div className="lg:col-span-6">
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo operación</label>
              <select
                className={`w-full border border-gray-200 rounded-xl px-3 py-2 text-sm ${form.sunat_code !== '01' ? 'bg-gray-50' : ''}`}
                value={form.operation_type_code}
                disabled={form.sunat_code !== '01'}
                onChange={(e) => {
                  const code = e.target.value
                  setForm((f) => ({
                    ...f,
                    operation_type_code: code,
                    currency: code === SUNAT_TIPO_OPERACION_DETRACCION ? 'PEN' : f.currency,
                  }))
                  if (code !== SUNAT_TIPO_OPERACION_DETRACCION) setDetraccionGoodCode('')
                  if (code === SUNAT_TIPO_OPERACION_DETRACCION) setEmitPrepayment(false)
                }}
              >
                {operationTypeOptions.map((op) => (
                  <option key={op.code} value={op.code}>
                    {op.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Cliente, moneda y tipo de cambio */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          <div
            className={
              isQuotation
                ? 'sm:col-span-2 lg:col-span-8'
                : isNotaVenta
                  ? 'sm:col-span-2 lg:col-span-5'
                  : 'sm:col-span-2 lg:col-span-7'
            }
          >
            <label className="block text-xs font-medium text-gray-600 mb-1">Cliente *</label>
            <div className="flex gap-2 items-stretch">
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
                className="shrink-0 inline-flex items-center justify-center rounded-xl border border-gray-200 px-3 py-2 text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] min-h-[42px]"
                title="Nuevo cliente"
                aria-label="Nuevo cliente"
              >
                <UserPlus size={18} />
              </button>
            </div>
          </div>
          {!isQuotation && (
            <>
              <div className="lg:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Moneda</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={form.currency}
                  disabled={isDetraccion}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                >
                  <option value="PEN">Soles (PEN)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </div>
              <div className={isNotaVenta ? 'lg:col-span-2' : 'lg:col-span-3'}>
                <label
                  className="block text-xs font-medium text-gray-600 mb-1"
                  title="TC SUNAT venta del día de emisión (USD/PEN)"
                >
                  Tipo de cambio
                  {form.currency === 'PEN' && (
                    <span className="font-normal text-gray-400 ml-1">(referencial)</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    className={`w-full border border-gray-200 rounded-xl px-3 py-2 text-sm ${
                      form.currency === 'PEN' ? 'bg-gray-50 text-gray-700 cursor-default' : ''
                    }`}
                    value={form.exchange_rate}
                    placeholder={tcLoading ? 'Consultando…' : 'Ej. 3.388'}
                    readOnly={form.currency === 'PEN'}
                    disabled={tcLoading}
                    onChange={(e) => {
                      if (form.currency === 'USD') {
                        setForm((f) => ({ ...f, exchange_rate: e.target.value }))
                      }
                    }}
                  />
                  {tcLoading && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
                {form.currency === 'USD' && tcError && (
                  <p className="text-[10px] text-amber-700 mt-0.5">
                    {tcError} Ingréselo manualmente si es necesario.
                  </p>
                )}
                {form.currency === 'PEN' && tcError && !tcLoading && (
                  <p className="text-[10px] text-gray-400 mt-0.5">{tcError}</p>
                )}
                {tcIsFallback && !tcLoading && (
                  <p className="text-[10px] text-amber-800/90 mt-1 leading-snug">
                    {tcMeta?.mensaje ??
                      'Se está utilizando el tipo de cambio de un día anterior porque SUNAT aún no publica el correspondiente al día de hoy. El valor puede modificarse manualmente antes de guardar el documento.'}
                  </p>
                )}
              </div>
            </>
          )}

          {(isQuotation || isNotaVenta) && (
            <div className={isQuotation ? 'sm:col-span-2 lg:col-span-4' : 'sm:col-span-2 lg:col-span-3'}>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                placeholder="Opcional"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          )}
        </div>

        {isDetraccion && !isNotaVenta && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
            <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">Detracción SUNAT (1001)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Bien / servicio (Cat. 54) *</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                  value={detraccionGoodCode}
                  onChange={(e) => setDetraccionGoodCode(e.target.value)}
                >
                  <option value="">Seleccionar...</option>
                  {detraccionGoods.map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.code} — {g.description} ({g.rate_percent}%)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Porcentaje</label>
                <input
                  readOnly
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 tabular-nums"
                  value={selectedGood ? `${selectedGood.rate_percent}%` : '—'}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Cuenta BN (emisor)</label>
                {detractionBnAccount ? (
                  <input
                    readOnly
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 font-mono"
                    value={detractionBnAccount}
                    title="Configurada en Empresa → SUNAT / IGV"
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-amber-300 bg-white px-3 py-2.5 text-sm">
                    <p className="text-amber-900">Sin configurar</p>
                    <Link
                      to="/ajustes"
                      state={{ erpSettingsTab: 'empresa', erpCompanyTab: 'impuestos' }}
                      className="mt-1 inline-block text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline"
                    >
                      Configurar cuenta de detracción en SUNAT / IGV →
                    </Link>
                  </div>
                )}
              </div>
            </div>
            {detractionPreview.reason && !detractionPreview.applicable && (
              <p className="text-xs text-amber-800">{detractionPreview.reason}</p>
            )}
            {detractionPreview.applicable && (
              <div className="flex flex-wrap gap-4 text-sm text-amber-950">
                <span>
                  Detracción: <strong className="tabular-nums">{fmt(detractionPreview.detractionAmount)}</strong>
                </span>
                <span>
                  Neto a cobrar: <strong className="tabular-nums text-emerald-800">{fmt(detractionPreview.netPayable)}</strong>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Detalle de ítems */}
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
              onClick={() => setShowManualItemModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50 shrink-0"
            >
              <Package size={14} /> Producto manual
            </button>
            <button
              type="button"
              onClick={barcodeScan.toggleScannerMode}
              disabled={barcodeScan.scanProcessing}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium shrink-0 disabled:opacity-60 ${
                barcodeScan.scannerMode
                  ? 'border-primary-400 bg-[rgb(var(--p50))] text-[rgb(var(--p700))]'
                  : 'border-primary-300 text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))]'
              }`}
              title={
                barcodeScan.scannerMode
                  ? 'Desactivar escáner'
                  : 'Activar escáner de código de barras'
              }
            >
              <ScanBarcode size={14} /> {barcodeScan.scannerMode ? 'Escáner activo' : 'Escanear'}
            </button>
            <p className="text-xs text-gray-500 ml-auto">Total de ítems: {items.length}</p>
          </div>

          {barcodeScan.scannerMode && !barcodeScan.useCameraBarcodeScanner && (
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Código de barras
              </label>
              <div className="relative flex items-center">
                <ScanBarcode
                  size={16}
                  className="absolute left-3 text-[rgb(var(--p600))] pointer-events-none"
                  aria-hidden
                />
                <input
                  ref={barcodeScan.searchInputRef}
                  type="text"
                  value={barcodeScan.scanQuery}
                  onChange={e => barcodeScan.setScanQuery(e.target.value)}
                  onKeyDown={barcodeScan.handleSearchKeyDown}
                  disabled={barcodeScan.scanProcessing}
                  placeholder="Pegue o escanee el código y presione Enter"
                  className="w-full rounded-xl border border-primary-300 bg-[rgb(var(--p50))]/40 py-2 pl-9 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--p500))]/30 focus:border-primary-400 disabled:opacity-60"
                  autoComplete="off"
                  autoFocus
                />
                {barcodeScan.scanProcessing && (
                  <div
                    className="absolute right-3 h-4 w-4 border-2 border-[rgb(var(--p600))] border-t-transparent rounded-full animate-spin"
                    aria-hidden
                  />
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Escanee con lector USB o pegue el código y presione Enter.
              </p>
            </div>
          )}
          {barcodeScan.scannerMode && barcodeScan.useCameraBarcodeScanner && (
            <p className="mb-3 text-xs text-primary-700 bg-primary-50 border border-primary-200 rounded-xl px-3 py-2">
              Cámara activa — apunta al código de barras del producto.
            </p>
          )}

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
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[9%]">Desc.</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase w-[10%]">Total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const { total } = getItemTotals(it, idx)
                  const modifierLines = it.modifiers_json
                    ? formatModifierLines(parseStoredModifiers(it.modifiers_json))
                    : []
                  return (
                    <tr key={it.line_key ?? idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5">
                        <span className="text-gray-800">{it.description || '—'}</span>
                        {modifierLines.map((mLine) => (
                          <span key={mLine} className="block text-[11px] text-[rgb(var(--p700))] mt-0.5">
                            {mLine}
                          </span>
                        ))}
                        {it.item_note ? (
                          <span className="block text-[11px] text-gray-500 italic mt-0.5">Nota: {it.item_note}</span>
                        ) : null}
                        {it.serials?.length ? (
                          <span className="block text-[11px] text-gray-500 font-mono mt-0.5">
                            Serie: {it.serials.join(', ')}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-gray-600">{it.code || '—'}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-gray-700">{it.unit}</span>
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
                        <MoneyAmountInput
                          className="w-full max-w-[5.5rem] border border-gray-200 rounded-lg px-2 py-1 text-sm"
                          value={it.unit_price}
                          onChange={(v) => updateItem(idx, 'unit_price', Math.max(0, v))}
                          clearOnFocus
                          emptyWhenZero
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-gray-700">
                          {IGV_AFFECTATION_OPTIONS.find(o => o.code === it.igv_affectation_type)?.label ?? it.igv_affectation_type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-gray-700">{it.price_includes_igv ? 'Sí' : 'No'}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white max-w-[6.5rem]">
                          <button
                            type="button"
                            className={`w-7 shrink-0 border-r border-gray-200 text-[10px] font-bold text-white ${
                              (it.line_discount_mode ?? 'amount') === 'percent' ? 'bg-[rgb(var(--p600))]' : 'bg-gray-500'
                            }`}
                            onClick={() =>
                              updateItem(idx, 'line_discount_mode', (it.line_discount_mode ?? 'amount') === 'percent' ? 'amount' : 'percent')
                            }
                          >
                            {(it.line_discount_mode ?? 'amount') === 'percent' ? '%' : moneySym}
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={(it.line_discount_mode ?? 'amount') === 'percent' ? 100 : undefined}
                            step={(it.line_discount_mode ?? 'amount') === 'percent' ? 1 : 0.01}
                            className="min-w-0 flex-1 bg-transparent px-1.5 py-1 text-xs text-gray-800 focus:outline-none w-12"
                            value={it.line_discount_value || ''}
                            onChange={(e) => {
                              const n = Math.max(0, Number(e.target.value) || 0)
                              updateItem(
                                idx,
                                'line_discount_value',
                                (it.line_discount_mode ?? 'amount') === 'percent' ? Math.min(100, n) : n,
                              )
                            }}
                            placeholder="0"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-gray-700 text-right tabular-nums">{fmt(total)}</td>
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

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
            {!isQuotation && (
              <div className="md:col-span-3 min-w-0 border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  {isDetraccion && detractionPreview.applicable
                    ? 'Pagos directos'
                    : paymentConditionCode === 'credit'
                      ? 'Anticipo / pagos parciales'
                      : 'Métodos de pago'}
                </p>
                {payments.map((p, idx) => (
                  <div key={idx} className="flex flex-wrap gap-2 items-center">
                    <PaymentMethodSelect
                      methods={directPaymentMethods}
                      value={p.method}
                      onChange={(code) =>
                        setPayments((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, method: code } : x)),
                        )
                      }
                      className="relative flex-1 min-w-[8rem]"
                    />
                    <input
                      type="text"
                      placeholder="Referencia (opc.)"
                      title="N° transferencia, depósito, voucher…"
                      className="flex-1 min-w-[7rem] border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                      value={p.reference}
                      onChange={(e) =>
                        setPayments((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, reference: e.target.value } : x)),
                        )
                      }
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="Monto"
                      className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums bg-white shrink-0"
                      value={p.amount}
                      onChange={(e) =>
                        setPayments((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)),
                        )
                      }
                    />
                    {payments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPayments((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-red-500 hover:text-red-700 p-1 shrink-0"
                        aria-label="Quitar pago"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setPayments((prev) => [
                      ...prev,
                      { method: directPaymentMethods[0]?.code ?? 'cash', amount: '', reference: '' },
                    ])
                  }
                  className="text-xs text-[rgb(var(--p600))] hover:underline"
                >
                  + Agregar pago
                </button>
                <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2.5 space-y-1.5">
                  {prepaymentCoversAll && (
                    <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-2">
                      Cubierto por anticipos. No requiere pago adicional del cliente.
                    </p>
                  )}
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Monto a pagar</span>
                    <span className="font-semibold text-gray-800 tabular-nums">{fmt(directPayableTarget)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Suma de pagos</span>
                    <span className="font-semibold text-gray-800 tabular-nums">{fmt(paymentsTotalPaid)}</span>
                  </div>
                  {paymentChange > 0.009 && (
                    <div className="flex justify-between items-center rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-900">
                      <span className="text-xs font-bold uppercase tracking-wide">Vuelto</span>
                      <span className="text-sm font-bold tabular-nums">{fmt(paymentChange)}</span>
                    </div>
                  )}
                  {paymentConditionCode === 'cash' &&
                    paymentsTotalPaid > 0 &&
                    paymentsTotalPaid < directPayableTarget - 0.01 && (
                    <p className="text-[11px] text-red-600">
                      Falta {fmt(Math.max(0, directPayableTarget - paymentsTotalPaid))}
                    </p>
                  )}
                  {paymentConditionCode === 'credit' && creditAmount > 0.009 && (
                    <p className="text-[11px] text-[rgb(var(--p700))]">
                      Anticipo {fmt(paymentsTotalPaid)} · Saldo a crédito {fmt(creditAmount)}
                    </p>
                  )}
                </div>
                {isDetraccion && detractionPreview.applicable && (
                  <div className="flex flex-wrap gap-2 items-center rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
                    <span className="flex-1 min-w-[7rem] text-sm text-amber-900 font-medium">
                      {DETRACCION_PAYMENT_METHOD_NAME}
                    </span>
                    <span className="text-sm tabular-nums text-amber-900 font-semibold">
                      {fmt(detractionPreview.detractionAmount)}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-amber-700/80 w-full">
                      Registro automático · sin impacto en caja
                    </span>
                  </div>
                )}
                {isNotaVenta && (
                  <div className="pt-2 border-t border-gray-100">
                    <SaleTermsConditionsControl
                      checked={fiscalForm.show_terms_conditions}
                      onCheckedChange={handleShowTermsPreferenceChange}
                      termsText={companyConfig?.terms_and_conditions ?? ''}
                      onTermsSaved={(terms) =>
                        setCompanyConfig((c) => (c ? { ...c, terms_and_conditions: terms } : c))
                      }
                      disabled={saving}
                    />
                  </div>
                )}
              </div>
            )}

            {isQuotation && (
              <div className="md:col-span-3 min-w-0 border border-gray-200 rounded-xl p-4 bg-white">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">
                  Opciones del documento
                </p>
                <SaleTermsConditionsControl
                  checked={fiscalForm.show_terms_conditions}
                  onCheckedChange={handleShowTermsPreferenceChange}
                  termsText={companyConfig?.terms_and_conditions ?? ''}
                  onTermsSaved={(terms) =>
                    setCompanyConfig((c) => (c ? { ...c, terms_and_conditions: terms } : c))
                  }
                  disabled={saving}
                />
              </div>
            )}

            <div
              className={`min-w-0 border border-gray-200 rounded-xl p-4 space-y-4 bg-gray-50/40 ${
                isQuotation ? 'md:col-span-2 md:col-start-4' : 'md:col-span-2'
              }`}
            >
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descuento</label>
                <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <button
                    type="button"
                    className={`w-9 shrink-0 border-r border-gray-200 text-xs font-bold text-white ${
                      discountMode === 'percent' ? 'bg-[rgb(var(--p600))]' : 'bg-gray-500'
                    }`}
                    onClick={() => setDiscountMode((m) => (m === 'percent' ? 'amount' : 'percent'))}
                  >
                    {discountMode === 'percent' ? '%' : moneySym}
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={discountMode === 'percent' ? 100 : undefined}
                    step={discountMode === 'percent' ? 1 : 0.01}
                    className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-sm text-gray-800 focus:outline-none"
                    value={discountValue || ''}
                    onChange={(e) => {
                      const n = Math.max(0, Number(e.target.value) || 0)
                      setDiscountValue(discountMode === 'percent' ? Math.min(100, n) : n)
                    }}
                    placeholder={discountMode === 'percent' ? '0' : '0.00'}
                  />
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {(lineDiscountTotal > 0 || checkoutDiscountAmount > 0) ? (
                  <>
                    <div className="flex justify-between text-gray-600 uppercase text-xs tracking-wide">
                      <span>Subtotal</span>
                      <span className="tabular-nums">{fmt(subtotalGlobal)}</span>
                    </div>
                    {lineDiscountTotal > 0 && (
                      <div className="flex justify-between text-amber-800 text-xs">
                        <span>Desc. por línea</span>
                        <span className="tabular-nums">− {fmt(lineDiscountTotal)}</span>
                      </div>
                    )}
                    {checkoutDiscountAmount > 0 && (
                      <div className="flex justify-between text-amber-800 text-xs">
                        <span>Desc. global</span>
                        <span className="tabular-nums">− {fmt(checkoutDiscountAmount)}</span>
                      </div>
                    )}
                    {totalsByAfectacion.exonerado.total > 0 && (
                      <div className="flex justify-between text-gray-600 text-xs">
                        <span>Op. exonerada</span>
                        <span>{fmt(totalsByAfectacion.exonerado.subtotal)}</span>
                      </div>
                    )}
                    {totalsByAfectacion.inafecto.total > 0 && (
                      <div className="flex justify-between text-gray-600 text-xs">
                        <span>Op. inafecta</span>
                        <span>{fmt(totalsByAfectacion.inafecto.subtotal)}</span>
                      </div>
                    )}
                    {totalsByAfectacion.exportacion.total > 0 && (
                      <div className="flex justify-between text-gray-600 text-xs">
                        <span>Op. exportación</span>
                        <span className="tabular-nums">{fmt(totalsByAfectacion.exportacion.subtotal)}</span>
                      </div>
                    )}
                    {taxGlobal > 0.000001 && (
                      <div className="flex justify-between text-gray-600 uppercase text-xs tracking-wide">
                        <span>IGV</span>
                        <span className="tabular-nums">{fmt(taxGlobal)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {totalsByAfectacion.gravado.total > 0 && (
                      <>
                        <div className="flex justify-between text-gray-600 uppercase text-xs tracking-wide">
                          <span>Op. gravada</span>
                          <span className="tabular-nums">{fmt(totalsByAfectacion.gravado.subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-gray-600 uppercase text-xs tracking-wide">
                          <span>IGV</span>
                          <span className="tabular-nums">{fmt(totalsByAfectacion.gravado.taxAmount)}</span>
                        </div>
                      </>
                    )}
                    {totalsByAfectacion.exonerado.total > 0 && (
                      <div className="flex justify-between text-gray-600 text-xs">
                        <span>Op. exonerada</span>
                        <span>{fmt(totalsByAfectacion.exonerado.total)}</span>
                      </div>
                    )}
                    {totalsByAfectacion.inafecto.total > 0 && (
                      <div className="flex justify-between text-gray-600 text-xs">
                        <span>Op. inafecta</span>
                        <span>{fmt(totalsByAfectacion.inafecto.total)}</span>
                      </div>
                    )}
                    {totalsByAfectacion.exportacion.total > 0 && (
                      <div className="flex justify-between text-gray-600 text-xs">
                        <span>Op. exportación</span>
                        <span className="tabular-nums">{fmt(totalsByAfectacion.exportacion.total)}</span>
                      </div>
                    )}
                    {totalsByAfectacion.gravado.total === 0 &&
                      totalsByAfectacion.exonerado.total === 0 &&
                      totalsByAfectacion.inafecto.total === 0 &&
                      totalsByAfectacion.exportacion.total === 0 &&
                      items.length > 0 && (
                      <>
                        <div className="flex justify-between text-gray-600 uppercase text-xs tracking-wide">
                          <span>Subtotal</span>
                          <span className="tabular-nums">{fmt(subtotalGlobal)}</span>
                        </div>
                        {taxGlobal > 0 && (
                          <div className="flex justify-between text-gray-600 uppercase text-xs tracking-wide">
                            <span>IGV</span>
                            <span className="tabular-nums">{fmt(taxGlobal)}</span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
                <div className="flex justify-between items-baseline font-bold text-gray-900 text-sm pt-2 mt-1 border-t border-gray-200">
                  <span className="uppercase text-xs tracking-wide">
                    {isPrepaymentDeduct && prepaymentDeductionTotal > 0 ? 'Total venta' : 'Total comprobante'}
                  </span>
                  <span className="tabular-nums text-base">
                    {fmt(isPrepaymentDeduct && prepaymentDeductionTotal > 0 ? totalGlobal : checkoutTotal)}
                  </span>
                </div>
                {!isNotaVenta && isPrepaymentDeduct && prepaymentDeductionTotal > 0 && (
                  <>
                    <div className="flex justify-between text-sky-800 text-xs">
                      <span>Anticipos deducidos</span>
                      <span className="tabular-nums">− {fmt(prepaymentDeductionTotal)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-emerald-800 text-sm">
                      <span>Total a pagar</span>
                      <span className="tabular-nums">{fmt(prepaymentPayableTotal)}</span>
                    </div>
                  </>
                )}
                {!isNotaVenta && fiscalForm.has_igv_retention && !isDetraccion && retentionPreview.applicable && (
                  <>
                    <div className="flex justify-between text-amber-800 text-xs">
                      <span>Retención IGV (3%)</span>
                      <span className="tabular-nums">{fmt(retentionPreview.retentionAmount)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-emerald-800 text-sm">
                      <span>Neto a cobrar</span>
                      <span className="tabular-nums">{fmt(retentionPreview.netCollectible)}</span>
                    </div>
                  </>
                )}
                {!isNotaVenta && isPrepaymentEmit && (
                  <PrepaymentEmitSummary
                    emit={isPrepaymentEmit}
                    config={prepaymentConfig}
                    affectationGroup={prepaymentAffectationGroup}
                    total={checkoutTotal}
                    formatMoney={fmt}
                  />
                )}
                {!isNotaVenta && isDetraccion && detractionPreview.applicable && (
                  <>
                    <div className="flex justify-between text-gray-700 text-xs pt-1">
                      <span>Total factura</span>
                      <span className="tabular-nums">{fmt(totalGlobal)}</span>
                    </div>
                    <div className="flex justify-between text-amber-800 text-xs">
                      <span>Detracción BN ({detractionPreview.ratePercent}%)</span>
                      <span className="tabular-nums">{fmt(detractionPreview.detractionAmount)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-emerald-800 text-sm border-b border-emerald-100 pb-2 mb-1">
                      <span>Neto cobrable (pagos directos)</span>
                      <span className="tabular-nums">{fmt(detractionPreview.netPayable)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {!isQuotation && (
              <div className="md:col-span-5">
                <SalePaymentConditionSection
                  conditionCode={paymentConditionCode}
                  onConditionChange={handlePaymentConditionChange}
                  creditMode={creditMode}
                  onCreditModeChange={setCreditMode}
                  installmentCount={installmentCount}
                  onInstallmentCountChange={setInstallmentCount}
                  installments={creditInstallments}
                  onInstallmentsChange={rows => {
                    setCreditInstallments(rows)
                    if (creditMode === 'single' && rows[0]?.due_date) {
                      setCreditFirstDueDate(rows[0].due_date)
                    }
                  }}
                  creditAmount={creditAmount}
                  firstDueDate={creditFirstDueDate}
                  onFirstDueDateChange={setCreditFirstDueDate}
                  moneySym={moneySym}
                  fmt={fmt}
                  payableAmount={directPayableTarget}
                  disableCredit={prepaymentCoversAll}
                />
              </div>
            )}
          </div>
        </section>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => navigate(isQuotation ? '/quotations' : '/sales')}
            className="inline-flex items-center justify-center px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 sm:min-w-[7.5rem]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSalePreview()}
            disabled={previewLoading || saving || items.length === 0}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 sm:min-w-[9rem]"
          >
            {previewLoading ? <Loader2 size={16} className="animate-spin" /> : null}
            Previsualizar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || items.length === 0 || (!isQuotation && !cashSession)}
            className="inline-flex items-center justify-center px-6 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50 sm:min-w-[9rem]"
          >
            {saving
              ? 'Guardando...'
              : isQuotation
                ? editingQuotationId
                  ? 'Actualizar cotización'
                  : 'Guardar cotización'
                : isNotaVenta
                  ? 'Registrar nota de venta'
                  : 'Generar'}
          </button>
        </div>
      </div>

      <Modal open={showProductPicker} onClose={() => setShowProductPicker(false)} contentClassName="max-w-2xl">
        <ProductPickerModal
          variant="sale"
          currency={form.currency}
          onAdd={addProductToItems}
          onClose={() => setShowProductPicker(false)}
          addedProductIds={cartProductIds}
          lastAddedProductId={pickerLastAddedProductId}
        />
      </Modal>

      <ProductConfigureModal
        product={productToConfigure}
        branchId={activeBranchId}
        stacked
        onClose={() => setProductToConfigure(null)}
        onConfirm={handleSaleConfigureConfirm}
      />

      <Modal open={showManualItemModal} onClose={() => setShowManualItemModal(false)} contentClassName="max-w-lg">
        <ManualItemModal
          open={showManualItemModal}
          currency={form.currency}
          taxRate={taxRate}
          taxConfig={taxConfig}
          onAdd={addManualItem}
          onClose={() => setShowManualItemModal(false)}
        />
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

      <TenantCompanyEditModal
        open={companyEditOpen}
        onClose={() => setCompanyEditOpen(false)}
        company={companyConfig}
        onSaved={(patch) =>
          setCompanyConfig((prev) => (prev ? { ...prev, ...patch } : ({ ...patch } as CompanyConfig)))
        }
      />

      <SaleReceiptPreviewModal
        open={previewModalOpen}
        onClose={() => {
          setPreviewModalOpen(false)
          setPreviewPrintData(null)
        }}
        printData={previewPrintData}
        mode={mode}
      />

      <ReceiptPrintModal
        open={receiptModalOpen}
        onClose={() => {
          setReceiptModalOpen(false)
          setPrintData(null)
          const id = lastSale?.id
          setLastSale(null)
          if (isQuotation) {
            navigate('/quotations')
            return
          }
          navigate(isNotaVenta ? '/sales' : '/billing', { state: id ? { created: id } : undefined })
        }}
        printData={printData}
        saleId={!isQuotation ? lastSale?.id : undefined}
        quotationId={isQuotation ? lastSale?.id : undefined}
        defaultEmail={selectedContact?.email ?? printData?.client?.email ?? ''}
        saleNumber={lastSale?.number}
        total={lastSale?.total}
        autoShowTicketOnWeb
        documentKind={isQuotation ? 'quotation' : 'sale'}
      />

      <BarcodeScannerModal
        open={barcodeScan.cameraScannerOpen}
        onClose={barcodeScan.closeScanner}
        onScan={barcodeScan.handleBarcodeScan}
        busy={barcodeScan.scanProcessing}
        title="Escanear producto"
        subtitle="Apunta al código de barras"
        footerHint="El producto se agregará al comprobante al detectar el código"
      />
    </div>
  )
}

function isGravadoAfectacion(code: string): boolean {
  return getAfectacionGroup(code) === 'gravado'
}

function ManualItemModal({
  open,
  currency,
  taxRate,
  taxConfig,
  onAdd,
  onClose,
}: {
  open: boolean
  currency: string
  taxRate: number
  taxConfig: { taxRate: number; igvRegime?: string; taxBenefitZone?: boolean }
  onAdd: (draft: ManualItemDraft) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<ManualItemDraft>({ ...INITIAL_MANUAL_ITEM_DRAFT })

  useEffect(() => {
    if (open) setDraft({ ...INITIAL_MANUAL_ITEM_DRAFT })
  }, [open])

  const setField = <K extends keyof ManualItemDraft>(key: K, value: ManualItemDraft[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  const preview = calcItemWithSubtotalDiscount(
    draft.unit_price,
    draft.quantity,
    0,
    draft.igv_affectation_type,
    draft.price_includes_igv,
    taxRate,
    taxConfig,
  )

  const handleSubmit = () => onAdd(draft)

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-800 text-lg">Producto manual</h3>
        <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
          <X size={18} />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Descripción *</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={draft.description}
            onChange={e => setField('description', e.target.value)}
            placeholder="Nombre o detalle del ítem"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Código</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
              value={draft.code}
              onChange={e => setField('code', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Unidad</label>
            <SearchableSelect
              value={draft.unit}
              onChange={(v) => setField('unit', String(v ?? 'NIU'))}
              options={sunatUnitSelectOptions()}
              searchable
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad</label>
            <input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={draft.quantity}
              onChange={e => setField('quantity', Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Precio unitario</label>
            <MoneyAmountInput
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={draft.unit_price}
              onChange={(v) => setField('unit_price', Math.max(0, v))}
              clearOnFocus
              emptyWhenZero
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Afectación IGV</label>
          <select
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={draft.igv_affectation_type}
            onChange={e => {
              const code = e.target.value
              setDraft(prev => ({
                ...prev,
                igv_affectation_type: code,
                price_includes_igv: isGravadoAfectacion(code) ? prev.price_includes_igv : false,
              }))
            }}
          >
            {IGV_AFFECTATION_OPTIONS.map(o => (
              <option key={o.code} value={o.code}>{o.label}</option>
            ))}
          </select>
        </div>
        {isGravadoAfectacion(draft.igv_affectation_type) ? (
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draft.price_includes_igv}
              onChange={e => setField('price_includes_igv', e.target.checked)}
              className="h-4 w-4 accent-[rgb(var(--p600))]"
            />
            Precio incluye IGV
          </label>
        ) : (
          <p className="text-xs text-gray-500">Esta afectación no aplica IGV al total.</p>
        )}
        <div className="flex justify-between text-sm text-gray-600 pt-1 border-t border-gray-100">
          <span>Total estimado</span>
          <span className="font-semibold text-gray-900 tabular-nums">{formatSaleMoney(preview.total, currency)}</span>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="flex-1 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
        >
          Agregar
        </button>
      </div>
    </>
  )
}
