import type { Permission } from '@/services/users.service'

/** Etiquetas en español para agrupar permisos (clave interna = module en inglés). */
export const PERMISSION_MODULE_LABELS: Record<string, string> = {
  dashboard: 'Panel',
  users: 'Usuarios',
  roles: 'Roles',
  company: 'Empresa',
  contacts: 'Contactos',
  products: 'Productos',
  inventory: 'Inventario',
  sales: 'Ventas',
  purchases: 'Compras',
  cashbank: 'Caja y bancos',
  reports: 'Reportes',
  billing: 'Facturación electrónica',
  memberships: 'Membresías',
  general: 'General',
}

/** Fallback si el permiso no trae label desde la API (BD antigua). Clave: module.action */
const PERMISSION_FALLBACK_LABELS: Record<string, string> = {
  'dashboard.view': 'Ver panel',
  'users.view': 'Ver usuarios',
  'users.create': 'Crear usuarios',
  'users.edit': 'Editar usuarios',
  'users.delete': 'Eliminar usuarios',
  'roles.view': 'Ver roles',
  'roles.manage': 'Gestionar roles',
  'company.view': 'Ver configuración de empresa',
  'company.edit': 'Editar configuración de empresa',
  'contacts.view': 'Ver contactos',
  'contacts.create': 'Crear contactos',
  'contacts.edit': 'Editar contactos',
  'contacts.delete': 'Eliminar contactos',
  'products.view': 'Ver productos',
  'products.create': 'Crear productos',
  'products.edit': 'Editar productos',
  'products.delete': 'Eliminar productos',
  'inventory.view': 'Ver inventario',
  'inventory.manage': 'Gestionar inventario',
  'sales.view': 'Ver ventas',
  'sales.create': 'Crear ventas',
  'sales.edit': 'Editar ventas',
  'sales.delete': 'Eliminar ventas',
  'sales.cancel': 'Anular ventas',
  'sales.pos': 'Usar punto de venta (incluye ver productos y registrar ventas)',
  'purchases.view': 'Ver compras',
  'purchases.create': 'Crear compras',
  'purchases.edit': 'Editar compras',
  'purchases.delete': 'Eliminar compras',
  'cashbank.view': 'Ver caja y bancos',
  'cashbank.manage': 'Gestionar caja y bancos',
  'cashbank.open': 'Abrir caja (incluye ver estado de caja)',
  'cashbank.close': 'Cerrar caja (incluye ver estado de caja)',
  'cashbank.movements': 'Movimientos de caja (incluye ver estado de caja)',
  'reports.view': 'Ver reportes',
  'billing.send': 'Enviar a SUNAT',
  'memberships.view': 'Ver membresías',
  'memberships.create': 'Crear membresías',
  'memberships.edit': 'Editar membresías',
  'memberships.delete': 'Eliminar membresías',
  'memberships.generate_sale': 'Generar venta desde membresía',
}

const MODULE_ORDER = [
  'dashboard',
  'sales',
  'purchases',
  'products',
  'inventory',
  'contacts',
  'cashbank',
  'billing',
  'memberships',
  'reports',
  'company',
  'users',
  'roles',
  'general',
]

const ACTION_LABELS: Record<string, string> = {
  view: 'Ver',
  create: 'Crear',
  edit: 'Editar',
  delete: 'Eliminar',
  manage: 'Gestionar',
  cancel: 'Anular',
  pos: 'Punto de venta',
  open: 'Abrir',
  close: 'Cerrar',
  movements: 'Movimientos',
  send: 'Enviar',
  generate_sale: 'Generar venta',
}

export function getPermissionModuleLabel(module: string): string {
  const key = (module || 'general').trim().toLowerCase()
  return PERMISSION_MODULE_LABELS[key] ?? module
}

export function getPermissionDisplayLabel(permission: Pick<Permission, 'module' | 'action' | 'label'>): string {
  const trimmed = permission.label?.trim()
  if (trimmed) return trimmed

  const key = `${permission.module}.${permission.action}`
  const fallback = PERMISSION_FALLBACK_LABELS[key]
  if (fallback) return fallback

  const moduleLabel = getPermissionModuleLabel(permission.module)
  const actionLabel = ACTION_LABELS[permission.action] ?? permission.action
  return `${actionLabel} — ${moduleLabel}`
}

export function sortPermissionModules(modules: string[]): string[] {
  const order = new Map(MODULE_ORDER.map((m, i) => [m, i]))
  return [...modules].sort((a, b) => {
    const ia = order.get(a.toLowerCase()) ?? 999
    const ib = order.get(b.toLowerCase()) ?? 999
    if (ia !== ib) return ia - ib
    return getPermissionModuleLabel(a).localeCompare(getPermissionModuleLabel(b), 'es')
  })
}

/** Clave interna module.action (inglés) — útil para depuración o title. */
export function getPermissionInternalKey(permission: Pick<Permission, 'module' | 'action'>): string {
  return `${permission.module}.${permission.action}`
}
