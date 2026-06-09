export type PrinterPaperWidth = 58 | 80
export type PrinterKind = 'comandas' | 'precuenta' | 'documentos'

/** windows = ticketera instalada (solo Tauri). network = TCP/IP. bluetooth = solo Android. */
export type PrinterConnectionMode = 'windows' | 'network' | 'bluetooth'

export type PrinterConfig = {
  connection: PrinterConnectionMode
  printerName: string
  tcpHost: string
  tcpPort: number
  paperWidthMm: PrinterPaperWidth
  autoPrint: boolean
  /** Etiqueta opcional (red). */
  networkPrinterLabel?: string
  bluetoothName?: string
  bluetoothMac?: string
}

export type StoredPrinterSettings = {
  version: 4
  /** Impresora de comandas por defecto (sin área o área sin impresora dedicada). */
  comandasDefault: PrinterConfig
  /** Impresoras opcionales por área de preparación (clave normalizada: cocina, bar, …). */
  comandasByArea: Record<string, PrinterConfig>
  precuenta: PrinterConfig
  documentos: PrinterConfig
}

export type BluetoothDeviceInfo = {
  name: string
  address: string
}

export type PrinterConnectionStatus = {
  connected: boolean
  name?: string
  address?: string
}

export type PrinterPlatformCapabilities = {
  windowsUsb: boolean
  network: boolean
  bluetooth: boolean
}
