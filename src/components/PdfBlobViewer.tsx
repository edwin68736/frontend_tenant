import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileText, Loader2, Share2, ZoomIn, ZoomOut } from 'lucide-react'
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
/** Zoom con los dedos sobre el PDF rasterizado (1 = ancho de presentación). */
const MIN_PINCH_ZOOM = 1
const MAX_PINCH_ZOOM = 3
const DOUBLE_TAP_ZOOM = 2

/**
 * Solo en desarrollo: permite probar en el navegador el visor de canvas que usa Android
 * (localStorage.setItem('tukifac_force_pdf_canvas', '1')). Nunca aplica en producción.
 */
function devForcesCanvas(): boolean {
  if (!import.meta.env.DEV) return false
  try {
    return localStorage.getItem('tukifac_force_pdf_canvas') === '1'
  } catch {
    return false
  }
}

type Props = {
  url: string
  title?: string
  className?: string
  /** Opciones del visor nativo del iframe (p. ej. fit: 'page' en A4). */
  embedOptions?: { fit?: 'page' | 'width'; toolbar?: boolean }
}

/**
 * WebView de Android no muestra PDF en iframe con blob: — se rasteriza con pdf.js.
 * En escritorio/navegador se usa el visor nativo del iframe.
 */
export function PdfBlobViewer({ url, title = 'Comprobante PDF', className, embedOptions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)
  const useCanvas = isCapacitorAndroid() || devForcesCanvas()
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

  /**
   * Escala el ancho de cada página (el bitmap ya está a resolución física) y mantiene bajo los
   * dedos el punto que se estaba mirando.
   */
  const applyZoom = useCallback((next: number, anchorX?: number, anchorY?: number) => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return
    const z = Math.min(MAX_PINCH_ZOOM, Math.max(MIN_PINCH_ZOOM, next))
    const prev = zoomRef.current
    if (Math.abs(z - prev) < 0.001) return
    const ax = anchorX ?? container.clientWidth / 2
    const ay = anchorY ?? container.clientHeight / 2
    const px = (container.scrollLeft + ax) / prev
    const py = (container.scrollTop + ay) / prev
    zoomRef.current = z
    content.querySelectorAll('canvas').forEach((c) => {
      const base = Number((c as HTMLCanvasElement).dataset.baseWidth) || 0
      if (base) c.style.width = `${Math.floor(base * z)}px`
    })
    container.scrollLeft = px * z - ax
    container.scrollTop = py * z - ay
  }, [])

  // Pellizcar para acercar y doble toque. El navegador solo se encarga del desplazamiento
  // (touch-action: pan-x pan-y); el pellizco lo gestionamos aquí.
  useEffect(() => {
    if (!useCanvas || error) return
    const container = containerRef.current
    if (!container) return
    const pointers = new Map<number, { x: number; y: number }>()
    let startDist = 0
    let startZoom = 1
    let lastTap = 0

    const dist = () => {
      const [a, b] = [...pointers.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        startDist = dist()
        startZoom = zoomRef.current
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2 && startDist > 0) {
        const [a, b] = [...pointers.values()]
        const rect = container.getBoundingClientRect()
        applyZoom(
          startZoom * (dist() / startDist),
          (a.x + b.x) / 2 - rect.left,
          (a.y + b.y) / 2 - rect.top,
        )
      }
    }
    const onUp = (e: PointerEvent) => {
      const wasSingle = pointers.size === 1
      pointers.delete(e.pointerId)
      if (pointers.size < 2) startDist = 0
      if (wasSingle && e.pointerType === 'touch') {
        const now = Date.now()
        if (now - lastTap < 300) {
          const rect = container.getBoundingClientRect()
          applyZoom(zoomRef.current > 1.05 ? 1 : DOUBLE_TAP_ZOOM, e.clientX - rect.left, e.clientY - rect.top)
          lastTap = 0
        } else {
          lastTap = now
        }
      }
    }
    container.addEventListener('pointerdown', onDown)
    container.addEventListener('pointermove', onMove)
    container.addEventListener('pointerup', onUp)
    container.addEventListener('pointercancel', onUp)
    return () => {
      container.removeEventListener('pointerdown', onDown)
      container.removeEventListener('pointermove', onMove)
      container.removeEventListener('pointerup', onUp)
      container.removeEventListener('pointercancel', onUp)
    }
  }, [useCanvas, error, applyZoom, url])

  useEffect(() => {
    if (!useCanvas || !url) return

    zoomRef.current = 1
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
        const content = contentRef.current
        if (!container || !content || cancelled) return

        content.replaceChildren()

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
          canvas.dataset.baseWidth = String(Math.floor(displayWidth))
          canvas.style.width = `${Math.floor(displayWidth * zoomRef.current)}px`
          canvas.style.height = 'auto'
          canvas.className = 'mb-3 shrink-0 bg-white shadow-sm rounded'

          await page.render({ canvasContext: ctx, viewport }).promise
          if (cancelled) return
          content.appendChild(canvas)
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
        // Con fit:"page" (A4) el navegador encoge el zoom para que la página entera quepa en
        // esta altura — un tope bajo se ve "alejado y pequeño" con la mitad del visor vacía.
        className={className ?? 'h-[min(78vh,640px)] min-h-[320px] w-full border-0 bg-white'}
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
        // touch-action: el desplazamiento lo hace el navegador; el pellizco (zoom) lo gestionamos
        // nosotros — ver el efecto de gestos arriba.
        style={{ touchAction: 'pan-x pan-y' }}
        className={`overflow-auto ${className ?? 'max-h-[min(70vh,520px)] min-h-[320px]'}`}
      >
        <div ref={contentRef} className="flex w-max min-w-full flex-col items-center" />
      </div>
      {!loading && (
        <div className="absolute bottom-3 right-3 z-10 flex gap-1">
          <button
            type="button"
            onClick={() => applyZoom(zoomRef.current - 0.5)}
            aria-label="Alejar"
            title="Alejar"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white/95 text-stone-700 shadow-md active:scale-95"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => applyZoom(zoomRef.current + 0.5)}
            aria-label="Acercar"
            title="Acercar"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white/95 text-stone-700 shadow-md active:scale-95"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
