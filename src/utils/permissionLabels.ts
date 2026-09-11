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
  quotations: 'Cotizaciones',
  receivables: 'Cuentas por cobrar',
  purchases: 'Compras',
  payables: 'Cuentas por pagar',
  cashbank: 'Caja y bancos',
  billing: 'Facturación electrónica',
  fleet: 'Transportistas y flota',
  memberships: 'Membresías',
  ecommerce: 'Tienda virtual',
  modules: 'Módulos del plan',
  subscription: 'Suscripción Tukifac',
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
  'inventory.manage': 'Gestionar inventario (todo lo de abajo)',
  'inventory.create_document': 'Crear documento de ingreso/egreso',
  'inventory.confirm_document': 'Confirmar documento de inventario',
  'inventory.void_document': 'Anular documento de inventario',
  'inventory.transfer': 'Transferir entre sucursales',
  'inventory.confirm_transfer': 'Confirmar transferencia recibida',
  'inventory.cancel_transfer': 'Cancelar/revertir transferencia',
  'inventory.adjust': 'Ajustar stock',
  'inventory.import_adjustment': 'Ajuste de stock por importación',
  'sales.view': 'Ver ventas',
  'sales.create': 'Crear ventas',
  'sales.cancel': 'Anular ventas',
  'sales.pos': 'Usar punto de venta (incluye ver productos y registrar ventas)',
  'quotations.view': 'Ver cotizaciones',
  'quotations.create': 'Crear cotizaciones',
  'quotations.edit': 'Editar cotizaciones',
  'quotations.delete': 'Eliminar cotizaciones',
  'quotations.convert': 'Convertir cotización en venta',
  'receivables.view': 'Ver cuentas por cobrar',
  'receivables.collect': 'Registrar cobro (CxC)',
  'receivables.confirm_bn': 'Confirmar depósito Banco de la Nación',
  'purchases.view': 'Ver compras',
  'purchases.create': 'Crear compras',
  'purchases.delete': 'Anular compras',
  'payables.view': 'Ver cuentas por pagar',
  'payables.pay': 'Registrar pago (CxP)',
  'cashbank.view': 'Ver caja y bancos',
  'cashbank.manage': 'Gestionar caja y bancos (todo lo de abajo)',
  'cashbank.open': 'Abrir caja (incluye ver estado de caja)',
  'cashbank.close': 'Cerrar caja (incluye ver estado de caja)',
  'cashbank.movements': 'Movimientos de caja (incluye ver estado de caja)',
  'cashbank.arqueo': 'Registrar arqueo de caja',
  'billing.manage': 'Gestionar facturación electrónica (todo lo de abajo)',
  'billing.send': 'Enviar/consultar comprobantes en SUNAT',
  'billing.credit_note': 'Anular venta con nota de crédito',
  'billing.debit_note': 'Emitir nota de débito',
  'billing.despatch': 'Emitir guías de remisión',
  'billing.advanced_docs': 'Retenciones, percepciones y reversiones',
  'memberships.view': 'Ver membresías',
  'memberships.create': 'Crear membresías',
  'memberships.edit': 'Editar membresías',
  'memberships.delete': 'Eliminar membresías',
  'memberships.generate_sale': 'Generar venta desde membresía',
  'modules.manage': 'Activar/desactivar módulos',
  'ecommerce.view': 'Ver configuración de tienda virtual',
  'ecommerce.manage': 'Configurar tienda virtual',
  'ecommerce.orders': 'Gestionar pedidos web',
  'fleet.view': 'Ver transportistas, conductores y vehículos',
  'fleet.manage': 'Gestionar transportistas, conductores y vehículos',
  'subscription.view': 'Ver suscripción y facturación de Tukifac',
  'subscription.manage': 'Registrar pagos y comprar paquetes de documentos',
}

const MODULE_ORDER = [
  'dashboard',
  'sales',
  'quotations',
  'receivables',
  'purchases',
  'payables',
  'products',
  'inventory',
  'contacts',
  'cashbank',
  'billing',
  'fleet',
  'ecommerce',
  'memberships',
  'company',
  'modules',
  'subscription',
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
  arqueo: 'Arqueo',
  send: 'Enviar',
  generate_sale: 'Generar venta',
  convert: 'Convertir',
  collect: 'Cobrar',
  confirm_bn: 'Confirmar Banco de la Nación',
  pay: 'Pagar',
  create_document: 'Crear documento',
  confirm_document: 'Confirmar documento',
  void_document: 'Anular documento',
  transfer: 'Transferir',
  confirm_transfer: 'Confirmar transferencia',
  cancel_transfer: 'Cancelar transferencia',
  adjust: 'Ajustar',
  import_adjustment: 'Ajuste por importación',
  credit_note: 'Nota de crédito',
  debit_note: 'Nota de débito',
  despatch: 'Guías de remisión',
  advanced_docs: 'Documentos avanzados',
  orders: 'Pedidos',
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
