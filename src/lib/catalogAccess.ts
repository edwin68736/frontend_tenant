/**
 * Permisos del catálogo de productos, en espejo del backend (RequireGlobalCatalog / products.manage_global).
 *
 *  - Catálogo GLOBAL (crear/editar/eliminar productos, categorías, marcas, unidades, imágenes, galería, unidades
 *    de venta, atributos, importaciones, precio global y costo): exige `products.manage_global` además del permiso
 *    de acción (`products.create|edit|delete`). `hasPermission` ya respeta `products.manage` (lo implica).
 *  - Lo comercial POR SUCURSAL (precio por sucursal, visibilidad por sucursal, actualización de precios de la
 *    sucursal): solo `products.edit` / `products.create` / `products.delete`.
 *
 * En modo "Todas las sucursales" (solo lectura) nada de esto se puede escribir.
 */
export type CatalogAccess = {
  /** Puede modificar el catálogo global (condición común a las demás). */
  canManageGlobal: boolean
  canCreateGlobal: boolean
  canEditGlobal: boolean
  canDeleteGlobal: boolean
  /** Precio por sucursal / visibilidad por sucursal / actualización de precios de la sucursal activa. */
  canEditBranchData: boolean
  canCreateBranchData: boolean
  canDeleteBranchData: boolean
}

export function computeCatalogAccess(hasPermission: (p: string) => boolean, canWrite: boolean): CatalogAccess {
  const global = canWrite && hasPermission('products.manage_global')
  return {
    canManageGlobal: global,
    canCreateGlobal: global && hasPermission('products.create'),
    canEditGlobal: global && hasPermission('products.edit'),
    canDeleteGlobal: global && hasPermission('products.delete'),
    canEditBranchData: canWrite && hasPermission('products.edit'),
    canCreateBranchData: canWrite && hasPermission('products.create'),
    canDeleteBranchData: canWrite && hasPermission('products.delete'),
  }
}
