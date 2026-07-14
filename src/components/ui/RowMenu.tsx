import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

export type RowMenuItem = {
  icon?: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  /** Si true, el ítem no se renderiza (útil para acciones condicionales por fila). */
  hidden?: boolean
}

/**
 * Menú desplegable (toggle) para agrupar acciones de una fila de tabla, con ícono + label.
 * Renderiza el menú vía portal en document.body (posición calculada) para no ser recortado
 * por contenedores con overflow. Se cierra al hacer clic fuera, al hacer scroll o redimensionar.
 */
export function RowMenu({
  items,
  triggerIcon,
  triggerLabel,
  triggerClassName,
  title,
  menuWidth = 210,
  align = 'right',
  emptyPlaceholder = <span className="text-gray-300 text-xs">—</span>,
}: {
  items: RowMenuItem[]
  triggerIcon?: ReactNode
  triggerLabel?: string
  triggerClassName?: string
  title?: string
  menuWidth?: number
  align?: 'left' | 'right'
  emptyPlaceholder?: ReactNode
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const visibleItems = items.filter((i) => !i.hidden)

  useEffect(() => {
    if (!pos) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('[data-rowmenu-portal]')) return
      if (t === btnRef.current || btnRef.current?.contains(t)) return
      setPos(null)
    }
    const onMove = () => setPos(null)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [pos])

  if (visibleItems.length === 0) return <>{emptyPlaceholder}</>

  const toggle = () => {
    if (pos) {
      setPos(null)
      return
    }
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const left =
      align === 'right'
        ? Math.min(window.innerWidth - menuWidth - 8, Math.max(8, r.right - menuWidth))
        : Math.max(8, r.left)
    setPos({ top: r.bottom + 6, left })
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          toggle()
        }}
        title={title}
        aria-haspopup="menu"
        aria-expanded={Boolean(pos)}
        className={
          triggerClassName ??
          'inline-flex items-center gap-0.5 p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg ring-1 ring-gray-200 disabled:opacity-40'
        }
      >
        {triggerIcon}
        {triggerLabel ? <span className="text-xs font-medium">{triggerLabel}</span> : null}
        <ChevronDown size={12} className="opacity-70" aria-hidden />
      </button>
      {pos &&
        createPortal(
          <div
            data-rowmenu-portal
            role="menu"
            className="fixed z-[9999] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl"
            style={{ top: pos.top, left: pos.left, width: menuWidth }}
          >
            {visibleItems.map((it, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={(e) => {
                  e.stopPropagation()
                  setPos(null)
                  it.onClick()
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent ${
                  it.danger ? 'text-red-600' : 'text-gray-700'
                }`}
              >
                {it.icon ? <span className="shrink-0">{it.icon}</span> : null}
                <span className="truncate">{it.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
