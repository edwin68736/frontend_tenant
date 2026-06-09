import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Package } from 'lucide-react'

/** Vuelo directo al carrito, sin pausa inicial. */
const FLY_DURATION_MS = 320

type FlyItem = {
  id: number
  imageUrl: string | null
  from: { x: number; y: number; size: number }
  to: { x: number; y: number; size: number }
}

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
}

/** Fallback si el botón flotante aún no está montado. */
function getFloatingCartRect(): DOMRect {
  const rem = 16
  const btn = 3.5 * rem
  const right = 1 * rem
  const bottom = 1 * rem
  const left = window.innerWidth - right - btn
  const top = window.innerHeight - bottom - btn
  return new DOMRect(left, top, btn, btn)
}

function FlyParticle({
  item,
  onDone,
}: {
  item: FlyItem
  onDone: (id: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const { from, to } = item
    const endSize = Math.max(24, to.size * 0.35)

    const anim = el.animate(
      [
        {
          transform: `translate3d(${from.x}px, ${from.y}px, 0) translate(-50%, -50%) scale(1)`,
          width: `${from.size}px`,
          height: `${from.size}px`,
          opacity: 1,
        },
        {
          transform: `translate3d(${to.x}px, ${to.y}px, 0) translate(-50%, -50%) scale(0.22)`,
          width: `${endSize}px`,
          height: `${endSize}px`,
          opacity: 1,
        },
      ],
      {
        duration: FLY_DURATION_MS,
        easing: 'cubic-bezier(0.33, 0, 0.2, 1)',
        fill: 'forwards',
      },
    )

    anim.onfinish = () => onDone(item.id)
    return () => anim.cancel()
  }, [item, onDone])

  return (
    <div
      ref={ref}
      className="fly-cart-particle pointer-events-none fixed left-0 top-0 z-[106] overflow-hidden rounded-2xl border-[3px] border-white bg-stone-100 will-change-transform"
      style={{ width: item.from.size, height: item.from.size }}
    >
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 text-primary-600">
          <Package size={Math.max(28, item.from.size * 0.4)} strokeWidth={2} aria-hidden />
        </div>
      )}
    </div>
  )
}

type FlyToCartOptions = {
  /** Destino en escritorio (panel lateral del carrito). */
  desktopCartRef?: RefObject<HTMLElement | null>
}

export function useFlyToCart(cartRef: RefObject<HTMLElement | null>, options?: FlyToCartOptions) {
  const desktopCartRef = options?.desktopCartRef
  const [items, setItems] = useState<FlyItem[]>([])
  const idRef = useRef(0)

  const resolveCartRect = useCallback((): DOMRect | null => {
    if (isMobileViewport()) {
      return cartRef.current?.getBoundingClientRect() ?? getFloatingCartRect()
    }
    return desktopCartRef?.current?.getBoundingClientRect() ?? cartRef.current?.getBoundingClientRect() ?? null
  }, [cartRef, desktopCartRef])

  const removeItem = useCallback((id: number) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }, [])

  const cancelFlyAnimations = useCallback(() => {
    setItems([])
  }, [])

  const flyToCart = useCallback(
    (sourceEl: HTMLElement, imageUrl: string | null) => {
      const cartRect = resolveCartRect()
      if (!cartRect) return

      const srcRect = sourceEl.getBoundingClientRect()
      const tileSize = Math.max(srcRect.width, srcRect.height)
      const fromSize = Math.min(96, Math.max(tileSize, 64))

      const from = {
        x: srcRect.left + srcRect.width / 2,
        y: srcRect.top + srcRect.height / 2,
        size: fromSize,
      }
      const to = {
        x: cartRect.left + cartRect.width / 2,
        y: cartRect.top + cartRect.height / 2,
        size: cartRect.width,
      }

      const id = ++idRef.current
      setItems([{ id, imageUrl, from, to }])
    },
    [resolveCartRect],
  )

  const FlyToCartLayer = useCallback(() => {
    if (items.length === 0 || typeof document === 'undefined') return null
    return createPortal(
      <div className="fixed inset-0 pointer-events-none z-[106]" aria-hidden>
        {items.map((item) => (
          <FlyParticle key={item.id} item={item} onDone={removeItem} />
        ))}
      </div>,
      document.body,
    )
  }, [items, removeItem])

  return { flyToCart, FlyToCartLayer, cancelFlyAnimations }
}
