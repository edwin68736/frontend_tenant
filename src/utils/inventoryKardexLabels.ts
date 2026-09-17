import type { StockMovement } from '@/services/inventory.service'
import { resolveSaleUnitNames, saleLineUnitLabel } from '@/utils/saleUnitNames'

/**
 * StockMovement + nombre comercial de la SaleUnit YA resuelto (Fase 7I) — se calcula una sola vez
 * tras cargar los movimientos y viaja pegado a cada fila, para que tanto la tabla en pantalla como
 * las columnas de exportación (PDF/Excel) lean el mismo valor sin depender de un mapa externo por
 * closure. Solo texto informativo: `quantity`/`balance` (unidad base) no cambian de significado ni
 * se recalculan a partir de esto — decisión explícita, no se muestra `sale_unit_quantity` ni
 * `conversion_factor` en ningún punto de esta fase.
 */
export type KardexRow = StockMovement & { sale_unit_label?: string }

/**
 * Resuelve y adjunta el nombre comercial de la SaleUnit a cada movimiento que la tenga
 * (sale_unit_id != null). Un movimiento legacy no gana ninguna etiqueta nueva — se devuelve tal
 * cual, sin tocarlo, para que su apariencia no cambie en ningún lugar que use este helper.
 * Se llama una vez por cada lote de movimientos que llega del backend (pantalla o exportación por
 * separado) — nunca reutiliza un resultado resuelto para un lote distinto.
 */
export async function attachSaleUnitLabels(movements: StockMovement[]): Promise<KardexRow[]> {
  const withSaleUnit = movements.filter((m) => m.sale_unit_id != null)
  if (withSaleUnit.length === 0) return movements
  const names = await resolveSaleUnitNames(withSaleUnit)
  return movements.map((m) =>
    m.sale_unit_id != null ? { ...m, sale_unit_label: saleLineUnitLabel(m, names) } : m,
  )
}

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
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
