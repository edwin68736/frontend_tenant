import { WebPlugin } from '@capacitor/core'
import type { TukichefPrinterPlugin } from './tukichef-printer'

export class TukichefPrinterWeb extends WebPlugin implements TukichefPrinterPlugin {
  private fail(): never {
    throw new Error('Impresión nativa solo disponible en Android (Capacitor)')
  }

  async isBluetoothEnabled(): Promise<{ enabled: boolean }> {
    this.fail()
  }

  async requestEnableBluetooth(): Promise<{ requested: boolean }> {
    this.fail()
  }

  async checkBluetoothPermissions(): Promise<{ granted: boolean }> {
    return { granted: false }
  }

  async requestBluetoothPermissions(): Promise<{ granted: boolean }> {
    return { granted: false }
  }

  async getPairedDevices(): Promise<{ devices: [] }> {
    return { devices: [] }
  }

  async scanDevices(): Promise<{ devices: [] }> {
    return { devices: [] }
  }

  async connectPrinter(): Promise<{ connected: boolean; name?: string }> {
    this.fail()
  }

  async disconnectPrinter(): Promise<void> {
    return
  }

  async getConnectionStatus(): Promise<{ connected: boolean }> {
    return { connected: false }
  }

  async printTicket(): Promise<{ ok: boolean }> {
    this.fail()
  }

  async printTcp(): Promise<{ ok: boolean }> {
    this.fail()
  }
}
