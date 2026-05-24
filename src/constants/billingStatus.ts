/** Estados canónicos de tenant_sales.billing_status — deben coincidir con backend_go/pkg/billingstate. */

export const BILLING_DISPLAY_PHASE = {
  draft: 'draft',
  pending: 'pending',
  queued: 'queued',
  sending: 'sending',
  retrying: 'retrying',
  accepted: 'accepted',
  observed: 'observed',
  rejected: 'rejected',
  error: 'error',
  cancelled: 'cancelled',
} as const

export type BillingDisplayPhase = (typeof BILLING_DISPLAY_PHASE)[keyof typeof BILLING_DISPLAY_PHASE]

export const BILLING_DISPLAY_LABELS: Record<BillingDisplayPhase, string> = {
  draft: 'Borrador',
  pending: 'Pendiente',
  queued: 'En cola',
  sending: 'Enviando',
  retrying: 'Reintentando',
  accepted: 'Aceptado',
  observed: 'Aceptado con observaciones',
  rejected: 'Rechazado',
  error: 'Error envío',
  cancelled: 'Anulado',
}

export const BILLING_DISPLAY_COLORS: Record<BillingDisplayPhase, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending: 'bg-yellow-100 text-yellow-700',
  queued: 'bg-indigo-100 text-indigo-700',
  sending: 'bg-blue-100 text-blue-700',
  retrying: 'bg-purple-100 text-purple-700',
  accepted: 'bg-green-100 text-green-700',
  observed: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-100 text-red-600',
  error: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-gray-100 text-gray-600',
}

/** Preferir display_phase del backend (StatusView) cuando exista. */
export function resolveBillingUILabel(sale: {
  billing_status?: unknown
  status_detail?: { display_phase?: string; display_label?: string }
}): string {
  const detail = sale.status_detail
  if (detail?.display_label) return detail.display_label
  const phase = detail?.display_phase
  if (phase && phase in BILLING_DISPLAY_LABELS) {
    return BILLING_DISPLAY_LABELS[phase as BillingDisplayPhase]
  }
  return billingStatusLabel(sale.billing_status)
}

export function resolveBillingUIColor(sale: {
  billing_status?: unknown
  status_detail?: { display_phase?: string }
}): string {
  const phase = sale.status_detail?.display_phase
  if (phase && phase in BILLING_DISPLAY_COLORS) {
    return BILLING_DISPLAY_COLORS[phase as BillingDisplayPhase]
  }
  return billingStatusColor(sale.billing_status)
}

export const BILLING_STATUS = {
  pending: 'pending',
  sent: 'sent',
  accepted: 'accepted',
  observed: 'observed',
  rejected: 'rejected',
  error: 'error',
} as const

export type SaleBillingStatus = (typeof BILLING_STATUS)[keyof typeof BILLING_STATUS]

const VALID = new Set<string>(Object.values(BILLING_STATUS))

export function normalizeBillingStatus(raw: unknown): SaleBillingStatus {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (VALID.has(s)) return s as SaleBillingStatus
  return BILLING_STATUS.pending
}

export const BILLING_STATUS_COLORS: Record<SaleBillingStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  observed: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-100 text-red-600',
  error: 'bg-orange-100 text-orange-700',
}

export const BILLING_STATUS_LABELS: Record<SaleBillingStatus, string> = {
  pending: 'Pendiente',
  sent: 'Enviado',
  accepted: 'Aceptado',
  observed: 'Aceptado con observaciones',
  rejected: 'Rechazado',
  error: 'Error envío',
}

export const BILLING_STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: BILLING_STATUS.pending, label: BILLING_STATUS_LABELS.pending },
  { value: BILLING_STATUS.error, label: BILLING_STATUS_LABELS.error },
  { value: BILLING_STATUS.sent, label: BILLING_STATUS_LABELS.sent },
  { value: BILLING_STATUS.accepted, label: BILLING_STATUS_LABELS.accepted },
  { value: BILLING_STATUS.observed, label: BILLING_STATUS_LABELS.observed },
  { value: BILLING_STATUS.rejected, label: BILLING_STATUS_LABELS.rejected },
] as const

export function billingStatusLabel(status: unknown): string {
  const s = normalizeBillingStatus(status)
  return BILLING_STATUS_LABELS[s]
}

export function billingStatusColor(status: unknown): string {
  const s = normalizeBillingStatus(status)
  return BILLING_STATUS_COLORS[s]
}

export function isBillingTerminal(status: unknown): boolean {
  const s = normalizeBillingStatus(status)
  return s === BILLING_STATUS.accepted || s === BILLING_STATUS.observed || s === BILLING_STATUS.rejected || s === BILLING_STATUS.error
}

export function canShowCdr(status: unknown): boolean {
  const s = normalizeBillingStatus(status)
  return s === BILLING_STATUS.accepted || s === BILLING_STATUS.observed || s === BILLING_STATUS.rejected
}

export function canShowXmlSent(status: unknown): boolean {
  const s = normalizeBillingStatus(status)
  return s === BILLING_STATUS.sent || s === BILLING_STATUS.accepted || s === BILLING_STATUS.observed || s === BILLING_STATUS.rejected
}

export function canShowXmlGenerated(status: unknown): boolean {
  const s = normalizeBillingStatus(status)
  return s === BILLING_STATUS.pending || s === BILLING_STATUS.error
}

export function canShowSunatOfficialPdf(status: unknown): boolean {
  const s = normalizeBillingStatus(status)
  return s === BILLING_STATUS.sent || s === BILLING_STATUS.accepted || s === BILLING_STATUS.observed
}
