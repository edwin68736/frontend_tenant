/**
 * Valores iniciales de QuickContactCreateModal cuando se abre desde el "+ Agregar «texto»" de un
 * buscador de clientes: si lo escrito es un DNI (8) o RUC (11) se carga como documento (y el modal
 * lo consulta solo); si no, se carga como nombre.
 */
export function quickAddDefaultsFromQuery(query: string, fallbackDocType: string) {
  const q = query.trim()
  const isRuc = /^\d{11}$/.test(q)
  const isDni = /^\d{8}$/.test(q)
  const isDoc = isRuc || isDni
  return {
    defaultDocType: isRuc ? '6' : isDni ? '1' : fallbackDocType,
    defaultDocNumber: isDoc ? q : undefined,
    defaultBusinessName: q && !isDoc ? q : undefined,
  }
}
