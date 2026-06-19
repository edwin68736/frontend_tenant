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
  totals_by_affectation?: Record<string, PrintAffectTotal>
  payments: PrintPayment[]
  seller_name?: string
  payment_condition?: string
  bank_accounts?: PrintBankAccount[]
  payment_wallet?: PrintPaymentWallet
  /** Información adicional fiscal (retención operativa, O/C, guías). */
  fiscal?: PrintFiscalContext
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
  subtotal: number
  tax_amount: number
  total: number
  modifiers_json?: string
}

export interface PrintAffectTotal {
  code: string
  description: string
  subtotal: number
  tax_amount: number
  total: number
}

export interface PrintPayment {
  method: string
  amount: number
  reference?: string
}
