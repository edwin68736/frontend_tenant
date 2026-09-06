// Categorías preestablecidas para movimientos MANUALES de caja (AddMovement) — compartidas entre
// el formulario de registrar ingreso/egreso (CashPage.tsx) y cualquier lista que muestre esos
// movimientos con una etiqueta legible (MovementsList).
export const INCOME_CATEGORIES = [
  { value: 'ingreso_manual', label: 'Ingreso manual' },
  { value: 'venta_efectivo', label: 'Venta (efectivo manual)' },
  { value: 'devolucion', label: 'Devolución' },
  { value: 'prestamo_cobro', label: 'Cobro de préstamo' },
  { value: 'otro_ingreso', label: 'Otro ingreso' },
]
export const EXPENSE_CATEGORIES = [
  { value: 'egreso_manual', label: 'Egreso manual' },
  { value: 'gasto', label: 'Gasto' },
  { value: 'retiro', label: 'Retiro' },
  { value: 'pago_proveedor', label: 'Pago a proveedor' },
  { value: 'prestamo_entrega', label: 'Préstamo entregado' },
  { value: 'otro_egreso', label: 'Otro egreso' },
]

export const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]

export function categoryLabel(value: string): string {
  if (!value) return ''
  const found = ALL_CATEGORIES.find(c => c.value === value)
  return found ? found.label : value
}
