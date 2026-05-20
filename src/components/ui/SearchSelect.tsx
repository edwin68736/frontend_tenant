import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search } from 'lucide-react'

/**
 * Select con búsqueda (estilo Select2). Usar en formularios y listas cuando las opciones
 * son muchas (>= MIN_OPTIONS_FOR_SEARCH). Para 3-4 opciones seguir usando <select> nativo.
 */

export interface SearchSelectOption {
  value: string
  label: string
}

export const MIN_OPTIONS_FOR_SEARCH = 5

export interface SearchSelectProps {
  options: SearchSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Si es true, solo se muestra el campo de búsqueda cuando options.length >= MIN_OPTIONS_FOR_SEARCH. Por defecto true. */
  showSearchOnlyWhenMany?: boolean
}

export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Seleccione',
  disabled = false,
  className = '',
  showSearchOnlyWhenMany = true,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedOption = options.find((o) => o.value === value)
  const showSearch = showSearchOnlyWhenMany ? options.length >= MIN_OPTIONS_FOR_SEARCH : true
  const filteredOptions = showSearch && search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()))
    : options

  useEffect(() => {
    if (open && showSearch) {
      setSearch('')
      requestAnimationFrame(() => inputRef.current?.focus())
    } else if (!open) {
      setSearch('')
    }
  }, [open, showSearch])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleSelect = (opt: SearchSelectOption) => {
    onChange(opt.value)
    setOpen(false)
  }

  const baseTriggerClass =
    'w-full border border-gray-200 rounded-xl pl-3 pr-9 py-2 text-sm text-left bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--p400))] focus:border-[rgb(var(--p400))] flex items-center justify-between gap-2'

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`${baseTriggerClass} ${disabled ? 'opacity-60 cursor-not-allowed bg-gray-50' : 'cursor-pointer'}`}
      >
        <span className={value ? 'text-gray-800' : 'text-gray-500 truncate'}>{selectedOption?.label ?? placeholder}</span>
        <ChevronDown size={16} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-[200] mt-1 w-full min-w-[200px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {showSearch && (
            <div className="p-2 border-b border-gray-100 bg-gray-50/80">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--p400))]"
                />
              </div>
            </div>
          )}
          <ul className="max-h-[200px] overflow-y-auto py-1">
            <li>
              <button
                type="button"
                onClick={() => handleSelect({ value: '', label: placeholder })}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${!value ? 'bg-[rgb(var(--p50))] text-[rgb(var(--p600))]' : 'text-gray-600'}`}
              >
                {placeholder}
              </button>
            </li>
            {filteredOptions.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 truncate ${value === opt.value ? 'bg-[rgb(var(--p50))] text-[rgb(var(--p600))] font-medium' : 'text-gray-800'}`}
                >
                  {opt.label}
                </button>
              </li>
            ))}
            {showSearch && search.trim() && filteredOptions.length === 0 && (
              <li className="px-3 py-4 text-sm text-gray-500 text-center">Sin resultados</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
