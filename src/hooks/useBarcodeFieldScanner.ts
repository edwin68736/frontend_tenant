import { useCallback, useRef } from 'react'
import { useBarcodeInput } from './useBarcodeInput'

type Options = {
  /** Se invoca al recibir un código (Enter con modo escáner activo o lectura por cámara). */
  onScan: (code: string) => void
  /** Cierra la cámara tras leer (por defecto true en formularios). */
  closeCameraOnScan?: boolean
}

/**
 * Escáner de campo (rellena un input con el código): cámara en Capacitor o lector físico HID,
 * según la preferencia del dispositivo. Envoltorio fino sobre `useBarcodeInput`.
 */
export function useBarcodeFieldScanner({ onScan, closeCameraOnScan = true }: Options) {
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  const handleCode = useCallback((code: string) => {
    onScanRef.current(code)
  }, [])

  const base = useBarcodeInput({ onCode: handleCode, closeCameraOnScan })
  const { submit, selectMode, activate, deactivate, toggle, active } = base

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (active && e.key === 'Enter') {
        e.preventDefault()
        const code = e.currentTarget.value.trim()
        if (code) void submit(code)
      }
    },
    [active, submit],
  )

  const handleCameraScan = useCallback(
    (code: string) => {
      void base.submitFromCamera(code)
    },
    [base],
  )

  return {
    inputRef: base.inputRef,
    scannerMode: active,
    cameraScannerOpen: base.cameraOpen,
    /** true si este equipo tiene cámara de escaneo (app Capacitor). */
    useCameraBarcodeScanner: base.canUseCamera,
    usingCameraNow: base.mode === 'camera',
    softKeyboard: base.softKeyboard,
    captureInputMode: base.captureInputMode,
    toggleSoftKeyboard: base.toggleSoftKeyboard,
    selectScannerMode: selectMode,
    toggleScannerMode: toggle,
    openCameraScanner: activate,
    activatePhysicalScanner: () => selectMode('reader'),
    closeScanner: deactivate,
    deactivateScanner: deactivate,
    handleKeyDown,
    handleCameraScan,
  }
}
