/**
 * Contenido de una unidad de venta («12 UND» para una caja de 12), para la vista previa antes de emitir. El comprobante emitido
 * usa el `pack_label` que el servidor congela al crear la línea; esto replica ese cálculo con los mismos símbolos del catálogo de
 * unidades (tenant_units.symbol) para que la previsualización diga lo mismo.
 */
const UNIT_SYMBOLS: Record<string, string> = {
  NIU: 'UND', KGM: 'KG', GRM: 'GR', LTR: 'LT', MLT: 'ML', MTR: 'M', CMT: 'CM', MMT: 'MM', MTK: 'M2', MTQ: 'M3',
  BX: 'CAJ', PK: 'PQT', DZN: 'DOC', BG: 'BOLS', BO: 'BOT', C62: 'PZ', CA: 'LT', GLL: 'GL', GLI: 'GL', LBR: 'LB',
  PR: 'PAR', SET: 'JGO', KT: 'KIT', RL: 'CRR', SA: 'SCO', TU: 'TB', ZZ: 'SERV',
}

export function formatPackLabel(factor: number | undefined | null, baseUnitCode: string | undefined | null): string {
  const f = Number(factor)
  const code = String(baseUnitCode ?? '').trim().toUpperCase()
  if (!Number.isFinite(f) || f <= 1 || !code) return ''
  return `${Number(f.toString())} ${UNIT_SYMBOLS[code] ?? code}`
}
