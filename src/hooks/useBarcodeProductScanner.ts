import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { productsService, type Product } from '@/services/products.service'
import { findProductByBarcodeInList } from '@/utils/barcodeLookup'
import { isCapacitorNative } from '@/lib/platform/detect'

type Options = {
  products?: Product[]
  branchId?: number | null
  onProductFound: (product: Product) => void
  /** Limpia el campo de búsqueda tras agregar (POS). */
  onClearSearch?: () => void
  /** Si false, no muestra toast de éxito (p. ej. cuando onProductFound ya lo hace). */
  showSuccessToast?: boolean
}

export function useBarcodeProductScanner({
  products = [],
  branchId,
  onProductFound,
  onClearSearch,
  showSuccessToast = true,
}: Options) {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const wedgeInputRef = useRef<HTMLInputElement>(null)
  const [scannerMode, setScannerMode] = useState(false)
  const [scanQuery, setScanQuery] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [scanProcessing, setScanProcessing] = useState(false)
  const useCameraScanner = isCapacitorNative()

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
          searchInputRef.current?.focus()
        } else {
          toast.error('No se encontró un producto con ese código')
        }
      } catch {
        toast.error('Error al buscar el producto')
      } finally {
        setScanProcessing(false)
      }
    },
    [onClearSearch, onProductFound, resolveProduct, scanProcessing, showSuccessToast],
  )

  const activateScanner = useCallback(() => {
    setScannerMode(true)
    if (useCameraScanner) setCameraOpen(true)
    window.setTimeout(() => searchInputRef.current?.focus(), 0)
  }, [useCameraScanner])

  const deactivateScanner = useCallback(() => {
    setScannerMode(false)
    setScanQuery('')
    setCameraOpen(false)
  }, [])

  const toggleScannerMode = useCallback(() => {
    setScannerMode(on => {
      const next = !on
      if (!next) {
        setScanQuery('')
        setCameraOpen(false)
      } else {
        if (useCameraScanner) setCameraOpen(true)
        window.setTimeout(() => searchInputRef.current?.focus(), 0)
      }
      return next
    })
  }, [useCameraScanner])

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
    scanQuery,
    setScanQuery,
    cameraOpen,
    setCameraOpen,
    scanProcessing,
    useCameraScanner,
    activateScanner,
    deactivateScanner,
    toggleScannerMode,
    handleBarcodeScan,
    handleSearchKeyDown,
    handleWedgeKeyDown,
  }
}
