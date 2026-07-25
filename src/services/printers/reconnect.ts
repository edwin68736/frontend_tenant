import { isCapacitorAndroid } from '@/lib/platform/detect'
import { loadStoredPrinterSettings } from './storage'
import { connectBluetoothPrinter, getBluetoothConnectionStatus } from './bluetooth'
import type { PrinterConfig, PrinterConnectionStatus, StoredPrinterSettings } from './types'

/** MAC de la primera impresora Bluetooth configurada entre todos los slots. */
function primaryBluetoothMac(settings: StoredPrinterSettings): string {
  const slots: (PrinterConfig | undefined)[] = [
    settings.comandasDefault,
    settings.documentos,
    settings.precuenta,
    ...Object.values(settings.comandasByArea ?? {}),
  ]
  for (const s of slots) {
    if (s?.connection === 'bluetooth' && s.bluetoothMac?.trim()) {
      return s.bluetoothMac.trim()
    }
  }
  return ''
}

let reconnecting = false

/**
 * Reconecta la impresora Bluetooth configurada. Se llama al abrir la app y al volver del
 * segundo plano: Android cierra el socket RFCOMM cuando la app se va o la pantalla se apaga,
 * y sin esto la conexión solo se recuperaba al intentar imprimir.
 *
 * El plugin nativo mantiene UN solo socket, así que se reconecta a la impresora principal;
 * imprimir a otra Bluetooth la reconecta bajo demanda (lógica ya existente en transport).
 * Silencioso: si falla, no molesta al usuario; el próximo intento de impresión reconecta.
 */
export async function reconnectBluetoothPrinter(): Promise<void> {
  if (!isCapacitorAndroid() || reconnecting) return

  const mac = primaryBluetoothMac(loadStoredPrinterSettings())
  if (!mac) return

  reconnecting = true
  try {
    const status: PrinterConnectionStatus = await getBluetoothConnectionStatus().catch(() => ({
      connected: false,
    }))
    if (status.connected && status.address === mac) return // ya conectada a la correcta

    // Un reintento: el connect RFCOMM puede fallar de forma transitoria justo al reanudar.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await connectBluetoothPrinter(mac)
        return
      } catch {
        if (attempt === 0) await new Promise((r) => setTimeout(r, 1200))
      }
    }
  } finally {
    reconnecting = false
  }
}
