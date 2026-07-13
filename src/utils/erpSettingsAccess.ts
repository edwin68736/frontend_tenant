import { isNativePrintAvailable } from '@/services/printers.service'

export type ErpSettingsMainTab = 'empresa' | 'usuarios' | 'impresoras'

export type ErpCompanySubTab = 'empresa' | 'comprobantes' | 'impuestos' | 'sucursales' | 'series'

export type ErpSettingsLocationState = {
  erpSettingsTab?: ErpSettingsMainTab
  erpCompanyTab?: ErpCompanySubTab
}

export function canManageErpCompany(hasPermission: (permission: string) => boolean): boolean {
  return hasPermission('company.view')
}

export function canConfigureErpDevicePrinters(): boolean {
  return isNativePrintAvailable()
}

export function canManageErpUsers(hasPermission: (permission: string) => boolean): boolean {
  return hasPermission('users.view')
}

export function canAccessErpSettings(hasPermission: (permission: string) => boolean): boolean {
  return (
    canManageErpCompany(hasPermission) ||
    canManageErpUsers(hasPermission) ||
    canConfigureErpDevicePrinters()
  )
}
