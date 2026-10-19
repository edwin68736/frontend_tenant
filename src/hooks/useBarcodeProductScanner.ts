import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { productsService, type Product } from '@/services/products.service'
import { findProductByBarcodeInList } from '@/utils/barcodeLookup'
import { useBarcodeInput } from './useBarcodeInput'

type Options = {
  products?: Product[]
  branchId?: number | null
  onProductFound: (product: Product) => void
  /** Limpia el campo de búsqueda tras agregar (POS). */
  onClearSearch?: () => void
  /** Si false, no muestra toast de éxito (p. ej. cuando onProductFound ya lo hace). */
  showSuccessToast?: boolean
  /** Cierra la cámara tras agregar un producto (por defecto true). */
  closeCameraOnScan?: boolean
}

/**
 * Escáner de productos: cámara (Capacitor) o lector físico HID (campo + Enter), según la
 * preferencia del dispositivo. Envoltorio fino sobre `useBarcodeInput`.
 */
export function useBarcodeProductScanner({
  products = [],
  branchId,
  onProductFound,
  onClearSearch,
  showSuccessToast = true,
  closeCameraOnScan = true,
}: Options) {
  const [scanQuery, setScanQueryState] = useState('')

  // Últimas versiones de las opciones: la cola procesa varias lecturas seguidas y no debe
  // usar el estado de la renderización en que arrancó.
  const optsRef = useRef({ products, branchId, onProductFound, onClearSearch, showSuccessToast })
  optsRef.current = { products, branchId, onProductFound, onClearSearch, showSuccessToast }

  const handleCode = useCallback(async (code: string): Promise<boolean> => {
    const o = optsRef.current
    try {
      const product =
        findProductByBarcodeInList(o.products, code) ??
        (await productsService.lookupByBarcode(code, o.branchId ?? undefined))
      if (product) {
        o.onProductFound(product)
        setScanQueryState('')
        o.onClearSearch?.()
        if (o.showSuccessToast) toast.success(`${product.name} agregado`)
        return true
      }
      toast.error(`No se encontró un producto con el código ${code}`)
    } catch {
      toast.error('Error al buscar el producto')
    }
    return false
  }, [])

  const base = useBarcodeInput({ onCode: handleCode, closeCameraOnScan })
  const { submit, submitFromCamera, selectMode, activate, deactivate, toggle, active } = base

  /** Entrada del modal de cámara (o pegado manual). */
  const handleBarcodeScan = useCallback(
    async (rawCode: string) => {
      if (base.mode === 'camera') await submitFromCamera(rawCode)
      else await submit(rawCode)
    },
    [base.mode, submit, submitFromCamera],
  )

  // El campo se vacía en cuanto se lee (la lectura queda en cola), para que la siguiente
  // no se concatene con la anterior aunque el producto no exista.
  const takeFieldValue = useCallback(
    (el: HTMLInputElement) => {
      const code = el.value.trim()
      setScanQueryState('')
      onClearSearch?.()
      return code
    },
    [onClearSearch, setScanQueryState],
  )

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (active && e.key === 'Enter') {
        e.preventDefault()
        const code = takeFieldValue(e.currentTarget)
        if (code) void submit(code)
      }
    },
    [active, submit, takeFieldValue],
  )

  const wedgeInputRef = useRef<HTMLInputElement>(null)
  const handleWedgeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const code = e.currentTarget.value.trim()
        e.currentTarget.value = ''
        if (code) void submit(code)
      }
    },
    [submit],
  )

  return {
    searchInputRef: base.inputRef,
    wedgeInputRef,
    scannerMode: active,
    cameraScannerOpen: base.cameraOpen,
    /** true si este equipo tiene cámara de escaneo (app Capacitor). */
    useCameraBarcodeScanner: base.canUseCamera,
    usingCameraNow: base.mode === 'camera',
    scannerPreference: base.mode,
    scanQuery,
    setScanQuery: setScanQueryState,
    scanProcessing: base.processing,
    softKeyboard: base.softKeyboard,
    captureInputMode: base.captureInputMode,
    toggleSoftKeyboard: base.toggleSoftKeyboard,
    selectScannerMode: selectMode,
    activateScanner: activate,
    activatePhysicalScanner: () => selectMode('reader'),
    deactivateScanner: deactivate,
    closeScanner: deactivate,
    toggleScannerMode: toggle,
    handleBarcodeScan,
    handleSearchKeyDown,
    handleWedgeKeyDown,
  }
}
