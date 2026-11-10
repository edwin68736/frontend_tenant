/**
 * Trabajo sin guardar que se perdería al cambiar de sucursal (carrito del POS, venta/cotización/
 * compra en edición). Las pantallas lo declaran con `usePendingWork`; el selector de sucursal lo
 * consulta para pedir confirmación antes de cambiar.
 */
import { useEffect, useId } from 'react'

const registry = new Map<string, string>()

export function setPendingWork(id: string, label: string | null): void {
  if (label) registry.set(id, label)
  else registry.delete(id)
}

/** Etiquetas (sin repetir) del trabajo pendiente actual. */
export function getPendingWork(): string[] {
  return [...new Set(registry.values())]
}

export function clearPendingWork(): void {
  registry.clear()
}

/**
 * Declara trabajo pendiente mientras `active` sea true. Se retira solo al desmontar la pantalla
 * (el remontaje por sucursal lo desmonta, así no queda registro huérfano).
 */
export function usePendingWork(label: string, active: boolean): void {
  const id = useId()
  useEffect(() => {
    setPendingWork(id, active ? label : null)
    return () => setPendingWork(id, null)
  }, [id, label, active])
}

export class PendingWorkError extends Error {
  readonly labels: string[]
  constructor(labels: string[]) {
    super('Hay trabajo sin guardar')
    this.name = 'PendingWorkError'
    this.labels = labels
  }
}
