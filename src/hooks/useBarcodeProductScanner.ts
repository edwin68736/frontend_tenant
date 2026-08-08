import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { isCapacitorNative } from '@/lib/platform/detect'
import { productsService, type Product } from '@/services/products.service'
import { findProductByBarcodeInList } from '@/utils/barcodeLookup'

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

/** Escáner por cámara (Capacitor) o input + lector USB (web/Tauri). */
export function useBarcodeProductScanner({
  products = [],
  branchId,
  onProductFound,
  onClearSearch,
  showSuccessToast = true,
  closeCameraOnScan = true,
}: Options) {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const wedgeInputRef = useRef<HTMLInputElement>(null)
  const [scannerMode, setScannerMode] = useState(false)
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false)
  const [scanQuery, setScanQuery] = useState('')
  const [scanProcessing, setScanProcessing] = useState(false)
  const useCameraBarcodeScanner = isCapacitorNative()
  // Fuerza modo lector físico aunque estemos en Capacitor nativo (donde por defecto se
  // abre cámara). Con esto activo, el efecto de abajo no reabre la cámara.
  const [forcePhysicalScanner, setForcePhysicalScanner] = useState(false)
  const usingCameraNow = useCameraBarcodeScanner && !forcePhysicalScanner

  const focusScanInput = useCallback(() => {
    window.setTimeout(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }, 0)
  }, [])

  const resolveProduct = useCallback(
    async (code: string): Promise<Product | null> => {
      const trimmed = code.trim()
      if (!trimmed) return null
      return (
        findProductByBarcodeInList(products, trimmed) ??
        (await productsService.lookupByBarcode(trimmed, branchId ?? undefined))
      )
    },
    [products, branchId],
  )

  const closeScanner = useCallback(() => {
    setScannerMode(false)
    setCameraScannerOpen(false)
    setScanQuery('')
    setForcePhysicalScanner(false)
  }, [])

  const handleBarcodeScan = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim()
      if (!code || scanProcessing) return
      setScanProcessing(true)
      try {
        const product = await resolveProduct(code)
        if (product) {
          onProductFound(product)
          setScanQuery('')
          onClearSearch?.()
          if (showSuccessToast) toast.success(`${product.name} agregado`)
          if (usingCameraNow && closeCameraOnScan) {
            closeScanner()
          } else if (!usingCameraNow) {
            focusScanInput()
          }
        } else {
          toast.error('No se encontró un producto con ese código')
        }
      } catch {
        toast.error('Error al buscar el producto')
      } finally {
        setScanProcessing(false)
      }
    },
    [
      closeCameraOnScan,
      closeScanner,
      focusScanInput,
      onClearSearch,
      onProductFound,
      resolveProduct,
      scanProcessing,
      showSuccessToast,
      usingCameraNow,
    ],
  )

  const activateScanner = useCallback(() => {
    setForcePhysicalScanner(false)
    setScannerMode(true)
    if (useCameraBarcodeScanner) {
      setCameraScannerOpen(true)
    } else {
      focusScanInput()
    }
  }, [focusScanInput, useCameraBarcodeScanner])

  const deactivateScanner = useCallback(() => {
    closeScanner()
  }, [closeScanner])

  const toggleScannerMode = useCallback(() => {
    setScannerMode(on => {
      const next = !on
      if (!next) {
        setCameraScannerOpen(false)
        setScanQuery('')
        setForcePhysicalScanner(false)
      } else {
        setForcePhysicalScanner(false)
        if (useCameraBarcodeScanner) {
          setCameraScannerOpen(true)
        } else {
          focusScanInput()
        }
      }
      return next
    })
  }, [focusScanInput, useCameraBarcodeScanner])

  /**
   * Fuerza el modo "lector físico" (foco en el input, sin cámara) aunque estemos en
   * Capacitor nativo, donde por defecto se abre cámara. La cámara sigue disponible
   * aparte con `activateScanner`/`toggleScannerMode`.
   */
  const activatePhysicalScanner = useCallback(() => {
    setForcePhysicalScanner(true)
    setCameraScannerOpen(false)
    setScannerMode(true)
    focusScanInput()
  }, [focusScanInput])

  useEffect(() => {
    if (!scannerMode) {
      setCameraScannerOpen(false)
      return
    }
    if (usingCameraNow) {
      setCameraScannerOpen(true)
      return
    }
    focusScanInput()
  }, [scannerMode, usingCameraNow, focusScanInput])

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (scannerMode && e.key === 'Enter') {
        e.preventDefault()
        void handleBarcodeScan(e.currentTarget.value)
      }
    },
    [handleBarcodeScan, scannerMode],
  )

  const handleWedgeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        void handleBarcodeScan(e.currentTarget.value)
        e.currentTarget.value = ''
      }
    },
    [handleBarcodeScan],
  )

  return {
    searchInputRef,
    wedgeInputRef,
    scannerMode,
    cameraScannerOpen,
    useCameraBarcodeScanner,
    usingCameraNow,
    scanQuery,
    setScanQuery,
    scanProcessing,
    activateScanner,
    activatePhysicalScanner,
    deactivateScanner,
    closeScanner,
    toggleScannerMode,
    handleBarcodeScan,
    handleSearchKeyDown,
    handleWedgeKeyDown,
  }
}
