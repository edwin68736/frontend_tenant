import { isNativePrintAvailable } from '@/services/printers.service'

export type ErpSettingsMainTab = 'empresa' | 'usuarios' | 'impresoras' | 'contabilidad'

export type ErpCompanySubTab = 'empresa' | 'comprobantes' | 'impuestos' | 'sucursales' | 'series'

export type ErpSettingsLocationState = {
  erpSettingsTab?: ErpSettingsMainTab
  erpCompanyTab?: ErpCompanySubTab
}

export function canManageErpCompany(hasPermission: (permission: string) => boolean): boolean {
  return hasPermission('company.view')
}

/**
 * Impresoras del equipo. En app nativa siempre; en navegador también (ancho de papel 58/80 mm y
 * conexión con el Servidor de impresión), para quien opera ventas.
 */
export function canConfigureErpDevicePrinters(hasPermission?: (permission: string) => boolean): boolean {
  if (isNativePrintAvailable()) return true
  return Boolean(hasPermission && (hasPermission('sales.view') || hasPermission('sales.create') || hasPermission('sales.pos')))
}

export function canManageErpUsers(hasPermission: (permission: string) => boolean): boolean {
  return hasPermission('users.view')
}

/** Cuentas contables y credenciales SIRE: exige el módulo «accounting» del plan y su permiso propio. */
export function canManageErpAccounting(
  hasPermission: (permission: string) => boolean,
  hasModule?: (key: string) => boolean,
): boolean {
  return Boolean(hasModule && hasModule('accounting') && hasPermission('accounting.settings'))
}

export function canAccessErpSettings(
  hasPermission: (permission: string) => boolean,
  hasModule?: (key: string) => boolean,
): boolean {
  return (
    canManageErpCompany(hasPermission) ||
    canManageErpUsers(hasPermission) ||
    canConfigureErpDevicePrinters(hasPermission) ||
    canManageErpAccounting(hasPermission, hasModule)
  )
}
