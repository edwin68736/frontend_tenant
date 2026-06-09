import { registerPlugin } from '@capacitor/core'
import type { BluetoothDeviceInfo, PrinterConnectionStatus } from '@/services/printers/types'

export type TukichefPrinterPlugin = {
  isBluetoothEnabled(): Promise<{ enabled: boolean }>
  requestEnableBluetooth(): Promise<{ requested: boolean }>
  checkBluetoothPermissions(): Promise<{ granted: boolean }>
  requestBluetoothPermissions(): Promise<{ granted: boolean }>
  getPairedDevices(): Promise<{ devices: BluetoothDeviceInfo[] }>
  scanDevices(): Promise<{ devices: BluetoothDeviceInfo[] }>
  connectPrinter(options: { address: string }): Promise<{ connected: boolean; name?: string }>
  disconnectPrinter(): Promise<void>
  getConnectionStatus(): Promise<PrinterConnectionStatus>
  printTicket(options: { dataBase64: string }): Promise<{ ok: boolean }>
  printTcp(options: { host: string; port: number; dataBase64: string }): Promise<{ ok: boolean }>
}

export const TukichefPrinter = registerPlugin<TukichefPrinterPlugin>('TukichefPrinter', {
  web: () => import('./tukichef-printer.web').then((m) => new m.TukichefPrinterWeb()),
})
