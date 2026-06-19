import {
  DETRACCION_PAYMENT_METHOD_CODE,
  DETRACCION_PAYMENT_METHOD_NAME,
} from '@/utils/fiscalDetraction'

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  card: 'Tarjeta',
  tarjeta: 'Tarjeta',
  transfer: 'Transferencia',
  transferencia: 'Transferencia',
  credito: 'Crédito',
  credit: 'Crédito',
  [DETRACCION_PAYMENT_METHOD_CODE]: DETRACCION_PAYMENT_METHOD_NAME,
}

export function normalizePaymentMethodCode(code?: string): string {
  return String(code || '').trim().toLowerCase()
}

export function formatPaymentMethodLabel(code?: string): string {
  const normalized = normalizePaymentMethodCode(code)
  return PAYMENT_METHOD_LABELS[normalized] || code || '—'
}

export function isDetractionPaymentMethod(code?: string): boolean {
  return normalizePaymentMethodCode(code) === DETRACCION_PAYMENT_METHOD_CODE
}

export function formatOperationTypeCode(code?: string): string {
  const c = String(code || '').trim()
  if (c === '1001') return '1001 Detracción'
  if (c === '0101') return '0101 Venta interna'
  return c || '—'
}
