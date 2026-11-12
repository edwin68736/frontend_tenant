/**
 * Recargo al consumo (DL 25988, hoteles/restaurantes): porcentaje sobre el valor de venta SIN IGV
 * (ya con descuentos). No lleva IGV y se suma al total a pagar. Idéntico al cálculo del servidor.
 */
export const MAX_SERVICE_CHARGE_RATE = 13

/** Redondeo a 2 decimales (mitad hacia arriba), igual que round2 del servidor. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** ¿El porcentaje es válido para el recargo? (0 < rate ≤ 13) */
export function isValidServiceChargeRate(rate: number): boolean {
  return Number.isFinite(rate) && rate > 0 && rate <= MAX_SERVICE_CHARGE_RATE
}

/** Monto del recargo: base × rate/100 a 2 decimales; 0 si la base ≤ 0 o el % es inválido. */
export function serviceChargeAmount(base: number, rate: number): number {
  if (!(base > 0) || !isValidServiceChargeRate(rate)) return 0
  return round2((base * rate) / 100)
}

/** Etiqueta de fila, p. ej. «Recargo al consumo (10 %)». */
export function serviceChargeLabel(rate?: number | null): string {
  const r = Number(rate) || 0
  if (r <= 0) return 'Recargo al consumo'
  return `Recargo al consumo (${Number(r.toFixed(2))} %)`
}
