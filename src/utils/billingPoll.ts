import { billingService, type BillingStatusResponse } from '@/services/billing.service'

const TERMINAL = new Set([
  'SUNAT_ACCEPTED',
  'SUNAT_REJECTED',
  'OBSERVED',
  'FAILED',
  'DEAD_LETTER',
  'UNKNOWN',
])

export function isBillingTerminal(status: string): boolean {
  return TERMINAL.has(status)
}

export function billingStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING_QUEUE':
      return 'En cola'
    case 'PROCESSING':
    case 'RETRYING':
      return 'Procesando'
    case 'SENDING_TO_FACTURADOR':
      return 'Enviando al facturador'
    case 'FACTURADOR_RECEIVED':
      return 'Facturador recibió'
    case 'SENDING_TO_SUNAT':
      return 'Enviando a SUNAT'
    case 'SUNAT_ACCEPTED':
      return 'Aceptada por SUNAT'
    case 'OBSERVED':
      return 'Observada por SUNAT'
    case 'SUNAT_REJECTED':
      return 'Rechazada por SUNAT'
    case 'FAILED':
    case 'DEAD_LETTER':
      return 'Error'
    case 'UNKNOWN':
      return 'Estado desconocido'
    default:
      return 'En proceso'
  }
}

/** Poll hasta estado terminal o timeout. */
export async function pollBillingStatus(
  saleId: number,
  opts?: { intervalMs?: number; timeoutMs?: number; onTick?: (s: BillingStatusResponse) => void },
): Promise<BillingStatusResponse> {
  const interval = opts?.intervalMs ?? 1500
  const timeout = opts?.timeoutMs ?? 120_000
  const start = Date.now()
  for (;;) {
    const st = await billingService.getStatus(saleId)
    opts?.onTick?.(st)
    if (isBillingTerminal(st.status) || !st.async_in_progress) {
      if (st.status === 'SUNAT_ACCEPTED' || st.status === 'OBSERVED' || st.safe_to_print) {
        return st
      }
      if (isBillingTerminal(st.status)) return st
    }
    if (Date.now() - start > timeout) {
      throw new Error('Tiempo de espera agotado; el comprobante sigue en proceso')
    }
    await new Promise(r => setTimeout(r, interval))
  }
}
