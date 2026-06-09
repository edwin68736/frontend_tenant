import { isCapacitorAndroid, isTauriDesktop } from '@/lib/platform/detect'
import { TukichefPrinter } from '@/plugins/tukichef-printer'
import type { PrinterConfig, PrinterConnectionMode } from './types'
import { clampPort, DEFAULT_TCP_PORT } from './storage'

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

async function printViaTauri(
  connection: 'windows' | 'network',
  cfg: Pick<PrinterConfig, 'printerName' | 'tcpHost' | 'tcpPort'>,
  data: Uint8Array,
  docName?: string,
): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core')
  const dataBase64 = uint8ToBase64(data)
  const port = clampPort(cfg.tcpPort ?? DEFAULT_TCP_PORT)
  const out = await invoke<string>('printers_print_raw', {
    input: {
      mode: connection,
      printer_name: cfg.printerName ?? '',
      tcp_host: cfg.tcpHost ?? '',
      tcp_port: port,
      data_base64: dataBase64,
      doc_name: docName ?? null,
    },
  })
  return typeof out === 'string' ? out : 'OK'
}

async function printViaCapacitor(cfg: PrinterConfig, data: Uint8Array): Promise<string> {
  if (!isCapacitorAndroid()) {
    throw new Error('Impresión nativa no disponible en este dispositivo')
  }
  const dataBase64 = uint8ToBase64(data)
  if (cfg.connection === 'bluetooth') {
    if (!cfg.bluetoothMac?.trim()) {
      throw new Error('No hay impresora Bluetooth configurada')
    }
    const status = await TukichefPrinter.getConnectionStatus()
    if (!status.connected || status.address !== cfg.bluetoothMac.trim()) {
      await TukichefPrinter.connectPrinter({ address: cfg.bluetoothMac.trim() })
    }
    await TukichefPrinter.printTicket({ dataBase64 })
    return 'Enviado por Bluetooth'
  }
  if (cfg.connection === 'network') {
    if (!cfg.tcpHost?.trim()) {
      throw new Error('Indica la IP de la impresora')
    }
    await TukichefPrinter.printTcp({
      host: cfg.tcpHost.trim(),
      port: clampPort(cfg.tcpPort),
      dataBase64,
    })
    return `Enviado por TCP a ${cfg.tcpHost.trim()}`
  }
  throw new Error('Método de impresión no soportado en Android')
}

/** Envía bytes ESC/POS según configuración y plataforma. */
export async function sendEscPosPayload(
  cfg: PrinterConfig,
  data: Uint8Array,
  docName?: string,
): Promise<string> {
  if (cfg.connection === 'windows') {
    if (!isTauriDesktop()) {
      throw new Error('Impresora Windows solo disponible en escritorio')
    }
    if (!cfg.printerName?.trim()) {
      throw new Error('Selecciona una impresora Windows')
    }
    return printViaTauri('windows', cfg, data, docName)
  }

  if (cfg.connection === 'network') {
    if (!cfg.tcpHost?.trim()) {
      throw new Error('Indica la IP o host de la impresora')
    }
    if (isTauriDesktop()) {
      return printViaTauri('network', cfg, data, docName)
    }
    if (isCapacitorAndroid()) {
      return printViaCapacitor(cfg, data)
    }
    throw new Error('Impresión por red no disponible')
  }

  if (cfg.connection === 'bluetooth') {
    if (!isCapacitorAndroid()) {
      throw new Error('Bluetooth solo disponible en Android')
    }
    return printViaCapacitor(cfg, data)
  }

  throw new Error('Método de conexión desconocido')
}

export function isNativePrintAvailable(): boolean {
  return isTauriDesktop() || isCapacitorAndroid()
}

export function connectionForTauriTest(mode: PrinterConnectionMode): 'windows' | 'network' {
  return mode === 'network' ? 'network' : 'windows'
}
