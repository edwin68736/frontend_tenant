import type { PrintData } from '@/types/printData'
import { getAffectedDocSunatLabel, isCreditOrDebitNote } from '@/constants/sunat'

export interface CreditNoteReferenceLines {
  /** Tipo de nota: «01 - Anulación de la operación» (catálogo SUNAT 09/10). */
  noteTypeLabel?: string
  /** Tipo del comprobante que se modifica. */
  docTypeLabel: string
  /** Serie y correlativo del comprobante modificado, ej. B001-4. */
  docNumber: string
  reason?: string
}

/**
 * Datos que SUNAT exige en la representación impresa de una nota de crédito o débito:
 * el tipo de nota, y el tipo y número del comprobante que modifica.
 *
 * Devuelve null cuando no hay documento afectado: sin él no hay nada que declarar y es
 * preferible no imprimir un bloque a medias.
 */
export function getCreditNoteReference(data: PrintData): CreditNoteReferenceLines | null {
  if (!isCreditOrDebitNote(data.sunat_code, data.doc_type)) return null
  const docNumber = String(data.affected_doc_number ?? '').trim()
  if (!docNumber) return null
  return {
    noteTypeLabel: String(data.note_type_label ?? '').trim() || undefined,
    docTypeLabel: getAffectedDocSunatLabel(String(data.affected_doc_sunat_code ?? '').trim()),
    docNumber,
    reason: String(data.credit_note_reason ?? '').trim() || undefined,
  }
}
