import { toast } from 'sonner'
import type { PrintData } from '@/types/printData'
import { isCapacitorAndroid, isTauriDesktop } from '@/lib/platform/detect'
import { getConfiguredPrinter } from '@/services/printers.service'
import { printDataToPdfBlob, receiptPdfFileName } from '@/utils/receiptPdf'
import { downloadBlob } from '@/utils/downloadBlob'
import { openExternalUrl } from '@/utils/supportWhatsApp'

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('No se pudo leer el archivo'))
        return
      }
      const base64 = result.split(',')[1]
      if (!base64) {
        reject(new Error('No se pudo convertir el archivo'))
        return
      }
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Error al leer el archivo'))
    reader.readAsDataURL(blob)
  })
}

/** Escribe un blob en caché nativa y devuelve la URI compartible (Capacitor Android). */
export async function writeShareableBlobUri(blob: Blob, fileName: string): Promise<string> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const base64 = await blobToBase64(blob)
  const written = await Filesystem.writeFile({
    path: fileName.replace(/[/\\?%*:|"<>]/g, '_'),
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  })
  return written.uri
}

/** Abre el selector nativo de compartir con un archivo (Android) o Web Share API. */
export async function shareBlobFile(
  blob: Blob,
  fileName: string,
  opts?: { title?: string; text?: string; mimeType?: string },
): Promise<boolean> {
  const title = opts?.title ?? 'Comprobante'
  const text = opts?.text ?? ''
  const mimeType = opts?.mimeType ?? (blob.type || 'application/octet-stream')
  const safeName = fileName.replace(/[/\\?%*:|"<>]/g, '_')

  if (isCapacitorAndroid()) {
    toast.info('Preparando archivo para compartir…')
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const base64 = await blobToBase64(blob)
    const written = await Filesystem.writeFile({
      path: safeName,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    })
    await Share.share({
      title,
      text,
      files: [written.uri],
      dialogTitle: 'Compartir comprobante',
    })
    window.setTimeout(() => {
      void Filesystem.deleteFile({ path: safeName, directory: Directory.Cache }).catch(() => {})
    }, 300_000)
    return true
  }

  const file = new File([blob], safeName, { type: mimeType })
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      const can =
        typeof navigator.canShare === 'function' ? navigator.canShare({ files: [file] }) : true
      if (can) {
        await navigator.share({ files: [file], title, text })
        return true
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return true
      console.warn('[shareBlobFile]', e)
    }
  }
  return false
}

/** Comparte el PDF (ticket o A4) — Android: selector nativo; Windows/Web: Web Share API o descarga. */
export async function shareReceiptPdf(data: PrintData, format: 'a4' | 'ticket'): Promise<void> {
  const cfg = getConfiguredPrinter('documentos')
  const pdfOpts =
    format === 'ticket' ? { paperWidthMm: cfg?.paperWidthMm === 58 ? (58 as const) : (80 as const) } : undefined
  const blob = await printDataToPdfBlob(data, format, pdfOpts)
  const fileName = receiptPdfFileName(data, format)
  const label = format === 'ticket' ? 'ticket' : 'A4'
  const shareText = `Comprobante ${label} · ${data.number}`

  const shared = await shareBlobFile(blob, fileName, {
    title: `Comprobante ${label}`,
    text: shareText,
    mimeType: 'application/pdf',
  })
  if (shared) {
    toast.success('Selector de compartir abierto')
    return
  }

  if (isTauriDesktop()) {
    await downloadBlob(blob, fileName)
    const hint = encodeURIComponent(`${shareText}\n\nAdjunte el PDF guardado en este chat de WhatsApp.`)
    await openExternalUrl(`https://wa.me/?text=${hint}`)
    toast.info('PDF guardado. Abra WhatsApp y adjunte el archivo.')
    return
  }

  await downloadBlob(blob, fileName)
  toast.info('PDF descargado. Ábralo y compártalo por WhatsApp u otra app.')
}
