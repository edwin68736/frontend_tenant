import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PrintData } from '@/types/printData'
import { generateReceiptPdf, waitForBrowserPrintDialog, type ReceiptPdfOptions } from '@/utils/receiptPdf'
import { configuredTicketPaperMm, normalizeTicketPaperWidth } from '@/utils/receiptTicketPaper'
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
  options?: ReceiptPdfOptions,
): Promise<Blob> {
  const doc = await generateReceiptPdf(data, format, options)
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

/**
 * Ancho realmente imprimible del rollo: las térmicas no imprimen el papel de borde a borde
 * (80 mm → ~72 mm, 58 mm → ~50 mm). Dibujar a 100% del papel hacía que la impresora recortara el
 * lado derecho (TOTAL, importes) y obligaba a bajar la escala a 90% a mano.
 */
const PRINTABLE_MM: Record<number, number> = { 80: 72, 58: 50 }

/**
 * Imprime el ticket con una hoja del tamaño EXACTO del rollo (58 u 80 mm de ancho y el alto del
 * contenido), en vez de dejar que el visor de PDF lo escale a la hoja que tenga la impresora
 * (A4 por defecto, con el ticket diminuto arriba). El PDF se rasteriza a ~300 dpi y se imprime
 * como imagen con `@page { size: <ancho>mm <alto>mm; margin: 0 }`, que Chromium (navegador,
 * WebView2 de Tauri) respeta como tamaño de papel.
 */
export async function printTicketAsPage(data: PrintData, options?: ReceiptPdfOptions): Promise<void> {
  const paperMm = normalizeTicketPaperWidth(options?.paperWidthMm ?? configuredTicketPaperMm())
  const pageWidthPt = (paperMm / 25.4) * 72
  const scale = ((paperMm / 25.4) * 300) / pageWidthPt // 300 dpi
  const blob = await generateReceiptPngBlob(data, 'ticket', scale, { ...options, paperWidthMm: paperMm })
  const imgUrl = URL.createObjectURL(blob)

  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('No se pudo preparar el ticket para imprimir'))
      img.src = imgUrl
    })
    // Un pelo menos de alto evita que el redondeo genere una segunda hoja casi en blanco.
    const printMm = PRINTABLE_MM[paperMm] ?? paperMm
    const heightMm = Math.floor((img.naturalHeight / img.naturalWidth) * printMm * 10) / 10

    await new Promise<void>((resolve, reject) => {
      const iframe = document.createElement('iframe')
      iframe.setAttribute('aria-hidden', 'true')
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
      iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title>
<style>
@page { size: ${paperMm}mm ${heightMm}mm; margin: 0; }
html, body { margin: 0; padding: 0; width: ${paperMm}mm; background: #fff; overflow: hidden; }
img { display: block; width: ${printMm}mm; height: ${heightMm}mm; }
</style></head><body><img src="${imgUrl}" alt=""></body></html>`

      let settled = false
      const cleanup = () => {
        window.setTimeout(() => iframe.remove(), 2_000)
      }
      const finish = () => {
        if (settled) return
        settled = true
        cleanup()
        resolve()
      }
      const fail = (err: Error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(err)
      }

      iframe.onload = () => {
        void (async () => {
          try {
            const win = iframe.contentWindow
            if (!win) {
              fail(new Error('No se pudo abrir el visor de impresión'))
              return
            }
            const image = win.document.querySelector('img')
            if (image && !image.complete) {
              await new Promise<void>((r) => {
                image.onload = () => r()
                image.onerror = () => r()
              })
            }
            win.focus()
            win.print()
            await waitForBrowserPrintDialog(win)
            finish()
          } catch (e) {
            fail(e instanceof Error ? e : new Error(String(e)))
          }
        })()
      }
      iframe.onerror = () => fail(new Error('No se pudo cargar el ticket para imprimir'))
      document.body.appendChild(iframe)
    })
  } finally {
    // La imagen ya está en el iframe; se libera tras un respiro (la impresión puede seguir leyéndola).
    window.setTimeout(() => URL.revokeObjectURL(imgUrl), 5_000)
  }
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
