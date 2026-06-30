import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
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
}

/** Escáner por input + foco + lector USB (sin cámara ni html5-qrcode). */
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
  const [scanProcessing, setScanProcessing] = useState(false)

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
          focusScanInput()
        } else {
          toast.error('No se encontró un producto con ese código')
        }
      } catch {
        toast.error('Error al buscar el producto')
      } finally {
        setScanProcessing(false)
      }
    },
    [focusScanInput, onClearSearch, onProductFound, resolveProduct, scanProcessing, showSuccessToast],
  )

  const activateScanner = useCallback(() => {
    setScannerMode(true)
    focusScanInput()
  }, [focusScanInput])

  const deactivateScanner = useCallback(() => {
    setScannerMode(false)
    setScanQuery('')
  }, [])

  const toggleScannerMode = useCallback(() => {
    setScannerMode(on => {
      const next = !on
      if (!next) {
        setScanQuery('')
      } else {
        focusScanInput()
      }
      return next
    })
  }, [focusScanInput])

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
    scanProcessing,
    activateScanner,
    deactivateScanner,
    toggleScannerMode,
    handleBarcodeScan,
    handleSearchKeyDown,
    handleWedgeKeyDown,
  }
}
