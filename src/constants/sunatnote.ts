/**
 * Catálogos SUNAT de motivo de nota — espejo de pkg/sunatnote/catalog.go en el backend.
 * Mantener ambos sincronizados: el backend valida contra el suyo, así que un código que no
 * exista ahí se rechaza aunque el selector lo muestre.
 */

export type NoteReason = { code: string; label: string }

/** Catálogo 09 — tipo de nota de crédito electrónica. */
export const CREDIT_NOTE_REASONS: NoteReason[] = [
  { code: '01', label: 'Anulación de la operación' },
  { code: '02', label: 'Anulación por error en el RUC' },
  { code: '03', label: 'Corrección por error en la descripción' },
  { code: '04', label: 'Descuento global' },
  { code: '05', label: 'Descuento por ítem' },
  { code: '06', label: 'Devolución total' },
  { code: '07', label: 'Devolución por ítem' },
  { code: '08', label: 'Bonificación' },
  { code: '09', label: 'Disminución en el valor' },
  { code: '10', label: 'Otros conceptos' },
  { code: '11', label: 'Ajustes de operaciones de exportación' },
  { code: '12', label: 'Ajustes afectos al IVAP' },
  { code: '13', label: 'Ajustes - montos y/o fechas de pago' },
]

/** Catálogo 10 — tipo de nota de débito electrónica. */
export const DEBIT_NOTE_REASONS: NoteReason[] = [
  { code: '01', label: 'Intereses por mora' },
  { code: '02', label: 'Aumento en el valor' },
  { code: '03', label: 'Penalidades / otros conceptos' },
  { code: '11', label: 'Ajustes de operaciones de exportación' },
  { code: '12', label: 'Ajustes afectos al IVAP' },
]

/**
 * Motivos que mueven bienes concretos — espejo de partialCreditNoteReasonCodes en el backend
 * (note_partial.go). Ahí el formulario pide elegir ítems y cantidades (Fase 2) en vez de
 * copiar el 100% de la venta. El resto (02, 03, 11, 12, 13) no mueve mercadería: sigue
 * copiando todo, sin selector.
 */
export const CREDIT_NOTE_PARTIAL_REASON_CODES = new Set(['04', '05', '06', '07', '08', '09', '10'])
