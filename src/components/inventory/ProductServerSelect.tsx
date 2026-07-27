import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { productsService } from '@/services/products.service'

export interface ProductOption {
  id: number
  name: string
  code?: string
}

const DEBOUNCE_MS = 350
const PAGE_SIZE = 20

/**
 * Select de producto con búsqueda del lado del servidor: pide de a PAGE_SIZE al backend
 * (solo productos con manage_stock) en vez de cargar y filtrar el catálogo completo en el
 * cliente. Pensado para catálogos grandes donde traer todo de una vez es lento.
 */
export function ProductServerSelect({
  value,
  onChange,
  placeholder = 'Buscar producto...',
  className = '',
}: {
  value: ProductOption | null
  onChange: (product: ProductOption | null) => void
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [options, setOptions] = useState<ProductOption[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    productsService
      .list(debouncedQuery, undefined, undefined, true, 1, PAGE_SIZE, true)
      .then(({ data }) => {
        if (cancelled) return
        setOptions((data ?? []).map((p) => ({ id: p.id, name: p.name, code: p.code })))
      })
      .catch(() => { if (!cancelled) setOptions([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, debouncedQuery])

  useEffect(() => {
    if (open) {
      setQuery('')
      setDebouncedQuery('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleSelect = (opt: ProductOption) => {
    onChange(opt)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full border border-gray-200 rounded-xl pl-3 pr-9 py-2 text-sm text-left bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--p400))] focus:border-[rgb(var(--p400))] flex items-center justify-between gap-2"
      >
        <span className={value ? 'text-gray-800 truncate' : 'text-gray-500 truncate'}>
          {value ? value.name : placeholder}
        </span>
        {value ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange(null) }}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <X size={15} />
          </span>
        ) : (
          <ChevronDown size={16} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && (
        <div className="absolute z-[200] mt-1 w-full min-w-[240px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100 bg-gray-50/80">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nombre o código..."
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--p400))]"
              />
            </div>
          </div>
          <ul className="max-h-[240px] overflow-y-auto py-1">
            {loading ? (
              <li className="px-3 py-4 text-sm text-gray-500 text-center">
                <div className="inline-block w-4 h-4 border-2 border-gray-300 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
              </li>
            ) : options.length === 0 ? (
              <li className="px-3 py-4 text-sm text-gray-500 text-center">Sin resultados</li>
            ) : (
              options.map((opt) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 truncate ${
                      value?.id === opt.id ? 'bg-[rgb(var(--p50))] text-[rgb(var(--p600))] font-medium' : 'text-gray-800'
                    }`}
                  >
                    {opt.name}
                    <span className="block text-[10px] text-gray-400 font-mono">{opt.code || 'Sin código'}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
