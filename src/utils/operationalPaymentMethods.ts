import type { PaymentMethodRecord } from '@/services/cashbank.service'

/** Medios de cobro reales; defensivo ante respuestas legacy mezcladas. */
export function isOperationalPaymentMethod(pm: Pick<PaymentMethodRecord, 'code' | 'destination_type'>): boolean {
  const code = String(pm.code ?? '').trim().toLowerCase()
  if (code === 'detraccion_bn' || code === 'credito' || code === 'credit') return false
  const dest = String(pm.destination_type ?? '').trim().toLowerCase()
  if (dest === 'detraction' || dest === 'receivable') return false
  return true
}

/** Sentido en que se usa el método: cobros (ventas, CxC) o pagos (compras, CxP). Sin sentido no se filtra. */
export type PaymentDirection = 'income' | 'expense'

export function methodAppliesTo(pm: Pick<PaymentMethodRecord, 'applies_to'>, direction: PaymentDirection): boolean {
  const a = pm.applies_to
  return !a || a === 'both' || a === direction
}

export function filterOperationalPaymentMethods(list: PaymentMethodRecord[], direction?: PaymentDirection): PaymentMethodRecord[] {
  return (list ?? []).filter((pm) => isOperationalPaymentMethod(pm) && (!direction || methodAppliesTo(pm, direction)))
}

/** Primera línea que usa un método que exige referencia y no la trae (null = todo en orden). */
export function missingRequiredReference(
  methods: PaymentMethodRecord[],
  lines: { method: string; reference?: string }[],
): PaymentMethodRecord | null {
  for (const l of lines) {
    if ((l.reference ?? '').trim()) continue
    const pm = findOperationalPaymentMethod(methods, l.method)
    if (pm?.requires_reference) return pm
  }
  return null
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
