/**
 * Un JWT emitido ANTES de que se sembrara un permiso nuevo (p. ej. products.manage_global, migración V177) no lo trae
 * aunque el rol ya lo tenga: la interfaz ocultaría acciones que el servidor sí permite. Quien puede escribir productos
 * pero no ve products.manage_global ni products.manage tiene, casi seguro, un token anterior a V177: se renueva UNA vez
 * por carga de página con el refresh token para obtener los permisos vigentes del rol.
 */
export function hasStaleProductPermissions(permissions: readonly string[]): boolean {
  const can = (p: string) => permissions.includes(p)
  const writesProducts = can('products.create') || can('products.edit') || can('products.delete')
  return writesProducts && !can('products.manage_global') && !can('products.manage')
}
