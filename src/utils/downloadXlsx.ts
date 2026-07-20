import { downloadBlob } from '@/utils/downloadBlob'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Guarda un .xlsx generado con `writeXlsx`.
 *
 * Pasa por downloadBlob a propósito: descargar con un `<a download>` no funciona en el
 * WebView de Android (los PDF sí bajaban porque ya usaban esta vía), así que en Capacitor
 * el archivo se escribe con Filesystem en Documentos/Tukifac.
 */
export async function downloadXlsxBytes(bytes: Uint8Array, filename: string): Promise<void> {
  const blob = new Blob([new Uint8Array(bytes)], { type: XLSX_MIME })
  await downloadBlob(blob, filename)
}
