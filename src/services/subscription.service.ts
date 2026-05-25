import api, { getApiBaseUrl } from './api'

export interface TenantSubscriptionView {
  has_subscription?: boolean
  plan_name: string
  billing_cycle: string
  status: string
  tenant_status: string
  days_until_expiry: number
  in_grace_period: boolean
  is_overdue: boolean
  is_suspended: boolean
  is_blocked: boolean
  strike_count: number
  can_submit_payment: boolean
  provisional_until?: string
  provisional_hours_left?: number
  has_pending_payment_review?: boolean
  support_message?: string
  show_renewal_banner: boolean
  show_suspended_banner: boolean
  can_operate: boolean
  portal_url?: string
  next_billing_date?: string
  pending_amount: number
  reconnection_fee: number
  pending_invoice_id?: number
  end_date?: string
  start_date?: string
}

export interface PaymentMethodConfig {
  key: string
  label: string
  enabled: boolean
}

export interface BankAccountConfig {
  bank: string
  account_number: string
  cci: string
  holder: string
  currency: string
  enabled?: boolean
}

export interface SupportConfig {
  whatsapp: string
  email: string
  phone: string
}

export interface StatusBanner {
  variant: 'info' | 'warning' | 'danger' | 'success'
  message: string
}

export interface BillingContextView {
  reminder_days: number[]
  max_reminder_days: number
  urgency_tier: 'normal' | 'reminder' | 'grace' | 'overdue' | 'suspended' | 'blocked' | 'provisional' | 'review'
  plan_amount: number
  current_payment_label: string
  current_payment_tone: 'success' | 'warning' | 'danger' | 'info' | 'muted'
  has_real_debt: boolean
  display_debt_amount?: number
  show_status_banner: boolean
  status_banner_variant?: string
  status_banner_message?: string
}

export interface BillingInvoice {
  id: number
  amount: number
  reconnection_fee: number
  currency: string
  status: string
  due_date: string
  period_start: string
  period_end: string
  provisional_used: boolean
}

export interface SaasPaymentRow {
  id: number
  amount: number
  status: string
  payment_method: string
  reference?: string
  payment_date?: string
  reject_reason?: string
  created_at: string
}

export interface TimelineEvent {
  id: number
  event_type: string
  label: string
  reason: string
  created_at: string
}

export interface PaymentConfigView {
  methods: PaymentMethodConfig[]
  bank_accounts: BankAccountConfig[]
  yape_qr_url: string
  plin_qr_url: string
  portal_url_override?: string
  use_internal_hub: boolean
}

export interface DocumentUsageView {
  is_unlimited: boolean
  plan_limit: number
  plan_used: number
  plan_remaining: number
  package_bonus: number
  package_used: number
  package_remaining: number
  total_available: number
  total_consumed: number
  usage_percent: number
  warning_level: 'none' | 'low' | 'high' | 'exhausted'
  warning_message?: string
  can_emit: boolean
  billing_cycle_end?: string
}

export interface DocumentPackageCatalog {
  id: number
  name: string
  description: string
  documents_qty: number
  price: number
  currency: string
}

export interface BillingHub {
  subscription: TenantSubscriptionView
  billing_context?: BillingContextView
  payment_config: PaymentConfigView
  support: SupportConfig
  status_banner: StatusBanner
  documents?: DocumentUsageView
  document_packages?: DocumentPackageCatalog[]
  invoices: BillingInvoice[]
  payments: SaasPaymentRow[]
  events: TimelineEvent[]
}

/** URL absoluta para assets en /storage (QR SaaS). */
export function assetUrl(path: string): string {
  if (!path) return ''
  if (path.startsWith('http')) return path
  const base = getApiBaseUrl().replace(/\/$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

export const subscriptionService = {
  getHub: (): Promise<BillingHub> =>
    api.get('/api/subscription/summary').then(r => r.data as BillingHub),

  submitPayment: (form: FormData): Promise<{ success: boolean; message?: string; hub?: BillingHub }> =>
    api.post('/api/subscription/payments', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),

  purchaseDocumentPackage: (form: FormData): Promise<{ success: boolean; usage?: DocumentUsageView }> =>
    api.post('/api/subscription/document-packages/purchase', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),
}
