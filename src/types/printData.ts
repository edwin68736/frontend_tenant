/** Estructura print_data para impresión del comprobante (web PDF o Tauri impresora POS). */
export interface PrintData {
  doc_type: string
  sunat_code: string
  series: string
  number: string
  issue_date: string
  issue_time?: string
  currency: string
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
