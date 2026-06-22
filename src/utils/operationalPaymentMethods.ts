import type { PaymentMethodRecord } from '@/services/cashbank.service'

/** Medios de cobro reales; defensivo ante respuestas legacy mezcladas. */
export function isOperationalPaymentMethod(pm: Pick<PaymentMethodRecord, 'code' | 'destination_type'>): boolean {
  const code = String(pm.code ?? '').trim().toLowerCase()
  if (code === 'detraccion_bn' || code === 'credito' || code === 'credit') return false
  const dest = String(pm.destination_type ?? '').trim().toLowerCase()
  if (dest === 'detraction' || dest === 'receivable') return false
  return true
}

export function filterOperationalPaymentMethods(list: PaymentMethodRecord[]): PaymentMethodRecord[] {
  return (list ?? []).filter(isOperationalPaymentMethod)
}

/** Preferir efectivo; nunca devolver internos como fallback. */
export function defaultOperationalPaymentCode(methods: PaymentMethodRecord[]): string {
  const ops = filterOperationalPaymentMethods(methods)
  const cash = ops.find((m) => String(m.code).toLowerCase() === 'cash')
  if (cash) return cash.code
  return ops[0]?.code ?? 'cash'
}

export function findOperationalPaymentMethod(
  methods: PaymentMethodRecord[],
  code: string,
): PaymentMethodRecord | undefined {
  const norm = String(code ?? '').trim().toLowerCase()
  return filterOperationalPaymentMethods(methods).find((m) => String(m.code).trim().toLowerCase() === norm)
}
