/** Formatea montos según moneda de la venta (PEN / USD). */
export function saleCurrencySymbol(currency?: string): string {
  return currency === 'USD' ? 'US$' : 'S/'
}

export function formatSaleMoney(amount: number, currency?: string): string {
  const sym = saleCurrencySymbol(currency)
  return `${sym} ${amount.toFixed(2)}`
}
