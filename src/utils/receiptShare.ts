import { toast } from 'sonner'
import type { PrintData } from '@/types/printData'
import { isCapacitorAndroid } from '@/lib/platform/detect'
import { getConfiguredPrinter } from '@/services/printers.service'
import { printDataToPdfBlob, receiptPdfFileName } from '@/utils/receiptPdf'

async function blobToBase64(blob: Blob): Promise<string> {
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
        reject(new Error('No se pudo convertir el PDF'))
        return
      }
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Error al leer el PDF'))
    reader.readAsDataURL(blob)
  })
}

/** Comparte el PDF (ticket o A4) — Android: selector nativo; Windows/Web: Web Share API o descarga. */
export async function shareReceiptPdf(data: PrintData, format: 'a4' | 'ticket'): Promise<void> {
  const cfg = getConfiguredPrinter('documentos')
  const pdfOpts =
    format === 'ticket' ? { paperWidthMm: cfg?.paperWidthMm === 58 ? (58 as const) : (80 as const) } : undefined
  const blob = await printDataToPdfBlob(data, format, pdfOpts)
  const fileName = receiptPdfFileName(data, format)
  const label = format === 'ticket' ? 'ticket' : 'A4'

  if (isCapacitorAndroid()) {
    toast.info('Preparando PDF para compartir…')
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const base64 = await blobToBase64(blob)
    const written = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    })
    await Share.share({
      title: `Comprobante ${label}`,
      text: `Comprobante ${data.number}`,
      url: written.uri,
      dialogTitle: 'Compartir comprobante',
    })
    toast.success('Selector de compartir abierto')
    window.setTimeout(() => {
      void Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }).catch(() => {})
    }, 300_000)
    return
  }

  const file = new File([blob], fileName, { type: 'application/pdf' })
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      const can =
        typeof navigator.canShare === 'function' ? navigator.canShare({ files: [file] }) : true
      if (can) {
        await navigator.share({
          files: [file],
          title: `Comprobante ${data.number}`,
          text: `Comprobante ${label} · ${data.number}`,
        })
        toast.success('Compartir iniciado')
        return
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      console.warn('[shareReceiptPdf]', e)
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
  toast.info('PDF descargado. Ábralo y compártalo por WhatsApp u otra app.')
}
