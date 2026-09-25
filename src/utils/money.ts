/** Precisión interna alineada con backend pkg/money (SUNAT / BD). */
export const SUNAT_DECIMALS = 6
export const DISPLAY_DECIMALS = 2

/** Tolerancia al comparar pagos ingresados (2 decimales) vs total. */
export const PAYMENT_TOLERANCE = 0.01

/** Redondeo fiscal / payload / BD (6 decimales). */
export function roundSunat(n: number): number {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.round(x * 1e6) / 1e6
}

/** Alias explícito: precisión interna de negocio. */
export const roundMoneyPrecision = roundSunat

/** Redondeo solo para comparación visual / UI (2 decimales). */
export function roundDisplay(n: number): number {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.round(x * 100) / 100
}

/** Suma monetaria con precisión interna (evita deriva flotante acumulada). */
export function sumMoney(...values: number[]): number {
  return roundSunat(values.reduce((s, v) => roundSunat(s + (Number(v) || 0)), 0))
}

/**
 * Texto para UI: siempre 2 decimales (no usar en payloads ni antes de guardar).
 * Ej: 96.99000000001 → "96.99", 12 → "12.00"
 */
export function formatAmountDisplay(n: number): string {
  return roundDisplay(n).toFixed(DISPLAY_DECIMALS)
}

/**
 * Parsea entrada de usuario → precisión interna (6 dec).
 * No trunca a 2 decimales al guardar.
 */
export function parseMoneyInput(raw: string): number {
  let cleaned = String(raw ?? '')
    .trim()
    .replace(/[^0-9.,-]+/g, '')
  if (!cleaned) return 0
  if (cleaned.includes(',') && !cleaned.includes('.')) cleaned = cleaned.replace(',', '.')
  cleaned = cleaned.replace(/,/g, '')
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return 0
  return roundSunat(n)
}

export function paidCoversTotal(paid: number, expected: number): boolean {
  return roundDisplay(paid) + PAYMENT_TOLERANCE >= roundDisplay(expected)
}

/** Vuelto cuando el cliente entrega más del monto a pagar. */
export function calcPaymentChange(paid: number, payable: number): number {
  return Math.max(0, roundDisplay(paid - payable))
}

/** El vuelto solo puede salir de efectivo — mismo código que usa el catálogo de métodos de pago. */
export function isCashPaymentCode(code: string | null | undefined): boolean {
  return String(code ?? '').trim().toLowerCase() === 'cash'
}

/**
 * Excedente que ningún método no-efectivo puede cubrir por sí solo (no existe "vuelto" real por
 * Yape/Plin/tarjeta/transferencia). Devuelve 0 si los métodos no-efectivo no superan el total a
 * pagar; en otro caso, el excedente que hay que corregir (agregando efectivo o reduciendo el
 * monto) antes de poder guardar la venta. Mismo criterio que backend_go
 * (sale_service.go::sumNonCashDirectPayments + validación en SaleService.Create).
 */
export function nonCashOverpay(
  payments: Array<{ method: string; amount: number | string }>,
  payable: number,
): number {
  const nonCash = sumMoney(
    ...payments.filter((p) => !isCashPaymentCode(p.method)).map((p) => Number(p.amount) || 0),
  )
  const excess = roundDisplay(nonCash) - roundDisplay(payable)
  return excess > PAYMENT_TOLERANCE ? roundDisplay(excess) : 0
}
