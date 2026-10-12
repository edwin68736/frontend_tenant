import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Package } from 'lucide-react'
import { resolvePublicAssetUrl } from '@/config/apiBaseUrl'
import { publicEcommerceService } from '@/services/ecommerce.service'

/**
 * Galería del detalle de producto de la tienda virtual: imagen grande con flechas, deslizar en móvil,
 * contador y miniaturas. Parte de la imagen principal que ya trae la lista y carga el resto (la galería
 * del producto) al abrirse, sin esperar para mostrar algo. Estilos: store.css (.vs-gal-*, .vs-thumbs).
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
      <div className="vs-gal-main" style={{ display: 'grid', placeItems: 'center', color: 'var(--vs-muted)' }}>
        <Package size={48} aria-hidden />
        {children}
      </div>
    )
  }

  return (
    <div
      style={{ outline: 'none' }}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1)
        if (e.key === 'ArrowLeft') go(-1)
      }}
    >
      <div
        className="vs-gal-main"
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
            style={{ opacity: i === index ? 1 : 0, pointerEvents: i === index ? undefined : 'none' }}
          />
        ))}
        {children}
        {count > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Imagen anterior" className="vs-gal-arrow" style={{ left: 10 }}>
              <ChevronLeft size={20} />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Imagen siguiente" className="vs-gal-arrow" style={{ right: 10 }}>
              <ChevronRight size={20} />
            </button>
            <span className="vs-gal-count">{index + 1} / {count}</span>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="vs-thumbs">
          {images.map((url, i) => (
            <button
              key={url + i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Ver imagen ${i + 1}`}
              aria-current={i === index}
              className={i === index ? 'on' : ''}
            >
              <img src={resolvePublicAssetUrl(url)} alt="" loading="lazy" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
