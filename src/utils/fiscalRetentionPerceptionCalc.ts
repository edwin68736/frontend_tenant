export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function calcObligationFromPayment(pagoImporte: number, tasa: number): { obligation: number; net: number } {
  const obligation = roundMoney((pagoImporte * tasa) / 100)
  const net = roundMoney(pagoImporte - obligation)
  return { obligation, net }
}

export function sumDetailPayments(pagos: Array<{ importe: number }>): number {
  return roundMoney(pagos.reduce((s, p) => s + (Number(p.importe) || 0), 0))
}
