import type { StockMovement } from '@/services/inventory.service'

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  in: 'Entrada',
  out: 'Salida',
  adjustment_in: 'Ajuste (entrada)',
  adjustment_out: 'Ajuste (salida)',
  adjustment: 'Ajuste',
  transfer: 'Transferencia',
}

/** Inferencia legacy cuando operation_type_id es null (movimientos históricos). */
export function inferLegacyOperationLabel(m: Pick<StockMovement, 'type' | 'reference' | 'notes'>): string {
  const ref = (m.reference || '').toUpperCase()
  const type = String(m.type || '').toLowerCase()

  if (type === 'transfer') return 'Transferencia'
  if (type === 'adjustment_in' || type === 'adjustment_out' || type === 'adjustment') {
    return 'Ajuste de inventario'
  }
  if (ref.includes('COMPRA') || ref.startsWith('FC') || ref.startsWith('FACT')) {
    return 'Entrada por compra'
  }
  if (ref.includes('VENTA') || ref.includes('NV') || ref.includes('FE') || ref.includes('BOLETA')) {
    return 'Salida por venta'
  }
  if (MOVEMENT_TYPE_LABELS[type]) return MOVEMENT_TYPE_LABELS[type]
  return 'Sin clasificar'
}

/** Etiqueta de tipo de operación; nunca devuelve cadena vacía. */
export function formatOperationTypeLabel(m: StockMovement): string {
  const name = (m.operation_type_name || '').trim()
  if (name) return name
  if (m.operation_type_id) {
    const code = (m.operation_type_code || '').trim()
    return code || 'Sin clasificar'
  }
  return inferLegacyOperationLabel(m)
}

/** Código SUNAT Tabla 12; legacy sin catálogo → guión tipográfico. */
export function formatSunatCode(m: StockMovement): string {
  const code = (m.sunat_code || '').trim()
  return code || '—'
}

/** Referencia al documento de inventario asociado. */
export function formatInventoryDocumentRef(m: StockMovement): string {
  if (m.inventory_document_id) {
    const ref = (m.reference || '').trim()
    return ref || `Documento #${m.inventory_document_id}`
  }
  return '—'
}

export function fmtMovementTypeLabel(type: unknown): string {
  const k = String(type || '').toLowerCase()
  return MOVEMENT_TYPE_LABELS[k] || String(type || 'Sin clasificar')
}
