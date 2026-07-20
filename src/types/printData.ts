/** Estructura print_data para impresión del comprobante (web PDF o Tauri impresora POS). */
export interface PrintData {
  doc_type: string
  sunat_code: string
  series: string
  number: string
  issue_date: string
  issue_time?: string
  currency: string
  exchange_rate?: number | null
  operation_type_code?: string
  sunat_hash?: string
  qr_data: string
  /** Leyenda en letras (code 1000), ej. "SESENTA CON 00/100" */
  legend_text?: string
  client: PrintClient | null
  company: PrintCompany
  branch: PrintBranch
  items: PrintItem[]
  subtotal: number
  tax_amount: number
  total: number
  global_discount_amount?: number
  line_discount_total?: number
  totals_by_affectation?: Record<string, PrintAffectTotal>
  payments: PrintPayment[]
  /** Vuelto cuando el cliente pagó de más (p. ej. efectivo). */
  change_amount?: number
  seller_name?: string
  payment_condition?: string
  credit_installments?: PrintCreditInstallment[]
  bank_accounts?: PrintBankAccount[]
  payment_wallet?: PrintPaymentWallet
  /** Información adicional fiscal (retención operativa, O/C, guías). */
  fiscal?: PrintFiscalContext
  /** Cotización: fecha de vigencia (dd/mm/yyyy). */
  valid_until?: string
  /** Observaciones comerciales (cotización). */
  notes?: string
}

export interface PrintFiscalContext {
  purchase_order_number?: string
  fiscal_observations?: string
  guias?: PrintGuiaRef[]
  has_igv_retention?: boolean
  igv_retention_amount?: number
  net_collectible?: number
  retention_applied?: boolean
  show_terms_conditions?: boolean
  terms_text?: string
  has_detraccion?: boolean
  detraccion_good_code?: string
  detraccion_good_label?: string
  detraccion_rate_percent?: number
  detraccion_amount?: number
  detraccion_bank_account?: string
  detraccion_payment_method_code?: string
  detraccion_net_payable?: number
  has_prepayment_emit?: boolean
  prepayment_label?: string
  prepayment_affectation_group?: string
  prepayment_related_doc_type?: string
  has_prepayment_deduction?: boolean
  prepayment_deduction_total?: number
  prepayment_deductions?: PrintPrepaymentDeduction[]
}

export interface PrintPrepaymentDeduction {
  document_number: string
  related_doc_type: string
  amount: number
  total: number
}

export interface PrintGuiaRef {
  kind?: string
  number: string
}

export interface PrintPaymentWallet {
  provider: string
  phone: string
  qr_url: string
  show_on_a4: boolean
  show_on_ticket: boolean
}

export interface PrintClient {
  doc_type: string
  doc_number: string
  business_name: string
  address?: string
  email?: string
}

export interface PrintCompany {
  ruc: string
  business_name: string
  trade_name?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  logo_url?: string
  additional_notes?: string
  /**
   * Discriminar IGV/valor de venta en la representación impresa. Default true.
   * En Nuevo RUS es false: la boleta muestra solo el importe total (el XML sí
   * lleva el IGV; ocultarlo en el impreso cumple el Reglamento de CP, Art. 8).
   */
  show_igv_breakdown?: boolean
}

export interface PrintBankAccount {
  name?: string
  bank_name: string
  account_number: string
  currency: string
}

export interface PrintBranch {
  name: string
  address?: string
}

export interface PrintItem {
  code: string
  description: string
  unit: string
  quantity: number
  unit_price: number
  discount: number
  line_discount_subtotal?: number
  global_discount_subtotal?: number
  subtotal: number
  tax_amount: number
  total: number
  igv_affectation_type?: string
  modifiers_json?: string
  /** Nota libre de la línea, guardada en el snapshot del documento. */
  item_note?: string
}

export interface PrintAffectTotal {
  code: string
  description: string
  subtotal: number
  tax_amount: number
  total: number
}

export interface PrintCreditInstallment {
  installment_no: number
  due_date: string
  amount: number
  currency?: string
  status?: string
}

export interface PrintPayment {
  method: string
  amount: number
  reference?: string
}
