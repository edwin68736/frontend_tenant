import type { PrinterConfig, PrinterPaperWidth } from './types'
import { normalizeSlot } from './storage'

/** Valida y devuelve config lista para imprimir, o null si faltan datos. */
export function resolvePrinterConfig(raw: PrinterConfig): PrinterConfig | null {
  const cfg = normalizeSlot(raw)
  const paperWidthMm: PrinterPaperWidth = cfg.paperWidthMm === 58 ? 58 : 80
  const base: PrinterConfig = { ...cfg, paperWidthMm, autoPrint: Boolean(cfg.autoPrint) }

  if (cfg.connection === 'network') {
    if (!cfg.tcpHost?.trim()) return null
    return { ...base, connection: 'network', printerName: '', tcpHost: cfg.tcpHost.trim() }
  }
  if (cfg.connection === 'bluetooth') {
    if (!cfg.bluetoothMac?.trim()) return null
    return {
      ...base,
      connection: 'bluetooth',
      printerName: '',
      tcpHost: '',
      bluetoothMac: cfg.bluetoothMac.trim(),
      bluetoothName: cfg.bluetoothName?.trim() ?? '',
    }
  }
  if (!cfg.printerName?.trim()) return null
  return {
    ...base,
    connection: 'windows',
    printerName: cfg.printerName.trim(),
    tcpHost: '',
    bluetoothMac: '',
  }
}

export function isPrinterConfigReady(cfg: PrinterConfig): boolean {
  return resolvePrinterConfig(cfg) !== null
}
