/**
 * Layout del detalle POS en milímetros (ancho real del rollo).
 * Las posiciones se calculan para usar casi todo `pageW - 2*margin` y alinear P.UNIT / TOTAL al borde derecho.
 */

export type TicketColumnLayoutMm = {
  innerW: number
  xQty: number
  wQty: number
  xUnit: number
  wUnit: number
  xDesc: number
  /** Ancho descripción en la 1ª línea (misma fila que cantidades y precios) */
  wDescFirst: number
  /** Ancho descripción en líneas de continuación (desde xDesc hasta borde derecho) */
  wDescCont: number
  /** X donde termina el texto de P.UNIT (alineación derecha) */
  xEndPUnit: number
  /** X donde termina el texto de TOTAL (alineación derecha) */
  xEndTotal: number
  wMoney: number
  gap: number
}

/**
 * @param pageW ancho papel mm (ej. 80)
 * @param margin márgenes laterales mm (ej. 5)
 */
export function ticketColumnLayoutMm(options: {
  pageW: number
  margin: number
  /** Ancho columna importe (P.UNIT y TOTAL) */
  wMoneyMm?: number
  wQtyMm?: number
  wUnitMm?: number
  gapMm?: number
}): TicketColumnLayoutMm {
  const { pageW, margin } = options
  const gap = options.gapMm ?? 1
  const wMoney = options.wMoneyMm ?? 16
  const wQty = options.wQtyMm ?? 7
  const wUnit = options.wUnitMm ?? 9
  const innerW = pageW - 2 * margin
  const xQty = margin
  const xUnit = xQty + wQty + gap
  const xEndTotal = pageW - margin
  const xEndPUnit = xEndTotal - wMoney - gap
  const xStartPUnit = xEndPUnit - wMoney
  const xDesc = xUnit + wUnit + gap
  const wDescFirst = Math.max(12, xStartPUnit - gap - xDesc)
  const wDescCont = pageW - margin - xDesc

  return {
    innerW,
    xQty,
    wQty,
    xUnit,
    wUnit,
    xDesc,
    wDescFirst,
    wDescCont,
    xEndPUnit,
    xEndTotal,
    wMoney,
    gap,
  }
}
