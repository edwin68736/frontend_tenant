import type { BankAccount, PaymentMethodRecord } from '@/services/cashbank.service'

/** Alinea códigos con el backend (p. ej. efectivo → cash) para buscar el método configurado. */
export function normalizePaymentMethodCodeForLookup(code: string): string {
  const c = String(code ?? '').trim().toLowerCase()
  switch (c) {
    case 'efectivo':
      return 'cash'
    default:
      return c
  }
}

export function findPaymentMethodRecord(methods: PaymentMethodRecord[], code: string): PaymentMethodRecord | undefined {
  if (!methods.length) return undefined
  const want = normalizePaymentMethodCodeForLookup(code)
  return methods.find((m) => normalizePaymentMethodCodeForLookup(m.code) === want)
}

/**
 * true si el método puede registrar destino: caja, o cuenta vía `bank_account_id` en el método,
 * o cuenta activa con `payment_method` coincidente (vínculo desde Cuentas, legacy).
 */
export function isPaymentMethodLinkedForSale(pm: PaymentMethodRecord, bankAccounts: BankAccount[]): boolean {
  if (pm.destination_type === 'cash') return true
  const bid = pm.bank_account_id != null ? Number(pm.bank_account_id) : 0
  if (bid > 0) return true
  const codeNorm = normalizePaymentMethodCodeForLookup(pm.code)
  if (!codeNorm) return false
  return bankAccounts.some((a) => {
    if (!a.active) return false
    const acc = normalizePaymentMethodCodeForLookup(a.payment_method || '')
    return acc === codeNorm
  })
}
