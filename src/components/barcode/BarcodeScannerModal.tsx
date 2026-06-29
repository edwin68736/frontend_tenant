import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { clsx } from 'clsx'
import { ScanBarcode, X, Loader2 } from 'lucide-react'
import { requestCameraPermission } from '@/lib/camera/requestCameraPermission'
import { BARCODE_SCANNER_Z } from '@/utils/uiLayers'

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.QR_CODE,
]

const SCAN_COOLDOWN_MS = 1800

type Props = {
  open: boolean
  onClose: () => void
  onScan: (code: string) => void | Promise<void>
  busy?: boolean
  title?: string
  subtitle?: string
  footerHint?: string
}

export function BarcodeScannerModal({
  open,
  onClose,
  onScan,
  busy = false,
  title = 'Escanear producto',
  subtitle = 'Apunta al código de barras',
  footerHint = 'El producto se agregará al carrito al detectar el código',
}: Props) {
  const regionId = useId().replace(/:/g, '')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const lastCodeRef = useRef('')
  const lastAtRef = useRef(0)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stopScanner = useCallback(async () => {
    const instance = scannerRef.current
    scannerRef.current = null
    if (!instance) return
    try {
      if (instance.isScanning) await instance.stop()
    } catch {
      /* ignore */
    }
    try {
      instance.clear()
    } catch {
      /* ignore */
    }
  }, [])

  const handleClose = useCallback(() => {
    void stopScanner().finally(onClose)
  }, [onClose, stopScanner])

  useEffect(() => {
    if (!open) {
      void stopScanner()
      setError(null)
      setStarting(false)
      return
    }

    let cancelled = false

    const start = async () => {
      setStarting(true)
      setError(null)
      const permission = await requestCameraPermission()
      if (cancelled) return
      if (permission !== 'granted') {
        setStarting(false)
        setError(
          'Permiso de cámara denegado. Actívalo en Ajustes del dispositivo para escanear códigos.',
        )
        return
      }

      await stopScanner()
      if (cancelled) return

      const scanner = new Html5Qrcode(regionId, {
        formatsToSupport: BARCODE_FORMATS,
        verbose: false,
      })
      scannerRef.current = scanner

      try {
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 12,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const w = Math.min(viewfinderWidth * 0.88, 340)
              const h = Math.min(viewfinderHeight * 0.32, 140)
              return { width: w, height: h }
            },
            aspectRatio: 1,
          },
          decoded => {
            const code = decoded.trim()
            if (!code || busy) return
            const now = Date.now()
            if (code === lastCodeRef.current && now - lastAtRef.current < SCAN_COOLDOWN_MS) return
            lastCodeRef.current = code
            lastAtRef.current = now
            void onScan(code)
          },
          () => {
            /* frame sin lectura */
          },
        )
        if (!cancelled) setStarting(false)
      } catch (e) {
        if (!cancelled) {
          setStarting(false)
          setError(e instanceof Error ? e.message : 'No se pudo iniciar la cámara')
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      void stopScanner()
    }
  }, [open, regionId, onScan, busy, stopScanner])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={clsx('fixed inset-0 flex flex-col', BARCODE_SCANNER_Z)}
      role="dialog"
      aria-modal="true"
      aria-label="Escanear código de barras"
    >
      <div className="absolute inset-0 bg-stone-950" aria-hidden />

      <div className="relative z-10 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="flex items-center gap-2 text-white min-w-0">
          <ScanBarcode size={22} className="shrink-0 text-primary-300" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold text-sm sm:text-base truncate">{title}</p>
            <p className="text-xs text-stone-300 truncate">{subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="shrink-0 p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white touch-manipulation"
          aria-label="Cerrar escáner y apagar cámara"
        >
          <X size={22} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 flex flex-col items-center justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="relative w-full max-w-lg aspect-[4/3] rounded-2xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/10">
          <div id={regionId} className="absolute inset-0 w-full h-full [&_video]:object-cover [&_canvas]:hidden" />

          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="relative w-[88%] max-w-[340px] h-[32%] max-h-[140px]">
              <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary-400 rounded-tl-lg" />
              <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary-400 rounded-tr-lg" />
              <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary-400 rounded-bl-lg" />
              <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary-400 rounded-br-lg" />
              <span className="absolute left-2 right-2 top-1/2 h-0.5 -translate-y-1/2 bg-gradient-to-r from-transparent via-primary-400 to-transparent opacity-90 animate-pulse" />
              <span
                className="absolute left-2 right-2 h-0.5 bg-primary-500/80 shadow-[0_0_12px_rgba(var(--p500),0.8)] animate-[scanLine_2s_ease-in-out_infinite]"
                style={{ top: '15%' }}
              />
            </div>
          </div>

          {(starting || busy) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="w-10 h-10 text-white animate-spin" aria-hidden />
            </div>
          )}
        </div>

        {error ? (
          <p className="mt-4 text-center text-sm text-red-300 max-w-md px-2">{error}</p>
        ) : (
          <p className="mt-4 text-center text-xs text-stone-400 max-w-md">{footerHint}</p>
        )}
      </div>

      <style>{`
        @keyframes scanLine {
          0%, 100% { top: 18%; opacity: 0.5; }
          50% { top: 72%; opacity: 1; }
        }
        #${regionId} video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
      `}</style>
    </div>,
    document.body,
  )
}
