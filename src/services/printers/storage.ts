import type { PrinterConfig, PrinterConnectionMode, StoredPrinterSettings } from './types'

export const PRINTER_SETTINGS_STORAGE_KEY_V3 = 'tukifac_printer_settings_v1'
const PRINTER_SETTINGS_STORAGE_KEY_V2 = 'tukichef_kitchen_printer_settings_v2'
const PRINTER_SETTINGS_STORAGE_KEY_V1 = 'tukichef_kitchen_printer_settings_v1'
const LEGACY_PRINTER_KEY_V2 = 'bendey_kitchen_printer_settings_v2'
const LEGACY_PRINTER_KEY_V1 = 'bendey_kitchen_printer_settings_v1'

export const DEFAULT_TCP_PORT = 9100

export function clampPort(n: unknown): number {
  const p = Math.floor(Number(n))
  if (!Number.isFinite(p) || p < 1) return DEFAULT_TCP_PORT
  if (p > 65535) return 65535
  return p
}

function normalizeConnection(raw: unknown): PrinterConnectionMode {
  if (raw === 'network' || raw === 'bluetooth') return raw
  return 'windows'
}

export function normalizeSlot(raw: Partial<PrinterConfig> | undefined): PrinterConfig {
  const connection = normalizeConnection(raw?.connection)
  return {
    connection,
    printerName: String(raw?.printerName ?? '').trim(),
    tcpHost: String(raw?.tcpHost ?? '').trim(),
    tcpPort: clampPort(raw?.tcpPort ?? DEFAULT_TCP_PORT),
    paperWidthMm: raw?.paperWidthMm === 58 ? 58 : 80,
    autoPrint: raw?.autoPrint !== false,
    networkPrinterLabel: String(raw?.networkPrinterLabel ?? '').trim(),
    bluetoothName: String(raw?.bluetoothName ?? '').trim(),
    bluetoothMac: String(raw?.bluetoothMac ?? '').trim(),
  }
}

function emptySlot(): PrinterConfig {
  return {
    connection: 'windows',
    printerName: '',
    tcpHost: '',
    tcpPort: DEFAULT_TCP_PORT,
    paperWidthMm: 80,
    autoPrint: true,
    networkPrinterLabel: '',
    bluetoothName: '',
    bluetoothMac: '',
  }
}

export function normalizeByAreaRecord(
  raw: Record<string, Partial<PrinterConfig>> | undefined,
): Record<string, PrinterConfig> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, PrinterConfig> = {}
  for (const [key, val] of Object.entries(raw)) {
    const k = key.trim().toLowerCase()
    if (!k) continue
    out[k] = normalizeSlot(val)
  }
  return out
}

export function emptyPrinterSettings(): StoredPrinterSettings {
  return {
    version: 4,
    comandasDefault: emptySlot(),
    comandasByArea: {},
    precuenta: emptySlot(),
    documentos: emptySlot(),
  }
}

function migrateToV4(parsed: Record<string, unknown>): StoredPrinterSettings | null {
  if (parsed.comandasDefault && typeof parsed.comandasDefault === 'object') {
    return {
      version: 4,
      comandasDefault: normalizeSlot(parsed.comandasDefault as Partial<PrinterConfig>),
      comandasByArea: normalizeByAreaRecord(
        parsed.comandasByArea as Record<string, Partial<PrinterConfig>>,
      ),
      precuenta: normalizeSlot(parsed.precuenta as Partial<PrinterConfig>),
      documentos: normalizeSlot(parsed.documentos as Partial<PrinterConfig>),
    }
  }
  if (parsed.comandas && typeof parsed.comandas === 'object') {
    return {
      version: 4,
      comandasDefault: normalizeSlot(parsed.comandas as Partial<PrinterConfig>),
      comandasByArea: normalizeByAreaRecord(
        parsed.comandasByArea as Record<string, Partial<PrinterConfig>>,
      ),
      precuenta: normalizeSlot(parsed.precuenta as Partial<PrinterConfig>),
      documentos: normalizeSlot(parsed.documentos as Partial<PrinterConfig>),
    }
  }
  return null
}

function parseLegacyJson(raw: string): StoredPrinterSettings | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return migrateToV4(parsed)
  } catch {
    return null
  }
}

export function loadStoredPrinterSettings(): StoredPrinterSettings {
  if (typeof window === 'undefined') return emptyPrinterSettings()
  const keys = [
    PRINTER_SETTINGS_STORAGE_KEY_V3,
    PRINTER_SETTINGS_STORAGE_KEY_V2,
    PRINTER_SETTINGS_STORAGE_KEY_V1,
    LEGACY_PRINTER_KEY_V2,
    LEGACY_PRINTER_KEY_V1,
  ]
  for (const key of keys) {
    const raw = localStorage.getItem(key)
    if (!raw) continue
    const parsed = parseLegacyJson(raw)
    if (parsed) {
      saveStoredPrinterSettings(parsed)
      return parsed
    }
  }
  return emptyPrinterSettings()
}

export function saveStoredPrinterSettings(v: StoredPrinterSettings) {
  if (typeof window === 'undefined') return
  try {
    const payload: StoredPrinterSettings = {
      version: 4,
      comandasDefault: normalizeSlot(v.comandasDefault),
      comandasByArea: normalizeByAreaRecord(v.comandasByArea),
      precuenta: normalizeSlot(v.precuenta),
      documentos: normalizeSlot(v.documentos),
    }
    localStorage.setItem(PRINTER_SETTINGS_STORAGE_KEY_V3, JSON.stringify(payload))
  } catch {
    /* quota */
  }
}
