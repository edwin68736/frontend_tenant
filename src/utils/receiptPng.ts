import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PrintData } from '@/types/printData'
import { generateReceiptPdf } from '@/utils/receiptPdf'
import { normalizePhoneForWhatsApp } from '@/utils/membershipReminders'
import { shareBlobFile } from '@/utils/receiptShare'
import { downloadBlob } from '@/utils/downloadBlob'
import { openExternalUrl } from '@/utils/supportWhatsApp'
import { isTauriDesktop } from '@/lib/platform/detect'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

/**
 * Misma maquetación que el PDF del comprobante (receiptPdf), rasterizada a PNG (primera página).
 */
export async function generateReceiptPngBlob(
  data: PrintData,
  format: 'a4' | 'ticket' = 'a4',
  scale = 2.25,
): Promise<Blob> {
  const doc = await generateReceiptPdf(data, format)
  const ab = doc.output('arraybuffer') as ArrayBuffer
  const pdfData = new Uint8Array(ab)
  const loadTask = pdfjsLib.getDocument({ data: pdfData.slice() })
  const pdf = await loadTask.promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear el canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const renderTask = page.render({
    canvasContext: ctx,
    viewport,
  })
  await renderTask.promise
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar PNG'))), 'image/png', 0.92)
  })
}

export type ShareReceiptWhatsAppOpts = {
  printData: PrintData
  format?: 'a4' | 'ticket'
  /** Teléfono del cliente (cualquier formato); si falta se abre wa.me sin número. */
  phone?: string | null
  /** Texto que acompaña al envío / portapapeles. */
  message?: string
}

/**
 * Intenta compartir la imagen nativamente; si no, copia PNG al portapapeles y abre WhatsApp;
 * último recurso: descarga PNG + WhatsApp con instrucciones.
 */
export async function shareReceiptPngViaWhatsApp(opts: ShareReceiptWhatsAppOpts): Promise<void> {
  const format = opts.format ?? 'a4'
  const blob = await generateReceiptPngBlob(opts.printData, format)
  const suffix = format === 'ticket' ? '-ticket' : ''
  const fname = `comprobante-${opts.printData.series}-${String(opts.printData.number).replace(/\s/g, '')}${suffix}.png`
  const msg =
    opts.message ??
    `Comprobante ${opts.printData.series}-${String(opts.printData.number).padStart(8, '0')}`

  const waNum = normalizePhoneForWhatsApp(opts.phone ?? '')
  const waBase = waNum ? `https://wa.me/${waNum}` : 'https://wa.me/'

  const shared = await shareBlobFile(blob, fname, {
    title: 'Comprobante',
    text: msg,
    mimeType: 'image/png',
  })
  if (shared) return

  if (isTauriDesktop()) {
    await downloadBlob(blob, fname)
    const hint = encodeURIComponent(`${msg}\n\nAdjunte la imagen guardada en este chat de WhatsApp.`)
    await openExternalUrl(`${waBase}?text=${hint}`)
    return
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard && 'ClipboardItem' in window) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      const hint = encodeURIComponent(
        `${msg}\n\nPegue la imagen en este chat (Ctrl+V en WhatsApp Web, o mantenga pulsado → Pegar en el móvil).`,
      )
      window.open(`${waBase}?text=${hint}`, '_blank', 'noopener,noreferrer')
      return
    } catch {
      /* continuar con descarga */
    }
  }

  const url = URL.createObjectURL(blob)
  try {
    await downloadBlob(blob, fname)
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2500)
  }
  const hint = encodeURIComponent(`${msg}\n\nSe descargó "${fname}". Ábralo y adjúntelo en WhatsApp.`)
  window.open(`${waBase}?text=${hint}`, '_blank', 'noopener,noreferrer')
}
