/**
 * Visor de PDF global. Reemplaza a `window.open(blobUrl)`, que no funciona en Tauri (no
 * abre pestañas) ni en el WebView de Android, y que en navegador sacaba al usuario de la
 * app a otra pestaña.
 *
 * Es un store mínimo para poder abrirlo desde cualquier página con una línea, sin que cada
 * lista tenga que montar su propio modal y gestionar su estado.
 */
export type PdfViewerRequest = {
  url: string
  title: string
  /** A4 encaja la página; el ticket se ve mejor a lo ancho. */
  fit?: 'page' | 'width'
  /** Nombre con el que se descarga (ej. NV001-00000005.pdf). Sin esto, el botón de descarga
   *  del visor nativo guarda con el UUID del object URL. */
  fileName?: string
  /** Se llama al cerrar, para liberar el object URL. */
  onClose?: () => void
  /** false = oculta la barra del visor nativo (su botón de imprimir no respeta el tamaño de ticket). */
  nativeToolbar?: boolean
  /**
   * Si se indica, el visor muestra un botón "Imprimir" propio. Puede devolver un mensaje de éxito
   * (impresión directa); sin mensaje se asume que el usuario ya vio el diálogo de impresión.
   */
  onPrint?: () => Promise<string | undefined | void>
}

type Listener = (req: PdfViewerRequest | null) => void

let current: PdfViewerRequest | null = null
const listeners = new Set<Listener>()

export function subscribePdfViewer(fn: Listener): () => void {
  listeners.add(fn)
  fn(current)
  return () => {
    listeners.delete(fn)
  }
}

export function openPdfViewer(req: PdfViewerRequest) {
  // Si ya había uno abierto, libera el suyo antes de reemplazarlo.
  current?.onClose?.()
  current = req
  listeners.forEach((fn) => fn(current))
}

export function closePdfViewer() {
  current?.onClose?.()
  current = null
  listeners.forEach((fn) => fn(null))
}
