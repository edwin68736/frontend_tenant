import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ShoppingCart, X } from 'lucide-react'
import { clsx } from 'clsx'
import { isTabletCapacitorDevice } from '@/lib/platform/detect'
import { POS_CART_DRAWER_Z } from '@/utils/uiLayers'

type Props = {
  open: boolean
  onClose: () => void
  itemCount: number
  header?: ReactNode
  children: ReactNode
  footer: ReactNode
}

/** Panel carrito móvil/tablet vertical — portal en body para quedar sobre el header. */
export function PosMobileCartDrawer({ open, onClose, itemCount, header, children, footer }: Props) {
  const tablet = isTabletCapacitorDevice()

  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className={clsx('pos-cart-drawer fixed inset-0', POS_CART_DRAWER_Z)}>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />

      <div
        className={clsx(
          'absolute inset-x-0 bottom-0 flex flex-col',
          tablet ? 'px-4 pb-[max(1rem,var(--safe-bottom))]' : 'pb-[max(0.75rem,var(--safe-bottom))]',
        )}
      >
        <div
          className={clsx(
            'pos-cart-drawer-panel w-full bg-white shadow-2xl flex flex-col overflow-hidden ring-1 ring-stone-200/80 mx-auto',
            tablet ? 'rounded-2xl max-w-[min(94vw,42rem)]' : 'rounded-t-2xl',
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Carrito de compras"
        >
          <div
            className={clsx(
              'border-b border-stone-200 flex items-center justify-between gap-2 shrink-0 bg-white',
              tablet ? 'px-5 py-4' : 'px-4 py-3',
            )}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <ShoppingCart size={tablet ? 22 : 20} className="text-primary-600 shrink-0" />
              {header ?? (
                <h3 className={clsx('font-bold text-stone-800 truncate', tablet && 'text-lg')}>
                  Carrito{itemCount > 0 ? ` (${itemCount})` : ''}
                </h3>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-stone-100 text-stone-600 touch-manipulation shrink-0"
              aria-label="Cerrar carrito"
            >
              <X size={tablet ? 22 : 20} />
            </button>
          </div>
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-white">{children}</div>
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  )
}
