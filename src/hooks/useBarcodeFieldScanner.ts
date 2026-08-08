import { useCallback, useRef, useState } from 'react'
import { isCapacitorNative } from '@/lib/platform/detect'

type Options = {
  /** Se invoca al recibir un código (Enter con modo escáner activo o lectura por cámara). */
  onScan: (code: string) => void
  /** Cierra la cámara tras leer (por defecto true en formularios). */
  closeCameraOnScan?: boolean
}

/**
 * Escáner de campo: cámara en Capacitor Android/iOS; input + lector USB en web/Tauri.
 */
export function useBarcodeFieldScanner({ onScan, closeCameraOnScan = true }: Options) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [scannerMode, setScannerMode] = useState(false)
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false)
  const useCameraBarcodeScanner = isCapacitorNative()

  const focusInput = useCallback(() => {
    window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }, [])

  const closeScanner = useCallback(() => {
    setScannerMode(false)
    setCameraScannerOpen(false)
  }, [])

  const deactivateScanner = useCallback(() => {
    closeScanner()
  }, [closeScanner])

  const toggleScannerMode = useCallback(() => {
    if (useCameraBarcodeScanner) {
      setScannerMode(true)
      setCameraScannerOpen(true)
      return
    }
    setScannerMode(on => {
      const next = !on
      if (next) focusInput()
      else setCameraScannerOpen(false)
      return next
    })
  }, [focusInput, useCameraBarcodeScanner])

  const openCameraScanner = useCallback(() => {
    setScannerMode(true)
    setCameraScannerOpen(true)
  }, [])

  /**
   * Fuerza el modo "lector físico" (foco en el input, sin cámara) aunque estemos en
   * Capacitor nativo, donde `toggleScannerMode` abre la cámara por defecto. Así, en la
   * app Android/iOS empaquetada, el usuario puede elegir pistola/lector USB en vez de
   * cámara sin perder la opción de cámara (que sigue disponible con el botón normal).
   */
  const activatePhysicalScanner = useCallback(() => {
    setCameraScannerOpen(false)
    setScannerMode(true)
    focusInput()
  }, [focusInput])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (scannerMode && e.key === 'Enter') {
        e.preventDefault()
        const code = e.currentTarget.value.trim()
        if (code) onScan(code)
      }
    },
    [onScan, scannerMode],
  )

  const handleCameraScan = useCallback(
    (code: string) => {
      const trimmed = code.trim()
      if (!trimmed) return
      onScan(trimmed)
      if (closeCameraOnScan) closeScanner()
    },
    [closeCameraOnScan, closeScanner, onScan],
  )

  return {
    inputRef,
    scannerMode,
    cameraScannerOpen,
    useCameraBarcodeScanner,
    toggleScannerMode,
    openCameraScanner,
    activatePhysicalScanner,
    closeScanner,
    deactivateScanner,
    handleKeyDown,
    handleCameraScan,
  }
}
