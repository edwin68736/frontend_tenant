import type { Contact } from '@/services/contacts.service'
import type { CompanyConfig } from '@/services/company.service'
import type { PrintData, PrintFiscalContext, PrintItem, PrintPayment } from '@/types/printData'
import { buildPrintBankAccounts } from '@/utils/receiptBankAccounts'
import type { DetraccionPreviewResult } from '@/utils/fiscalDetraction'
import { DETRACCION_PAYMENT_METHOD_CODE } from '@/utils/fiscalDetraction'
import type { RetentionPreview } from '@/utils/fiscalRetention'
import type { SaleFiscalFormState } from '@/components/sales/SaleAdditionalInfoDrawer'
import { formatModifierLines, parseStoredModifiers } from '@/utils/productModifiers'
import { calcPaymentChange } from '@/utils/money'
import { resolvePublicAssetUrl } from '@/config/apiBaseUrl'
import { amountInWords } from '@/utils/amountInWords'

import { igvAffectationLabel } from '@/constants/igvAffectation'

export type SalePreviewFormItem = {
  code: string
  description: string
  unit: string
  quantity: number
  unit_price: number
  igv_affectation_type: string
  modifiers_json?: string
}

export type SalePreviewSeries = {
  series: string
  doc_type: string
  sunat_code?: string
  current_number?: number
  correlative?: number
}

export type SalePreviewCompanyDraft = {
  trade_name?: string
  phone?: string
  address?: string
  email?: string
}

export type BuildSalePreviewPrintDataInput = {
  mode: 'nota-venta' | 'comprobante' | 'quotation'
  form: {
    sunat_code: string
    series_id: number | null
    issue_date: string
    due_date: string
    currency: string
    operation_type_code: string
    exchange_rate?: number | null
    notes?: string
  }
  items: SalePreviewFormItem[]
  saleCalc: {
    lines: Array<{
      subtotal: number
      taxAmount: number
      total: number
      storedDiscount?: number
      lineDiscountSubtotal?: number
      globalDiscountSubtotal?: number
    }>
  }
  subtotalGlobal: number
  taxGlobal: number
  totalGlobal: number
  lineDiscountTotal: number
  checkoutDiscountAmount: number
  selectedSeries: SalePreviewSeries | null
  selectedContact: Contact | null
  companyConfig: CompanyConfig | null
  companyDraft?: SalePreviewCompanyDraft
  branchName: string
  branchAddress?: string
  payments: Array<{ method: string; amount: string | number; reference?: string }>
  fiscalForm: SaleFiscalFormState
  isNotaVenta: boolean
  isDetraccion: boolean
  detractionPreview: DetraccionPreviewResult
  detraccionGoodCode: string
  detraccionGoodLabel?: string
  detractionBnAccount: string
  retentionPreview: RetentionPreview
  sellerName?: string
  paymentConditionCode?: 'cash' | 'credit'
  creditInstallments?: Array<{ due_date: string; amount: number | string }>
  isPrepaymentEmit?: boolean
  prepaymentConfig?: {
    emit_operation_type: string
    pdf_label: string
    affectation_groups: Array<{ value: string; label: string }>
  }
  prepaymentAffectationGroup?: string
  prepaymentDeduction?: {
    total: number
    rows: Array<{ document_number: string; related_doc_type: string; amount: number; total: number }>
  }
  /** Cuentas bancarias activas del tenant (para filtrar por receipt_bank_account_ids). */
  bankAccounts?: Array<{
    id: number
    name?: string
    bank_name?: string
    account_number?: string
    currency?: string
    active?: boolean
  }>
}

function isoDateToReceiptDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim())
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1]}`
}

function peruIssueTime(): string {
  try {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date())
  } catch {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  }
}

function previewDocumentNumber(series: SalePreviewSeries | null): string {
  if (!series?.series) return 'PREVIEW-00000001'
  const next = Math.max(1, (series.current_number ?? series.correlative ?? 0) + 1)
  return `${series.series}-${String(next).padStart(8, '0')}`
}

/** Pipe SUNAT para QR (igual que backend); hash "0" porque aún no hay comprobante emitido. */
export function buildPreviewQrData(params: {
  sunatCode: string
  series: string
  documentNumber: string
  taxAmount: number
  total: number
  issueDate: string
  ruc: string
  client: { doc_type: string; doc_number: string } | null
}): string {
  const code = params.sunatCode.trim()
  if (code === '00' || code === 'QT') return ''

  let clienteTipo = '0'
  let clienteNumero = '99999999'
  if (params.client) {
    clienteTipo = String(params.client.doc_type ?? '0').trim() || '0'
    clienteNumero = String(params.client.doc_number ?? '99999999').trim() || '99999999'
  }

  const ruc = params.ruc.trim() || '0'
  let numero = params.documentNumber
  const dash = params.documentNumber.lastIndexOf('-')
  if (dash >= 0 && dash + 1 < params.documentNumber.length) {
    numero = params.documentNumber.slice(dash + 1)
  }

  return [
    ruc,
    code,
    params.series.trim(),
    numero,
    params.taxAmount.toFixed(2),
    params.total.toFixed(2),
    params.issueDate,
    clienteTipo,
    clienteNumero,
    '0',
  ].join('|')
}

function itemDescriptionForPrint(it: SalePreviewFormItem): string {
  const base = it.description.trim()
  const mods = formatModifierLines(parseStoredModifiers(it.modifiers_json))
  if (!mods.length) return base || '—'
  return `${base}\n${mods.join('\n')}`
}

function resolveLogoUrl(logoUrl?: string): string | undefined {
  const raw = logoUrl?.trim()
  if (!raw) return undefined
  if (raw.startsWith('data:')) return raw
  return resolvePublicAssetUrl(raw)
}

function buildFiscalBlock(input: BuildSalePreviewPrintDataInput): PrintFiscalContext | undefined {
  const {
    fiscalForm,
    isNotaVenta,
    isDetraccion,
    detractionPreview,
    detraccionGoodCode,
    detraccionGoodLabel,
    detractionBnAccount,
    retentionPreview,
  } = input

  const guias = fiscalForm.guias
    .filter((g) => g.document_number.trim())
    .map((g) => ({ kind: g.reference_kind, number: g.document_number.trim() }))

  const fiscal: PrintFiscalContext = {}

  if (fiscalForm.purchase_order_number.trim()) {
    fiscal.purchase_order_number = fiscalForm.purchase_order_number.trim()
  }
  if (fiscalForm.fiscal_observations.trim()) {
    fiscal.fiscal_observations = fiscalForm.fiscal_observations.trim()
  }
  if (guias.length) fiscal.guias = guias

  if (!isNotaVenta && isDetraccion && detractionPreview.applicable) {
    fiscal.has_detraccion = true
    fiscal.detraccion_good_code = detraccionGoodCode
    fiscal.detraccion_good_label = detraccionGoodLabel
    fiscal.detraccion_rate_percent = detractionPreview.ratePercent
    fiscal.detraccion_amount = detractionPreview.detractionAmount
    fiscal.detraccion_bank_account = detractionBnAccount
    fiscal.detraccion_payment_method_code = DETRACCION_PAYMENT_METHOD_CODE
    fiscal.detraccion_net_payable = detractionPreview.netPayable
  } else if (!isNotaVenta && fiscalForm.has_igv_retention && retentionPreview.applicable) {
    fiscal.has_igv_retention = true
    fiscal.retention_applied = true
    fiscal.igv_retention_amount = retentionPreview.retentionAmount
    fiscal.net_collectible = retentionPreview.netCollectible
  }

  if (fiscalForm.show_terms_conditions) {
    fiscal.show_terms_conditions = true
    const terms = input.companyConfig?.terms_and_conditions?.trim()
    if (terms) fiscal.terms_text = terms
  }

  if (input.isPrepaymentEmit && input.prepaymentConfig) {
    fiscal.has_prepayment_emit = true
    fiscal.prepayment_label = input.prepaymentConfig.pdf_label
    fiscal.prepayment_affectation_group = input.prepaymentAffectationGroup
    fiscal.prepayment_related_doc_type = input.form.sunat_code === '01' ? '02' : '03'
  }

  if (input.prepaymentDeduction && input.prepaymentDeduction.rows.length > 0) {
    fiscal.has_prepayment_deduction = true
    fiscal.prepayment_deduction_total = input.prepaymentDeduction.total
    fiscal.prepayment_deductions = input.prepaymentDeduction.rows.map((r) => ({
      document_number: r.document_number,
      related_doc_type: r.related_doc_type,
      amount: r.amount,
      total: r.total,
    }))
  }

  if (
    !fiscal.has_detraccion &&
    !fiscal.has_igv_retention &&
    !fiscal.has_prepayment_emit &&
    !fiscal.has_prepayment_deduction &&
    !fiscal.purchase_order_number &&
    !fiscal.fiscal_observations &&
    !fiscal.guias?.length &&
    !fiscal.show_terms_conditions
  ) {
    return undefined
  }

  return fiscal
}

export function buildSalePreviewPrintData(input: BuildSalePreviewPrintDataInput): PrintData {
  const {
    mode,
    form,
    items,
    saleCalc,
    subtotalGlobal,
    taxGlobal,
    totalGlobal,
    lineDiscountTotal,
    checkoutDiscountAmount,
    selectedSeries,
    selectedContact,
    companyConfig,
    companyDraft,
    branchName,
    branchAddress,
    payments,
    fiscalForm,
    isNotaVenta,
    isDetraccion,
    detractionPreview,
    retentionPreview,
    sellerName,
  } = input

  const sunatCode =
    mode === 'quotation'
      ? 'QT'
      : (selectedSeries?.sunat_code ?? form.sunat_code).trim() || form.sunat_code

  const companyTradeName = (companyDraft?.trade_name ?? companyConfig?.trade_name ?? '').trim()
  const companyPhone = (companyDraft?.phone ?? companyConfig?.phone ?? '').trim()
  const companyEmail = (companyDraft?.email ?? companyConfig?.email ?? '').trim()
  const companyAddress = (companyDraft?.address ?? companyConfig?.address ?? '').trim()
  const branchAddr = branchAddress?.trim() ?? ''

  const printItems: PrintItem[] = items.map((it, idx) => {
    const line = saleCalc.lines[idx]
    return {
      code: it.code || '—',
      description: itemDescriptionForPrint(it),
      unit: it.unit || 'NIU',
      quantity: it.quantity,
      unit_price: it.unit_price,
      discount: line?.storedDiscount ?? 0,
      line_discount_subtotal: line?.lineDiscountSubtotal ?? 0,
      global_discount_subtotal: line?.globalDiscountSubtotal ?? 0,
      subtotal: line?.subtotal ?? 0,
      tax_amount: line?.taxAmount ?? 0,
      total: line?.total ?? 0,
      igv_affectation_type: it.igv_affectation_type || '10',
      modifiers_json: it.modifiers_json,
    }
  })

  const totalsByAffectation: PrintData['totals_by_affectation'] = {}
  items.forEach((it, idx) => {
    const code = it.igv_affectation_type || '10'
    const line = saleCalc.lines[idx]
    if (!totalsByAffectation[code]) {
      totalsByAffectation[code] = {
        code,
        description: igvAffectationLabel(code),
        subtotal: 0,
        tax_amount: 0,
        total: 0,
      }
    }
    totalsByAffectation[code].subtotal += line?.subtotal ?? 0
    totalsByAffectation[code].tax_amount += line?.taxAmount ?? 0
    totalsByAffectation[code].total += line?.total ?? 0
  })

  const directPayments: PrintPayment[] = payments
    .filter((p) => Number(p.amount) > 0)
    .map((p) => ({
      method: p.method,
      amount: Number(p.amount),
      reference: p.reference?.trim() || undefined,
    }))

  const printPayments = [...directPayments]
  if (!isNotaVenta && isDetraccion && detractionPreview.applicable) {
    printPayments.push({
      method: DETRACCION_PAYMENT_METHOD_CODE,
      amount: detractionPreview.detractionAmount,
    })
  }

  let payable = totalGlobal
  if (!isNotaVenta && isDetraccion && detractionPreview.applicable) {
    payable = detractionPreview.netPayable
  } else if (!isNotaVenta && fiscalForm.has_igv_retention && retentionPreview.applicable) {
    payable = retentionPreview.netCollectible
  }

  const directPaid = directPayments.reduce((s, p) => s + p.amount, 0)
  const changeAmount = calcPaymentChange(directPaid, payable)

  const fiscal = buildFiscalBlock(input)

  const walletProvider = companyConfig?.wallet_provider?.trim().toLowerCase()
  const walletPhone = companyConfig?.wallet_phone?.trim()
  const walletQr = companyConfig?.wallet_qr_url?.trim()

  const seriesCode = selectedSeries?.series ?? 'PREVIEW'
  const documentNumber = previewDocumentNumber(selectedSeries)
  const issueDateReceipt = isoDateToReceiptDate(form.issue_date)
  const qr_data = buildPreviewQrData({
    sunatCode: sunatCode,
    series: seriesCode,
    documentNumber,
    taxAmount: taxGlobal,
    total: totalGlobal,
    issueDate: issueDateReceipt,
    ruc: companyConfig?.ruc ?? '',
    client: selectedContact
      ? { doc_type: selectedContact.doc_type, doc_number: selectedContact.doc_number }
      : null,
  })

  return {
    doc_type: selectedSeries?.doc_type ?? (mode === 'quotation' ? 'COTIZACION' : 'BOLETA'),
    sunat_code: sunatCode,
    series: seriesCode,
    number: documentNumber,
    issue_date: issueDateReceipt,
    issue_time: peruIssueTime(),
    currency: form.currency,
    exchange_rate: form.currency === 'USD' ? form.exchange_rate ?? null : null,
    operation_type_code: input.isPrepaymentEmit && input.prepaymentConfig
      ? input.prepaymentConfig.emit_operation_type
      : form.operation_type_code,
    qr_data,
    legend_text: amountInWords(totalGlobal, form.currency),
    valid_until: mode === 'quotation' ? isoDateToReceiptDate(form.due_date) : undefined,
    notes:
      mode === 'quotation' || mode === 'nota-venta'
        ? form.notes?.trim() || undefined
        : undefined,
    client: selectedContact
      ? {
          doc_type: selectedContact.doc_type,
          doc_number: selectedContact.doc_number,
          business_name: selectedContact.business_name,
          address: selectedContact.address,
          email: selectedContact.email,
        }
      : null,
    company: {
      ruc: companyConfig?.ruc ?? '',
      business_name: companyConfig?.business_name ?? '',
      trade_name: companyTradeName || undefined,
      address: companyAddress || branchAddr || undefined,
      phone: companyPhone || undefined,
      email: companyEmail || undefined,
      website: companyConfig?.website?.trim() || undefined,
      logo_url: resolveLogoUrl(companyConfig?.logo_url),
      additional_notes: companyConfig?.additional_notes?.trim() || undefined,
    },
    branch: {
      name: branchName || 'Principal',
      address: branchAddr || undefined,
    },
    items: printItems,
    subtotal: subtotalGlobal,
    tax_amount: taxGlobal,
    total: totalGlobal,
    global_discount_amount: checkoutDiscountAmount > 0 ? checkoutDiscountAmount : undefined,
    line_discount_total: lineDiscountTotal > 0 ? lineDiscountTotal : undefined,
    totals_by_affectation: Object.keys(totalsByAffectation).length ? totalsByAffectation : undefined,
    payments: printPayments,
    change_amount: changeAmount > 0.009 ? changeAmount : undefined,
    seller_name: sellerName,
    payment_condition: input.paymentConditionCode === 'credit' ? 'Crédito' : 'Contado',
    credit_installments:
      input.paymentConditionCode === 'credit' && input.creditInstallments?.length
        ? input.creditInstallments.map((row, idx) => ({
            installment_no: idx + 1,
            due_date: isoDateToReceiptDate(row.due_date),
            amount: Number(row.amount) || 0,
            currency: form.currency,
            status: 'pending',
          }))
        : undefined,
    fiscal,
    payment_wallet:
      walletProvider && walletPhone && walletQr
        ? {
            provider: walletProvider,
            phone: walletPhone,
            qr_url: walletQr.startsWith('data:') ? walletQr : resolvePublicAssetUrl(walletQr),
            show_on_a4: Boolean(companyConfig?.wallet_show_on_a4),
            show_on_ticket: Boolean(companyConfig?.wallet_show_on_ticket),
          }
        : undefined,
    bank_accounts: (() => {
      const banks = buildPrintBankAccounts(
        companyConfig?.receipt_bank_account_ids,
        input.bankAccounts ?? [],
      )
      return banks.length > 0 ? banks : undefined
    })(),
  }
}

export function validateSalePreviewInput(input: BuildSalePreviewPrintDataInput): string | null {
  if (!input.items.length) return 'Agregue al menos un ítem para previsualizar'
  if (!input.form.series_id) return 'Seleccione una serie'
  for (const it of input.items) {
    if (!it.description.trim()) return 'Todos los ítems deben tener descripción'
  }
  return null
}
