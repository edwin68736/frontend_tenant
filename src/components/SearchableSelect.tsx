import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, X } from 'lucide-react'
import { clsx } from 'clsx'
import { DROPDOWN_Z_INDEX } from '@/utils/uiLayers'

export type SearchableSelectOption = {
  value: string | number
  label: string
  disabled?: boolean
}

type MenuPosition = { top: number; left: number; width: number; maxHeight: number }

const MENU_GAP = 6
const MENU_MAX_HEIGHT = 280
const MENU_MIN_HEIGHT = 120

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  menuClassName,
  searchable = true,
  searchPlaceholder = 'Buscar...',
  allowClear = false,
}: {
  value: string | number | null | undefined
  onChange: (value: string | number | null) => void
  options: SearchableSelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  menuClassName?: string
  searchable?: boolean
  searchPlaceholder?: string
  allowClear?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const selected = useMemo(() => {
    const v = value == null ? null : String(value)
    if (v == null) return null
    return options.find((o) => String(o.value) === v) ?? null
  }, [options, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q))
  }, [options, query])

  const showSearch = searchable

  const updateMenuPosition = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP
    const spaceAbove = rect.top - MENU_GAP
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow
    const maxHeight = Math.max(
      MENU_MIN_HEIGHT,
      Math.min(MENU_MAX_HEIGHT, openUp ? spaceAbove - 12 : spaceBelow - 12),
    )

    const top = openUp ? Math.max(MENU_GAP, rect.top - MENU_GAP - maxHeight) : rect.bottom + MENU_GAP

    setMenuPos({
      top,
      left: rect.left,
      width: Math.max(rect.width, 200),
      maxHeight,
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null)
      return
    }
    updateMenuPosition()
  }, [open, updateMenuPosition, filtered.length])

  useEffect(() => {
    if (!open) return
    const onScrollOrResize = (e: Event) => {
      const target = e.target
      if (target instanceof Node && menuRef.current?.contains(target)) return
      updateMenuPosition()
    }
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [open, updateMenuPosition])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (showSearch) {
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open, showSearch])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const searchBlockHeight = showSearch ? 52 : 0
  const listMaxHeight = menuPos ? Math.max(80, menuPos.maxHeight - searchBlockHeight) : MENU_MAX_HEIGHT

  const menuContent = (
    <div
      ref={menuRef}
      style={
        menuPos
          ? {
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
              zIndex: DROPDOWN_Z_INDEX,
            }
          : undefined
      }
      className={clsx(
        'bg-white border border-stone-200 rounded-xl shadow-lg flex flex-col overflow-hidden touch-manipulation',
        menuClassName,
      )}
      onTouchMove={(e) => e.stopPropagation()}
    >
      {showSearch && (
        <div className="shrink-0 p-2 border-b border-stone-100">
          <div className="flex items-center gap-2 px-2 py-1.5 border border-stone-200 rounded-lg">
            <Search size={16} className="text-stone-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false)
              }}
              placeholder={searchPlaceholder}
              className="w-full min-w-0 text-sm outline-none"
            />
          </div>
        </div>
      )}

      <div
        className="overflow-y-auto overscroll-y-contain touch-pan-y min-h-0 flex-1"
        style={{ maxHeight: listMaxHeight }}
        role="listbox"
      >
        {filtered.length === 0 && <div className="px-3 py-3 text-sm text-stone-500">Sin resultados</div>}
        {filtered.map((opt) => {
          const isSelected = selected != null && String(selected.value) === String(opt.value)
          return (
            <button
              key={String(opt.value)}
              type="button"
              disabled={!!opt.disabled}
              onClick={() => {
                if (opt.disabled) return
                onChange(opt.value)
                setOpen(false)
              }}
              className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2 touch-manipulation ${
                opt.disabled ? 'text-stone-300 cursor-not-allowed' : 'hover:bg-stone-50 active:bg-stone-100'
              } ${isSelected ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-stone-700'}`}
            >
              <span className="truncate">{opt.label}</span>
              {isSelected && <span className="text-xs text-primary-600 shrink-0">✓</span>}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter' || e.key === ' ') setOpen(true)
          if (e.key === 'ArrowDown') setOpen(true)
        }}
        className={
          className ??
          'w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-left flex items-center justify-between gap-2 disabled:bg-stone-50 touch-manipulation min-h-[44px]'
        }
      >
        <span className={selected ? 'text-stone-800 truncate' : 'text-stone-400 truncate'}>
          {selected?.label ?? placeholder ?? 'Selecciona'}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {allowClear && !disabled && selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange(null)
                setOpen(false)
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                e.stopPropagation()
                onChange(null)
                setOpen(false)
              }}
              className="p-1 rounded-lg hover:bg-stone-100"
            >
              <X size={16} className="text-stone-500" />
            </span>
          )}
          <ChevronDown size={18} className="text-stone-500" />
        </span>
      </button>

      {open && menuPos && typeof document !== 'undefined' && createPortal(menuContent, document.body)}
    </div>
  )
}
