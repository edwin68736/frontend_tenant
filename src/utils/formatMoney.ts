import { formatUnitPrice } from '@/utils/money'

/** Formatea montos según moneda de la venta (PEN / USD). */
export function saleCurrencySymbol(currency?: string): string {
  return currency === 'USD' ? 'US$' : 'S/'
}

export function formatSaleMoney(amount: number, currency?: string): string {
  const sym = saleCurrencySymbol(currency)
  return `${sym} ${amount.toFixed(2)}`
}

/**
 * Precio unitario de una línea (puede ser fraccionario: S/ 0.005543 por gramo). Mínimo 2 decimales y
 * hasta 6 sin ceros de relleno; usar en lugar de formatSaleMoney para "cantidad × precio unitario".
 */
export function formatSaleUnitPrice(amount: number, currency?: string): string {
  return `${saleCurrencySymbol(currency)} ${formatUnitPrice(amount)}`
}
