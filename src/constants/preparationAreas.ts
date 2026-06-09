/** Áreas de preparación (solo usado por módulo comandas en printers/comandas). */
export const PREPARATION_AREAS = [
  { value: '', label: 'Sin área (usa impresora por defecto)' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'bar', label: 'Bar' },
] as const

export function preparationAreaLabel(value: string): string {
  const key = value.trim().toLowerCase()
  const found = PREPARATION_AREAS.find((a) => a.value === key)
  return found?.label ?? value
}

export function normalizePreparationAreaKey(area?: string | null): string {
  return (area ?? '').trim().toLowerCase()
}
