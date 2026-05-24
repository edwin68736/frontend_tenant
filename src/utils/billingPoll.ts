import { billingService, type BillingStatusResponse } from '@/services/billing.service'

const TERMINAL = new Set([
  'SUNAT_ACCEPTED',
  'SUNAT_REJECTED',
  'OBSERVED',
  'FAILED',
  'DEAD_LETTER',
  'UNKNOWN',
])

/** Backoff: 1s → 2s → 4s → 8s → 15s (máx. 60s total). */
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000]
const MAX_WAIT_MS = 60_000

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

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Polling cancelado', 'AbortError'))
      return
    }
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Polling cancelado', 'AbortError'))
    }, { once: true })
  })
}

function isDone(st: BillingStatusResponse): boolean {
  if (st.status === 'SUNAT_ACCEPTED' || st.status === 'OBSERVED' || st.safe_to_print) return true
  if (isBillingTerminal(st.status)) return true
  return !st.async_in_progress && st.status !== 'PENDING_QUEUE' && st.status !== 'PENDING_FISCAL'
}

/** Poll temporal (p. ej. abortable vía SSE). No usado en envío manual — el backend espera de forma síncrona. */
export async function pollBillingStatus(
  saleId: number,
  opts?: {
    signal?: AbortSignal
    onTick?: (s: BillingStatusResponse) => void
  },
): Promise<BillingStatusResponse> {
  const start = Date.now()
  let attempt = 0

  for (;;) {
    if (opts?.signal?.aborted) {
      throw new DOMException('Polling cancelado', 'AbortError')
    }

    const st = await billingService.getStatus(saleId)
    opts?.onTick?.(st)

    if (isDone(st)) {
      return st
    }

    if (Date.now() - start >= MAX_WAIT_MS) {
      throw new Error('Tiempo de espera agotado; el comprobante sigue en proceso')
    }

    const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
    attempt++
    await sleep(wait, opts?.signal)
  }
}

/** Convierte evento SSE a respuesta mínima para toasts. */
export function statusViewFromSSE(evt: {
  status: string
  pipeline_status?: string
  sunat_message?: string
}): BillingStatusResponse {
  const pipeline = evt.pipeline_status ?? ''
  const map: Record<string, string> = {
    accepted: 'SUNAT_ACCEPTED',
    rejected: 'SUNAT_REJECTED',
    error: 'FAILED',
  }
  const status = map[evt.status] ?? (pipeline || 'UNKNOWN')
  return {
    status,
    sunat_code: '',
    cdr_received: evt.status === 'accepted',
    sunat_message: evt.sunat_message ?? '',
    xml_signed: false,
    safe_to_print: evt.status === 'accepted',
    last_attempt_at: '',
    retry_count: 0,
    job_status: '',
    billing_status: evt.status,
    pipeline_status: pipeline,
    async_in_progress: false,
  }
}
