export function formatMoney(n: number, currency = 'PEN'): string {
  const sym = currency === 'USD' ? '$' : 'S/'
  return `${sym} ${Number(n).toFixed(2)}`
}
