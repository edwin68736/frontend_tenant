export function formatMoney(n: number, currency = 'PEN'): string {
  const sym = currency === 'USD' ? '$' : 'S/'
  return `${sym} ${Number(n).toFixed(2)}`
}

/** El backend guarda `number` como SERIE-00001234; no concatenar la serie otra vez. */
export function formatSaleDocumentNumber(series: string, numberRaw: string | number | undefined): string {
  const s = String(series ?? '').trim()
  const n = String(numberRaw ?? '').trim()
  if (!n) return s
  if (n.includes('-')) return n
  if (/^\d+$/.test(n) && s) return `${s}-${n.padStart(8, '0')}`
  if (s) return `${s}-${n}`
  return n
}
