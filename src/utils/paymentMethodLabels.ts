/** Etiqueta en español para códigos de método de pago guardados en ventas / tenant_sale_payments. */
const PAYMENT_METHOD_ES: Record<string, string> = {
  cash: 'Efectivo',
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  debito: 'Tarjeta débito',
  credito: 'Crédito',
  credit: 'Crédito',
}

export function salePaymentMethodLabelEs(code: string | undefined | null): string {
  const k = String(code ?? '')
    .trim()
    .toLowerCase()
  if (!k) return '—'
  if (PAYMENT_METHOD_ES[k]) return PAYMENT_METHOD_ES[k]
  if (k.length <= 32) return k.charAt(0).toUpperCase() + k.slice(1)
  return k
}
