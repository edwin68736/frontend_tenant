import { type ReactNode, useEffect, useCallback, useState, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  open: boolean
  onClose?: () => void
  children: ReactNode
  /** Clases adicionales para el contenedor del contenido (ej. max-w-4xl). */
  contentClassName?: string
  /** Si es false, el modal no se cierra al hacer clic en el fondo (solo vía botones que llamen onClose). Por defecto true. */
  closeOnBackdropClick?: boolean
  /** Capa superior cuando se abre encima de otro modal (picker, etc.). */
  stacked?: boolean
}

export function Modal({ open, onClose, children, contentClassName, closeOnBackdropClick = true, stacked = false }: ModalProps) {
  const [focusMoved, setFocusMoved] = useState(true)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  useEffect(() => {
    if (open) {
      setFocusMoved(false)
    } else {
      const moveFocus = () => {
        const active = document.activeElement
        if (active instanceof HTMLElement && overlayRef.current?.contains(active)) {
          active.blur()
          document.body.setAttribute('tabindex', '-1')
          document.body.focus({ preventScroll: true })
        }
        setFocusMoved(true)
      }
      requestAnimationFrame(moveFocus)
    }
  }, [open])

  const handleClose = useCallback(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement && document.body.contains(active)) {
      active.blur()
      document.body.setAttribute('tabindex', '-1')
      document.body.focus({ preventScroll: true })
    }
    onClose?.()
  }, [onClose])

  const handleBackdropClick = useCallback(() => {
    if (!closeOnBackdropClick) return
    handleClose()
  }, [closeOnBackdropClick, handleClose])

  if (typeof document === 'undefined') return null

  // Evitar aria-hidden mientras el foco sigue dentro (provoca aviso de accesibilidad).
  const ariaHidden = !open && focusMoved

  const contentClasses = contentClassName
    ? `bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full p-4 sm:p-6 md:p-7 space-y-4 max-h-[min(92dvh,900px)] overflow-y-auto overscroll-contain ${contentClassName}`
    : `bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-xl md:max-w-lg p-4 sm:p-6 md:p-7 space-y-4 max-h-[min(92dvh,900px)] overflow-y-auto overscroll-contain`

  return createPortal(
    <div
      ref={overlayRef}
      className={`fixed inset-0 ${stacked ? 'z-[110]' : 'z-[100]'} flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm`}
      style={{ display: open ? undefined : 'none', pointerEvents: open ? undefined : 'none' }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-hidden={ariaHidden}
    >
      <div
        className={contentClasses}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

