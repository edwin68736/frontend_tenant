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
  const known = PAYMENT_METHOD_LABELS[normalized]
  if (known) return known
  // Código sin etiqueta propia (p. ej. "sin_definir"): se muestra legible, no con su código interno.
  const raw = String(code ?? '').trim()
  if (!raw) return '—'
  const pretty = raw.replace(/_/g, ' ').toLowerCase()
  return pretty.charAt(0).toUpperCase() + pretty.slice(1)
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
