import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Package } from 'lucide-react'
import { resolvePublicAssetUrl } from '@/config/apiBaseUrl'
import { publicEcommerceService } from '@/services/ecommerce.service'

/**
 * Galería del detalle de producto de la tienda virtual: imagen grande con flechas, deslizar en móvil,
 * puntos y miniaturas. Parte de la imagen principal que ya trae la lista y carga el resto (la galería
 * del producto) al abrirse, sin esperar para mostrar algo.
 */
export default function ProductGallery({
  productId,
  mainImage,
  name,
  children,
}: {
  productId: number
  mainImage?: string | null
  name: string
  /** Insignias superpuestas (p. ej. «Agotado»). */
  children?: React.ReactNode
}) {
  const [images, setImages] = useState<string[]>(() => (mainImage ? [mainImage] : []))
  const [index, setIndex] = useState(0)
  const touchX = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    publicEcommerceService
      .getProductGallery(productId)
      .then((urls) => {
        if (cancelled || urls.length === 0) return
        setImages(urls)
        setIndex(0)
      })
      .catch(() => {
        /* si falla se queda con la imagen principal */
      })
    return () => {
      cancelled = true
    }
  }, [productId])

  const count = images.length
  const go = (delta: number) => setIndex((i) => (count === 0 ? 0 : (i + delta + count) % count))

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
  }

  if (count === 0) {
    return (
      <div className="aspect-square bg-gray-100 relative flex items-center justify-center text-gray-300">
        <Package size={40} />
        {children}
      </div>
    )
  }

  return (
    <div
      className="bg-gray-100 outline-none"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1)
        if (e.key === 'ArrowLeft') go(-1)
      }}
    >
      <div
        className="aspect-square relative overflow-hidden select-none"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={onTouchEnd}
      >
        {images.map((url, i) => (
          <img
            key={url + i}
            src={resolvePublicAssetUrl(url)}
            alt={i === index ? name : ''}
            draggable={false}
            loading={i === 0 ? 'eager' : 'lazy'}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${i === index ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          />
        ))}
        {children}
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Imagen anterior"
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/90 text-gray-700 shadow hover:bg-white"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Imagen siguiente"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/90 text-gray-700 shadow hover:bg-white"
            >
              <ChevronRight size={18} />
            </button>
            <span className="absolute bottom-2 right-3 text-[11px] font-medium text-white bg-black/50 rounded-full px-2 py-0.5 tabular-nums">
              {index + 1}/{count}
            </span>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="flex gap-2 overflow-x-auto p-2 bg-white border-t border-gray-100">
          {images.map((url, i) => (
            <button
              key={url + i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Ver imagen ${i + 1}`}
              aria-current={i === index}
              className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 ${i === index ? '' : 'border-transparent opacity-70 hover:opacity-100'}`}
              style={i === index ? { borderColor: 'rgb(var(--vs-primary))' } : undefined}
            >
              <img src={resolvePublicAssetUrl(url)} alt="" loading="lazy" draggable={false} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
