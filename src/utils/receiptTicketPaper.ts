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

export function ticketMarginMm(mm: TicketPaperWidthMm): number {
  return mm === 58 ? 2.5 : 3
}

export function ticketMonoFontPt(mm: TicketPaperWidthMm): number {
  return mm === 58 ? 6.5 : 7
}
