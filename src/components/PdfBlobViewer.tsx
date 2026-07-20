import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Loader2, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { isCapacitorAndroid } from '@/lib/platform/detect'
import { pdfEmbedSrc } from '@/utils/pdfEmbedSrc'
import { shareBlobFile } from '@/utils/receiptShare'
import { downloadBlob } from '@/utils/downloadBlob'

/** Ancho máximo de presentación (px CSS) del PDF rasterizado en Android. */
const MAX_DISPLAY_WIDTH = 480
/**
 * Zoom máximo respecto al tamaño real del PDF. Un ticket de 58/80 mm mide ~164-226 pt de
 * ancho; sin este tope se estiraba a todo el ancho de la pantalla y se veía "ampliado".
 * El A4 (595 pt) nunca llega a este límite, así que no cambia.
 */
const MAX_ZOOM = 1.5

type Props = {
  url: string
  title?: string
  className?: string
  /** Opciones del visor nativo del iframe (p. ej. fit: 'page' en A4). */
  embedOptions?: { fit?: 'page' | 'width' }
}

/**
 * WebView de Android no muestra PDF en iframe con blob: — se rasteriza con pdf.js.
 * En escritorio/navegador se usa el visor nativo del iframe.
 */
export function PdfBlobViewer({ url, title = 'Comprobante PDF', className, embedOptions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const useCanvas = isCapacitorAndroid()
  const [loading, setLoading] = useState(useCanvas)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const fileName = `${(title || 'comprobante').replace(/[/\\?%*:|"<>]/g, '_')}.pdf`

  /** Comparte el PDF con las apps del dispositivo (el propio visor de PDF entre ellas). */
  const handleShare = async () => {
    setBusy(true)
    try {
      const blob = await (await fetch(url)).blob()
      const ok = await shareBlobFile(blob, fileName, {
        title,
        mimeType: 'application/pdf',
      })
      if (!ok) toast.error('No se pudo compartir el comprobante')
    } catch {
      toast.error('No se pudo compartir el comprobante')
    } finally {
      setBusy(false)
    }
  }

  const handleDownload = async () => {
    setBusy(true)
    try {
      const blob = await (await fetch(url)).blob()
      downloadBlob(blob, fileName)
    } catch {
      toast.error('No se pudo descargar el comprobante')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!useCanvas || !url) return

    let cancelled = false
    setLoading(true)
    setError(false)

    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default

        const response = await fetch(url)
        const buffer = await response.arrayBuffer()
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
        const container = containerRef.current
        if (!container || cancelled) return

        container.replaceChildren()

        // La pantalla del móvil tiene 2-3 píxeles físicos por píxel CSS. Antes el bitmap se
        // generaba a tamaño CSS y el navegador lo estiraba, de ahí que el ticket se viera
        // borroso: se renderiza a dpr para que quede nítido.
        const dpr = Math.min(window.devicePixelRatio || 1, 3)

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
          const page = await pdf.getPage(pageNum)
          const baseViewport = page.getViewport({ scale: 1 })
          const displayWidth = Math.min(
            container.clientWidth || 360,
            MAX_DISPLAY_WIDTH,
            baseViewport.width * MAX_ZOOM,
          )
          const cssScale = displayWidth / baseViewport.width
          const viewport = page.getViewport({ scale: cssScale * dpr })

          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) continue

          // Bitmap a resolución física; tamaño de presentación en CSS.
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.width = `${Math.floor(displayWidth)}px`
          canvas.style.height = 'auto'
          canvas.className = 'mx-auto mb-3 max-w-full bg-white shadow-sm rounded'

          await page.render({ canvasContext: ctx, viewport }).promise
          if (cancelled) return
          container.appendChild(canvas)
        }
      } catch (e) {
        console.error('[PdfBlobViewer]', e)
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [url, useCanvas])

  if (!useCanvas) {
    return (
      <iframe
        src={pdfEmbedSrc(url, embedOptions)}
        title={title}
        className={className ?? 'h-[min(70vh,520px)] min-h-[320px] w-full border-0 bg-white'}
      />
    )
  }

  // Si no se puede pintar el PDF, se ofrecen acciones en vez de un aviso sin salida:
  // el usuario quiere el comprobante, no enterarse de que falló.
  if (error) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 p-6 text-center md:min-h-[360px]">
        <FileText className="h-10 w-10 text-stone-300" aria-hidden />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => void handleShare()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            <Share2 size={16} aria-hidden />
            Compartir
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-60"
          >
            <Download size={16} aria-hidden />
            Descargar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative bg-stone-100 p-2">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-stone-100/90">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      )}
      <div
        ref={containerRef}
        className={`overflow-y-auto ${className ?? 'max-h-[min(70vh,520px)] min-h-[320px]'}`}
      />
    </div>
  )
}
