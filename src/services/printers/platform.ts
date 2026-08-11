import { isCapacitorAndroid, isTauriDesktop } from '@/lib/platform/detect'
import type { PrinterConnectionMode, PrinterPlatformCapabilities } from './types'

export function getPrinterPlatformCapabilities(): PrinterPlatformCapabilities {
  return {
    windowsUsb: isTauriDesktop(),
    network: isTauriDesktop() || isCapacitorAndroid(),
    bluetooth: isCapacitorAndroid(),
  }
}

/** Conexiones válidas en la plataforma actual. */
export function availableConnectionModes(): PrinterConnectionMode[] {
  const cap = getPrinterPlatformCapabilities()
  const modes: PrinterConnectionMode[] = []
  if (cap.windowsUsb) modes.push('windows')
  if (cap.network) modes.push('network')
  if (cap.bluetooth) modes.push('bluetooth')
  return modes
}

export function defaultConnectionForPlatform(): PrinterConnectionMode {
  const modes = availableConnectionModes()
  if (modes.includes('windows')) return 'windows'
  if (modes.includes('network')) return 'network'
  return modes[0] ?? 'network'
}

/**
 * Modo de conexión real según plataforma y datos guardados.
 *
 * Antes, una config nueva/legacy quedaba con connection="windows" fijo (ver emptySlot en
 * storage.ts) sin importar la plataforma. En Android, la pantalla de ajustes mostraba "Red
 * (TCP/IP)" resaltada como corrección solo visual (un cálculo aparte para el render), pero el
 * valor real guardado seguía siendo "windows" — así que al tocar "Probar impresión" con una IP
 * ya cargada, el envío usaba ese valor crudo y caía en el guard de Windows/escritorio, tirando
 * "Impresora Windows solo disponible en escritorio" en pleno Android. effectiveConnection corrige
 * el valor de verdad (no solo cómo se ve) apenas hay datos de red/bluetooth cargados, y
 * normalizeSlot (storage.ts) lo aplica antes de guardar — mismo patrón ya probado en
 * frontend_restaurant_tenant.
 */
export function effectiveConnection(cfg: {
  connection: PrinterConnectionMode
  tcpHost?: string
  bluetoothMac?: string
}): PrinterConnectionMode {
  const modes = availableConnectionModes()
  const hasTcp = Boolean(cfg.tcpHost?.trim())
  const hasBt = Boolean(cfg.bluetoothMac?.trim())

  if (isCapacitorAndroid()) {
    // La elección explícita del usuario manda si es un modo disponible; la inferencia por datos
    // guardados queda solo como fallback (config vacía/legacy).
    if (modes.includes(cfg.connection)) return cfg.connection
    if (hasBt && modes.includes('bluetooth')) return 'bluetooth'
    if (hasTcp && modes.includes('network')) return 'network'
    if (modes.includes('bluetooth')) return 'bluetooth'
    if (modes.includes('network')) return 'network'
    return modes[0] ?? 'network'
  }

  if (modes.includes(cfg.connection)) return cfg.connection
  if (hasTcp && modes.includes('network')) return 'network'
  if (hasBt && modes.includes('bluetooth')) return 'bluetooth'
  return defaultConnectionForPlatform()
}

export function connectionModeLabel(mode: PrinterConnectionMode): string {
  if (mode === 'windows') return 'Impresora Windows'
  if (mode === 'bluetooth') return 'Bluetooth'
  return 'Red (TCP/IP)'
}
