import api from './api'
import { resolvePublicAssetUrl } from '@/config/apiBaseUrl'

export interface TenantSubscriptionView {
  has_subscription?: boolean
  subscription_id?: number
  plan_name: string
  /** Ciclo del PLAN (monthly, annual…), no necesariamente lo contratado. */
  billing_cycle: string
  /** Meses realmente contratados (start_date → end_date). Define el próximo pago. */
  contracted_months?: number
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
  urgency_tier: 'normal' | 'reminder' | 'payment_due' | 'grace' | 'overdue' | 'suspended' | 'blocked' | 'provisional' | 'review'
  plan_amount: number
  current_payment_label: string
  current_payment_tone: 'success' | 'warning' | 'danger' | 'info' | 'muted'
  has_real_debt: boolean
  display_debt_amount?: number
  /** Plazo del cobro en curso: dia limite y dias restantes (negativo = plazo agotado). */
  payment_due_date?: string
  payment_days_left?: number
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
  /** Boleta/factura emitida por este pago; vacío mientras no la adjunten. */
  fiscal_doc_url?: string
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
  /** Fin de la suscripción pagada: hasta aquí valen los paquetes comprados. */
  billing_cycle_end?: string
  /**
   * Fecha en que el cupo mensual del plan vuelve a estar completo. No coincide con
   * `billing_cycle_end` cuando el cliente paga varios meses por adelantado: los
   * documentos del plan se renuevan cada mes, la suscripción vence al final.
   */
  quota_period_end?: string
  /** Mes en curso dentro de la suscripción (1 = primero). */
  quota_period_index?: number
  /** Total de meses que cubre la suscripción. */
  quota_period_total?: number
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

/** Plan visible para elegir/renovar (GET /api/subscription/plans). Solo activos. */
export interface PublicPlan {
  id: number
  name: string
  description: string
  price: number
  billing_cycle: string
  is_unlimited_documents: boolean
  monthly_documents_limit: number
  max_users: number
  max_branches: number
  max_products: number
  modules: string[]
}

/** URL absoluta para assets en /storage (QR SaaS). */
export function assetUrl(path: string): string {
  return resolvePublicAssetUrl(path)
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

  listPlans: (): Promise<PublicPlan[]> =>
    api.get('/api/subscription/plans').then(r => (r.data as { plans: PublicPlan[] }).plans),

  /** Elegir plan y, opcionalmente, adjuntar comprobante en el mismo paso (comprobante no
   * obligatorio, a diferencia de submitPayment). */
  submitRenewalRequest: (form: FormData): Promise<{ success: boolean; message?: string; hub?: BillingHub }> =>
    api.post('/api/subscription/renewal-request', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),
}
