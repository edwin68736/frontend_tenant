import type { PaymentMethod, PaymentMethodType } from '@/services/ecommerce.service'

export const PAYMENT_TYPE_OPTIONS: { value: PaymentMethodType; label: string }[] = [
  { value: 'yape', label: 'Yape' },
  { value: 'plin', label: 'Plin' },
  { value: 'bank', label: 'Cuenta bancaria / transferencia' },
  { value: 'cash', label: 'Efectivo / contra entrega' },
  { value: 'other', label: 'Otro' },
]

export function defaultPaymentLabel(type: PaymentMethodType): string {
  return PAYMENT_TYPE_OPTIONS.find((o) => o.value === type)?.label.split(' / ')[0] ?? 'Otro'
}

/** Nombre que ve el cliente: la etiqueta propia o, si está vacía, la del tipo. */
export function paymentDisplayName(m: PaymentMethod): string {
  return m.label.trim() || (m.type === 'bank' && m.bank.trim() ? m.bank.trim() : defaultPaymentLabel(m.type))
}

/** Líneas "Etiqueta: valor" con los datos a los que el cliente debe pagar. */
export function paymentDetailLines(m: PaymentMethod): { k: string; v: string }[] {
  const out: { k: string; v: string }[] = []
  const add = (k: string, v: string) => {
    if (v.trim()) out.push({ k, v: v.trim() })
  }
  if (m.type === 'bank') add('Banco', m.bank)
  add(m.type === 'bank' ? 'N° de cuenta' : 'Número', m.account)
  if (m.type === 'bank') add('CCI', m.cci)
  add('Titular', m.holder)
  add('Nota', m.note)
  return out
}
