import type { BillingContextView, BillingHub, TenantSubscriptionView } from '@/services/subscription.service'

export type UrgencyTier =
  | 'normal'
  | 'reminder'
  | 'grace'
  | 'overdue'
  | 'suspended'
  | 'blocked'
  | 'provisional'
  | 'review'

/** Estilos del mini widget del topbar (compacto, no banner). */
const WIDGET_ACCENT: Record<string, string> = {
  normal: 'border-emerald-200/90 bg-emerald-50/50 hover:bg-emerald-50 text-gray-800',
  reminder: 'border-amber-200/90 bg-amber-50/50 hover:bg-amber-50 text-gray-800',
  grace: 'border-amber-200/90 bg-amber-50/60 hover:bg-amber-50 text-gray-800',
  overdue: 'border-red-200/90 bg-red-50/50 hover:bg-red-50 text-gray-800',
  suspended: 'border-red-300/90 bg-red-50/60 hover:bg-red-50 text-gray-800',
  blocked: 'border-slate-600 bg-slate-800 hover:bg-slate-700 text-white',
  provisional: 'border-blue-200/90 bg-blue-50/50 hover:bg-blue-50 text-gray-800',
  review: 'border-blue-200/90 bg-blue-50/50 hover:bg-blue-50 text-gray-800',
}

const PAYMENT_SHORT: Record<string, { label: string; icon: 'ok' | 'warn' | 'danger' }> = {
  Pagado: { label: 'AL DÍA', icon: 'ok' },
  'En revisión': { label: 'EN REVISIÓN', icon: 'warn' },
  'Renovación próxima': { label: 'RENOVAR', icon: 'warn' },
  'Periodo de gracia': { label: 'GRACIA', icon: 'warn' },
  Suspendido: { label: 'VENCIDO', icon: 'danger' },
  Vencido: { label: 'VENCIDO', icon: 'danger' },
  'Acceso provisional': { label: 'PROVISIONAL', icon: 'warn' },
  'Cuenta bloqueada': { label: 'BLOQUEADO', icon: 'danger' },
}

const BANNER_STYLES: Record<string, string> = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  info: 'bg-blue-50 border-blue-200 text-blue-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
  danger: 'bg-red-50 border-red-200 text-red-900',
}

const PAYMENT_TONE: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  muted: 'bg-slate-200 text-slate-800',
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  grace_period: 'bg-amber-100 text-amber-800',
  provisional_active: 'bg-blue-100 text-blue-800',
  suspended: 'bg-red-100 text-red-800',
  blocked: 'bg-slate-800 text-white',
  overdue: 'bg-orange-100 text-orange-800',
}

export const STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  grace_period: 'Periodo de gracia',
  overdue: 'Vencida',
  suspended: 'Suspendida',
  provisional_active: 'Provisional',
  blocked: 'Bloqueada',
  pending: 'Pendiente',
  paid: 'Pagada',
  pending_review: 'En revisión',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}

export function formatMoney(n: number, c = 'PEN') {
  return `${c === 'PEN' ? 'S/' : `${c} `}${n.toFixed(2)}`
}

export function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Lima' }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function getUrgencyTier(hub: BillingHub): UrgencyTier {
  return (hub.billing_context?.urgency_tier ?? 'normal') as UrgencyTier
}

export function widgetAccentClass(tier: UrgencyTier, blocked?: boolean) {
  if (blocked || tier === 'blocked') return WIDGET_ACCENT.blocked
  return WIDGET_ACCENT[tier] ?? WIDGET_ACCENT.normal
}

export function paymentStatusShort(hub: BillingHub): { label: string; icon: 'ok' | 'warn' | 'danger' } {
  const raw = hub.billing_context?.current_payment_label ?? 'Pagado'
  if (raw.startsWith('Pendiente')) {
    return hub.billing_context?.has_real_debt
      ? { label: 'PENDIENTE', icon: 'warn' }
      : { label: 'AL DÍA', icon: 'ok' }
  }
  for (const [key, val] of Object.entries(PAYMENT_SHORT)) {
    if (raw === key || raw.toLowerCase().includes(key.toLowerCase())) return val
  }
  return { label: 'AL DÍA', icon: 'ok' }
}

export function nextPaymentDate(sub: TenantSubscriptionView) {
  return sub.next_billing_date || sub.end_date || ''
}

export function widgetTooltip(hub: BillingHub) {
  const sub = hub.subscription
  const pay = paymentStatusShort(hub)
  const days = sub.days_until_expiry
  return `Plan: ${sub.plan_name || '—'}\nPago: ${pay.label}\n${days >= 0 ? `${days} día(s) restantes` : 'Vencido'}`
}

export function bannerClass(variant: string) {
  return BANNER_STYLES[variant] ?? BANNER_STYLES.info
}

export function paymentToneClass(tone: string) {
  return PAYMENT_TONE[tone] ?? PAYMENT_TONE.muted
}

export function statusBadgeClass(status: string) {
  return STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-700'
}

/** Monto del período: plan + reconexión solo si el tenant está suspendido por mora. */
export function billingCyclePaymentTotal(
  inv: { amount: number; reconnection_fee: number },
  sub: Pick<TenantSubscriptionView, 'is_suspended' | 'tenant_status'>,
) {
  if (sub.is_suspended || sub.tenant_status === 'suspended') {
    return inv.amount + inv.reconnection_fee
  }
  return inv.amount
}

export function planAmountDisplay(hub: BillingHub) {
  const ctx = hub.billing_context
  if (ctx?.plan_amount && ctx.plan_amount > 0) return ctx.plan_amount
  const pending = hub.invoices.find(i => i.id === hub.subscription.pending_invoice_id)
  return pending?.amount ?? hub.subscription.pending_amount ?? 0
}

export function docProgressColor(percent: number, level: string) {
  if (level === 'exhausted' || percent >= 100) return 'bg-red-500'
  if (percent >= 90) return 'bg-amber-500'
  if (percent >= 80) return 'bg-amber-400'
  return 'bg-blue-500'
}

export type BillingContext = BillingContextView
