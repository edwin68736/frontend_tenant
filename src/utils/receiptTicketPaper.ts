/** Ancho de rollo térmico (config impresoras Windows / Android). */
export type TicketPaperWidthMm = 58 | 80

/** Columnas ESC/POS fuente normal: 58 mm → 32, 80 mm → 48 (estándar industria). */
export function escposColumnsForPaper(mm: TicketPaperWidthMm): number {
  return mm === 58 ? 32 : 48
}

export function normalizeTicketPaperWidth(mm: unknown): TicketPaperWidthMm {
  return mm === 58 ? 58 : 80
}

export function ticketPageWidthMm(mm: TicketPaperWidthMm): number {
  return mm
}

/**
 * Márgenes laterales del PDF ticket (mm).
 * ESC/POS usa casi todo el ancho del rollo; el visor PDF suele dejar ~1 mm extra al imprimir,
 * por eso el PDF lleva márgenes mínimos.
 */
export function ticketMarginMm(mm: TicketPaperWidthMm): number {
  return mm === 58 ? 0.6 : 0.8
}

/** Espacio superior mínimo en PDF ticket (mm). */
export function ticketTopPaddingMm(_mm: TicketPaperWidthMm): number {
  return 1
}

export function ticketMonoFontPt(mm: TicketPaperWidthMm): number {
  return mm === 58 ? 6.5 : 7
}
