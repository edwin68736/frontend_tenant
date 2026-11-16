import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Package, X } from 'lucide-react'
import { PortalModal } from '@/components/ui/PortalModal'
import { getProductImageUrl, productsService, type Product } from '@/services/products.service'
import { formatMoney } from '@/utils/format'
import { productNeedsSaleConfiguration } from '@/utils/productModifiers'

type Props = {
  open: boolean
  onClose: () => void
  product: Product | null
}

/**
 * Vista ampliada de un producto desde su tarjeta en el POS (como el detalle de la tienda virtual, pero solo
 * para mirar: no agrega al carrito). Parte de la imagen principal y suma la galería si el usuario puede
 * leerla (products.view); sin ese permiso se queda con la principal, nunca falla ni oculta el botón.
 */
export function PosProductPreviewModal({ open, onClose, product }: Props) {
  const [extra, setExtra] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const touchX = useRef<number | null>(null)
  const productId = product?.id

  useEffect(() => {
    setExtra([])
    setIndex(0)
    if (!open || !productId) return
    let cancelled = false
    productsService
      .listGallery(productId)
      .then((rows) => {
        if (!cancelled) setExtra(rows.map((r) => getProductImageUrl(r.url)).filter(Boolean))
      })
      .catch(() => {
        /* sin permiso o sin galería: queda la imagen principal */
      })
    return () => {
      cancelled = true
    }
  }, [open, productId])

  // Escape cierra y las flechas del teclado pasan de imagen (PortalModal no maneja teclado).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setIndex((i) => i + 1)
      else if (e.key === 'ArrowLeft') setIndex((i) => i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!product) return null

  const main = getProductImageUrl(product.image_url)
  const images = [main, ...extra].filter((u, i, a) => u && a.indexOf(u) === i)
  const count = images.length
  const go = (d: number) => setIndex((i) => (count === 0 ? 0 : (i + d + count) % count))
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
  }

  const shownPrice =
    product.has_variants && product.min_presentation_price !== undefined && !(Number(product.sale_price) > 0)
      ? Number(product.min_presentation_price)
      : Number(product.sale_price)
  const priceLabel = `${productNeedsSaleConfiguration(product) ? 'Desde ' : ''}${formatMoney(shownPrice)}`
  const details: [string, string | undefined][] = [
    ['Código', product.code],
    ['Categoría', product.category_name],
    ['Marca', product.brand_name],
    ['Unidad', product.unit],
  ]

  return (
    <PortalModal open={open} onClose={onClose} className="max-w-md" stacked>
      <div className="bg-white rounded-2xl shadow-xl w-full overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-stone-200">
          <h3 className="font-bold text-stone-900 text-sm truncate pr-2">Vista del producto</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-stone-100 shrink-0" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto">
          <div
            className="relative aspect-square bg-stone-100 flex items-center justify-center select-none"
            onTouchStart={(e) => {
              touchX.current = e.touches[0].clientX
            }}
            onTouchEnd={onTouchEnd}
          >
            {count === 0 ? (
              <Package className="w-16 h-16 text-stone-300" aria-hidden />
            ) : (
              <img src={images[((index % count) + count) % count]} alt={product.name} className="w-full h-full object-contain" decoding="async" />
            )}
            {count > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Imagen anterior"
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 shadow flex items-center justify-center text-stone-700 hover:bg-white"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Imagen siguiente"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 shadow flex items-center justify-center text-stone-700 hover:bg-white"
                >
                  <ChevronRight size={18} />
                </button>
                <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white tabular-nums">
                  {(((index % count) + count) % count) + 1} / {count}
                </span>
              </>
            )}
          </div>

          {count > 1 && (
            <div className="flex gap-2 overflow-x-auto px-3 pt-3">
              {images.map((u, i) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Ver imagen ${i + 1}`}
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${i === ((index % count) + count) % count ? 'border-primary-500' : 'border-transparent opacity-70 hover:opacity-100'}`}
                >
                  <img src={u} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}

          <div className="p-4 space-y-3">
            <div>
              <p className="font-semibold text-stone-900 leading-snug">{product.name}</p>
              <p className="mt-1 text-lg font-bold text-primary-600 tabular-nums">{priceLabel}</p>
            </div>
            {product.description?.trim() ? (
              <p className="text-sm text-stone-600 whitespace-pre-line">{product.description.trim()}</p>
            ) : null}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {details
                .filter(([, v]) => v && String(v).trim())
                .map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-stone-400">{k}</dt>
                    <dd className="text-stone-700 truncate">{v}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </div>
      </div>
    </PortalModal>
  )
}
