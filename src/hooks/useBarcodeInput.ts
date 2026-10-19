import { useCallback, useEffect, useRef, useState } from 'react'
import { isCapacitorNative } from '@/lib/platform/detect'
import {
  resolveScannerMode,
  setScannerModePreference,
  useScannerModePreference,
  type ScannerMode,
} from '@/lib/scanner/scannerMode'

/** Lecturas máximas en espera mientras se procesa otra (un lector manda ráfagas seguidas). */
export const MAX_QUEUED_SCANS = 5
/** El mismo código leído dos veces dentro de esta ventana (lector físico) cuenta una sola vez. */
export const READER_DOUBLE_READ_MS = 400
const REFOCUS_INTERVAL_MS = 1500

type Options = {
  /**
   * Procesa un código (buscar producto, rellenar un campo, etc.). Se ejecuta de a una lectura
   * por vez; las que lleguen mientras tanto quedan en cola.
   */
  onCode: (code: string, source: ScannerMode) => boolean | void | Promise<boolean | void>
  /** Cierra la cámara tras leer con ella (por defecto true). */
  closeCameraOnScan?: boolean
}

/**
 * Base común de escaneo de códigos de barras (cámara o lector físico HID).
 *
 * El lector físico escribe el código en el campo enfocado y termina con Enter, así que lo
 * esencial es: que el campo NUNCA se deshabilite (perdería el foco), que se reenfoque solo,
 * que no abra el teclado en pantalla (`inputMode="none"`) y que no se pierdan lecturas.
 */
export function useBarcodeInput({ onCode, closeCameraOnScan = true }: Options) {
  const inputRef = useRef<HTMLInputElement>(null)
  const canUseCamera = isCapacitorNative()
  const preference = useScannerModePreference()
  const mode = resolveScannerMode(preference)

  const [active, setActive] = useState(false)
  const [processing, setProcessing] = useState(false)
  // Teclado en pantalla permitido a pedido (para teclear un código a mano en modo lector).
  const [softKeyboard, setSoftKeyboard] = useState(false)

  const onCodeRef = useRef(onCode)
  const closeCameraRef = useRef(closeCameraOnScan)
  const modeRef = useRef(mode)
  useEffect(() => {
    onCodeRef.current = onCode
    closeCameraRef.current = closeCameraOnScan
    modeRef.current = mode
  })

  const busyRef = useRef(false)
  const queueRef = useRef<string[]>([])
  const lastRef = useRef({ code: '', at: 0 })

  const cameraOpen = active && mode === 'camera'

  const focusInput = useCallback(() => {
    window.setTimeout(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.select()
    }, 0)
  }, [])

  const deactivate = useCallback(() => {
    setActive(false)
    setSoftKeyboard(false)
    queueRef.current = []
  }, [])

  const activate = useCallback(() => {
    setSoftKeyboard(false)
    setActive(true)
  }, [])

  const toggle = useCallback(() => {
    setSoftKeyboard(false)
    if (active) queueRef.current = []
    setActive(!active)
  }, [active])

  /**
   * Elige cámara o lector físico. Se recuerda en este dispositivo (solo si hay cámara que
   * elegir). Tocar el modo ya activo apaga el escáner; tocar el otro cambia y deja escaneando.
   */
  const selectMode = useCallback(
    (next: ScannerMode) => {
      const effective: ScannerMode = canUseCamera ? next : 'reader'
      if (canUseCamera && effective !== preference) setScannerModePreference(effective)
      setSoftKeyboard(false)
      if (active && effective === modeRef.current) {
        queueRef.current = []
        setActive(false)
      } else {
        setActive(true)
      }
    },
    [active, canUseCamera, preference],
  )

  /** Acepta un código (de lector o cámara): anti doble lectura, cola y procesamiento en serie. */
  const submit = useCallback(
    async (raw: string): Promise<boolean> => {
      const code = raw.trim()
      if (!code) return false
      const source = modeRef.current
      const now = Date.now()
      if (source === 'reader') {
        if (code === lastRef.current.code && now - lastRef.current.at < READER_DOUBLE_READ_MS) return false
        lastRef.current = { code, at: now }
      }
      if (busyRef.current) {
        if (queueRef.current.length < MAX_QUEUED_SCANS) queueRef.current.push(code)
        return false
      }
      busyRef.current = true
      setProcessing(true)
      try {
        let next: string | undefined = code
        let firstOk = false
        let isFirst = true
        while (next) {
          let ok = true
          try {
            ok = (await onCodeRef.current(next, source)) !== false
          } catch {
            ok = false // cada onCode maneja sus errores; no cortar la cola
          }
          if (isFirst) firstOk = ok
          isFirst = false
          next = queueRef.current.shift()
        }
        return firstOk
      } finally {
        busyRef.current = false
        setProcessing(false)
        if (modeRef.current === 'reader') focusInput()
      }
    },
    [focusInput],
  )

  // Al activar o cambiar de modo: lector → enfocar el campo; cámara → la abre `cameraOpen`.
  useEffect(() => {
    if (active && mode === 'reader') focusInput()
  }, [active, mode, focusInput])

  // Reenfoque del campo de captura mientras se escanea con lector: al volver a la app/pestaña
  // y, de forma periódica, si el foco quedó "suelto" (p. ej. se cerró un modal).
  useEffect(() => {
    if (!active || mode !== 'reader') return
    const refocusIfLost = () => {
      const el = inputRef.current
      if (!el || document.visibilityState !== 'visible') return
      if (document.activeElement === el) return
      const ae = document.activeElement
      const tag = ae?.tagName
      const editable =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (ae as HTMLElement | null)?.isContentEditable
      if (editable) return
      // Si hay un modal abierto que no contiene el campo, no robarle el foco.
      const dialogs = document.querySelectorAll('[role="dialog"]')
      const top = dialogs[dialogs.length - 1]
      if (top && !top.contains(el)) return
      el.focus()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refocusIfLost()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refocusIfLost)
    const timer = window.setInterval(refocusIfLost, REFOCUS_INTERVAL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refocusIfLost)
      window.clearInterval(timer)
    }
  }, [active, mode])

  /** Lectura entregada por la cámara. */
  const submitFromCamera = useCallback(
    async (raw: string) => {
      const ok = await submit(raw)
      if (ok && closeCameraRef.current) deactivate()
    },
    [deactivate, submit],
  )

  return {
    inputRef,
    active,
    processing,
    mode,
    canUseCamera,
    cameraOpen,
    softKeyboard,
    /** Atributo para el campo de captura: sin teclado en pantalla salvo que se pida. */
    captureInputMode: (active && mode === 'reader' && !softKeyboard ? 'none' : undefined) as
      | 'none'
      | undefined,
    toggleSoftKeyboard: useCallback(() => {
      // Cambiar inputMode con el campo ya enfocado no abre/cierra el teclado: blur + focus.
      inputRef.current?.blur()
      setSoftKeyboard(v => !v)
      focusInput()
    }, [focusInput]),
    focusInput,
    activate,
    deactivate,
    toggle,
    selectMode,
    submit,
    submitFromCamera,
  }
}
