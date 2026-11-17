/**
 * Vencimiento que muestra el reporte de ventas (pantalla, PDF y Excel).
 *
 * - Venta a crédito: su fecha de vencimiento (o la de la última cuota).
 * - Venta al contado (sin vencimiento propio): la fecha de emisión, que es el vencimiento de un comprobante pagado en
 *   el acto (misma regla que se declara en el XML del comprobante electrónico).
 * - Notas de crédito/débito, retenciones y percepciones: no tienen vencimiento, se muestra «—».
 */
export function reportDueDateISO(row: { due_date?: string | null; issue_date?: string | null; doc_type?: string | null }): string {
  const own = String(row.due_date ?? '').trim()
  if (own) return own
  const dt = String(row.doc_type ?? '').toUpperCase()
  if (dt === 'NOTA_CREDITO' || dt === 'NOTA_DEBITO' || dt === 'RETENCION' || dt === 'PERCEPCION') return ''
  return String(row.issue_date ?? '').trim()
}
