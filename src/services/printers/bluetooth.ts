import { isCapacitorAndroid } from '@/lib/platform/detect'
import { TukichefPrinter } from '@/plugins/tukichef-printer'
import type { BluetoothDeviceInfo, PrinterConnectionStatus } from './types'

const BT_PERMISSION_MESSAGE =
  'Se necesitan permisos de Bluetooth para buscar, conectar e imprimir en la ticketera.'

export async function checkBluetoothPermissions(): Promise<boolean> {
  if (!isCapacitorAndroid()) return false
  const check = await TukichefPrinter.checkBluetoothPermissions()
  return Boolean(check.granted)
}

export async function requestBluetoothPermissions(): Promise<boolean> {
  if (!isCapacitorAndroid()) return false
  const req = await TukichefPrinter.requestBluetoothPermissions()
  return Boolean(req.granted)
}

export async function ensureBluetoothPermissions(): Promise<boolean> {
  if (!isCapacitorAndroid()) return false
  if (await checkBluetoothPermissions()) return true
  const granted = await requestBluetoothPermissions()
  if (!granted) throw new Error(BT_PERMISSION_MESSAGE)
  return true
}

export async function isBluetoothEnabled(): Promise<boolean> {
  if (!isCapacitorAndroid()) return false
  const r = await TukichefPrinter.isBluetoothEnabled()
  return Boolean(r.enabled)
}

export async function requestEnableBluetooth(): Promise<void> {
  if (!isCapacitorAndroid()) return
  await TukichefPrinter.requestEnableBluetooth()
}

export async function listPairedBluetoothPrinters(): Promise<BluetoothDeviceInfo[]> {
  if (!isCapacitorAndroid()) return []
  await ensureBluetoothPermissions()
  const r = await TukichefPrinter.getPairedDevices()
  return r.devices ?? []
}

export async function scanBluetoothPrinters(): Promise<BluetoothDeviceInfo[]> {
  if (!isCapacitorAndroid()) return []
  await ensureBluetoothPermissions()
  const enabled = await isBluetoothEnabled()
  if (!enabled) {
    await requestEnableBluetooth()
  }
  const r = await TukichefPrinter.scanDevices()
  return r.devices ?? []
}

export async function connectBluetoothPrinter(address: string): Promise<{ name?: string }> {
  if (!isCapacitorAndroid()) {
    throw new Error('Solo disponible en Android')
  }
  await ensureBluetoothPermissions()
  const r = await TukichefPrinter.connectPrinter({ address })
  return { name: r.name }
}

export async function disconnectBluetoothPrinter(): Promise<void> {
  if (!isCapacitorAndroid()) return
  await TukichefPrinter.disconnectPrinter()
}

export async function getBluetoothConnectionStatus(): Promise<PrinterConnectionStatus> {
  if (!isCapacitorAndroid()) return { connected: false }
  return TukichefPrinter.getConnectionStatus()
}
