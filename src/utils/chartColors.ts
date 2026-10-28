/**
 * Paleta de gráficos del dashboard. Colores fijos y bien separados entre sí (no depende del color
 * de marca del tenant: con un tema violeta o verde la primera porción coincidía con otra de la
 * paleta y dos datos salían del mismo color). Las dos primeras posiciones son las más distintas,
 * porque lo más común son gráficos de 2-3 porciones.
 */
const BASE_COLORS = [
  '#2563eb', // azul
  '#f97316', // naranja
  '#10b981', // verde
  '#7c3aed', // violeta
  '#ef4444', // rojo
  '#06b6d4', // cian
  '#eab308', // amarillo
  '#ec4899', // rosa
  '#65a30d', // lima
  '#0f766e', // verde azulado
  '#92400e', // marrón
  '#64748b', // gris azulado
]

/** Color de la porción `index`; pasada la paleta base se generan tonos distintos (ángulo áureo). */
export function chartColor(index: number): string {
  if (index < BASE_COLORS.length) return BASE_COLORS[index]
  const n = index - BASE_COLORS.length
  const hue = Math.round((n * 137.508) % 360)
  const light = 42 + ((n >> 2) % 3) * 8
  return `hsl(${hue} 65% ${light}%)`
}
