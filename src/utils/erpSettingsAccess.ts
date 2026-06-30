import { isNativePrintAvailable } from '@/services/printers.service'

export type ErpSettingsMainTab = 'empresa' | 'impresoras'

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

export function canAccessErpSettings(hasPermission: (permission: string) => boolean): boolean {
  return canManageErpCompany(hasPermission) || canConfigureErpDevicePrinters()
}
