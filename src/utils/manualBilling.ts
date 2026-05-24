import type { BillingResult } from '@/services/billing.service'
import {
  BILLING_STATUS,
  normalizeBillingStatus,
  type SaleBillingStatus,
} from '@/constants/billingStatus'

export type ManualBillingStatus =
  | 'accepted'
  | 'rejected'
  | 'error'
  | 'processing'
  | 'already_accepted'
  | 'queued'

export function resolveManualBillingStatus(res: BillingResult): ManualBillingStatus {
  if (res.status && ['accepted', 'rejected', 'error', 'processing', 'already_accepted', 'queued'].includes(res.status)) {
    if (res.status === 'queued') return 'processing'
    return res.status as ManualBillingStatus
  }
  if (res.safe_to_print || res.success) return 'accepted'
  if (res.async) return 'processing'
  return 'error'
}

/** Estado UI tras send/resend: prioriza status de la operación, no billing_status stale del sale row. */
export function billingStatusForUI(res: BillingResult): SaleBillingStatus {
  switch (resolveManualBillingStatus(res)) {
    case 'accepted':
    case 'already_accepted':
      return BILLING_STATUS.accepted
    case 'rejected':
      return BILLING_STATUS.rejected
    case 'error':
      return BILLING_STATUS.error
    case 'processing':
      return normalizeBillingStatus(res.billing_status) === BILLING_STATUS.pending
        ? BILLING_STATUS.sent
        : normalizeBillingStatus(res.billing_status)
    default:
      return normalizeBillingStatus(res.billing_status)
  }
}

export function manualBillingMessage(res: BillingResult): string {
  const status = resolveManualBillingStatus(res)
  const msg = typeof res.message === 'string' ? res.message.trim() : ''
  if (msg) return msg
  switch (status) {
    case 'accepted':
      return 'Comprobante aceptado por SUNAT'
    case 'already_accepted':
      return 'El comprobante ya fue aceptado por SUNAT'
    case 'rejected':
      return 'Comprobante rechazado por SUNAT'
    case 'error':
      return 'Error al enviar el comprobante'
    case 'processing':
      return 'Comprobante en proceso; se actualizará automáticamente'
    default:
      return 'Operación completada'
  }
}

export { normalizeBillingStatus, type SaleBillingStatus }
