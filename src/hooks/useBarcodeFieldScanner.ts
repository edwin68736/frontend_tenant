import { useCallback, useRef, useState } from 'react'

type Options = {
  /** Se invoca al recibir un código (Enter con modo escáner activo). */
  onScan: (code: string) => void
}

/**
 * Escáner de campo por input + foco + lector USB (mismo patrón que POS en Web/Windows).
 * No usa cámara ni html5-qrcode.
 */
export function useBarcodeFieldScanner({ onScan }: Options) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [scannerMode, setScannerMode] = useState(false)

  const focusInput = useCallback(() => {
    window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }, [])

  const deactivateScanner = useCallback(() => {
    setScannerMode(false)
  }, [])

  const toggleScannerMode = useCallback(() => {
    setScannerMode(on => {
      const next = !on
      if (next) focusInput()
      return next
    })
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

  return {
    inputRef,
    scannerMode,
    toggleScannerMode,
    deactivateScanner,
    handleKeyDown,
  }
}
