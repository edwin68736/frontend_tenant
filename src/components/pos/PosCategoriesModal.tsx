import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Check, LayoutGrid, Search, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import type { Category } from '@/services/products.service'

interface PosCategoriesModalProps {
  open: boolean
  onClose: () => void
  categories: Category[]
  selectedCat: number | null
  /** Selecciona una categoría (o `null` para "Todas") y cierra el modal. */
  onSelect: (id: number | null) => void
}

/**
 * Color del nombre de cada categoría (ciclado por id: mismo color siempre para la misma).
 * Tonos 700: sobre blanco cumplen contraste AA, así que el color identifica sin restar
 * legibilidad al nombre, que aquí es lo único que se lee.
 */
const CATEGORY_STYLES = [
  'border-rose-300 bg-rose-50 text-rose-700',
  'border-amber-300 bg-amber-50 text-amber-700',
  'border-emerald-300 bg-emerald-50 text-emerald-700',
  'border-sky-300 bg-sky-50 text-sky-700',
  'border-violet-300 bg-violet-50 text-violet-700',
  'border-teal-300 bg-teal-50 text-teal-700',
  'border-orange-300 bg-orange-50 text-orange-700',
  'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700',
]

function categoryStyle(id: number): string {
  return CATEGORY_STYLES[Math.abs(id) % CATEGORY_STYLES.length]
}

/** Normaliza para búsqueda: minúsculas y sin tildes. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/** Lista completa de categorías en cards, para elegir cuando hay muchas y la barra horizontal no alcanza. */
export function PosCategoriesModal({
  open,
  onClose,
  categories,
  selectedCat,
  onSelect,
}: PosCategoriesModalProps) {
  const [query, setQuery] = useState('')

  // Limpia la búsqueda cada vez que se abre el modal.
  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const filtered = useMemo(() => {
    const q = normalize(query)
    if (!q) return categories
    return categories.filter(
      c => normalize(c.name).includes(q) || (c.description ? normalize(c.description).includes(q) : false),
    )
  }, [categories, query])

  const pick = (id: number | null) => {
    onSelect(id)
    onClose()
  }

  // Alto fijo + centrado: todas las tarjetas miden igual aunque el nombre ocupe una o dos
  // líneas, así la cuadrícula no queda irregular.
  const cardBase =
    'group relative flex h-[4.5rem] items-center justify-center rounded-2xl border px-3 py-2 text-center transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'

  return (
    <Modal open={open} onClose={onClose} contentClassName="max-w-3xl">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutGrid size={18} className="text-primary-600" aria-hidden />
            <h2 className="text-base font-semibold text-stone-800">Categorías</h2>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">
              {query.trim() ? `${filtered.length}/${categories.length}` : categories.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative flex items-center">
          <Search size={16} className="pointer-events-none absolute left-3 text-stone-400" aria-hidden />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar categoría..."
            className="w-full rounded-xl border border-stone-200 bg-white py-2 pl-9 pr-9 text-sm text-stone-800 placeholder:text-stone-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              aria-label="Limpiar búsqueda"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {/* Card "Todas" (solo sin búsqueda activa) */}
        {!query.trim() && (
          <button
            type="button"
            onClick={() => pick(null)}
            className={clsx(
              cardBase,
              'border-primary-300 bg-primary-50 text-primary-700',
              selectedCat === null
                ? 'ring-2 ring-primary-600 shadow-sm'
                : 'hover:-translate-y-0.5 hover:shadow-md',
            )}
          >
            <span className="line-clamp-2 text-sm font-bold leading-snug">Todas</span>
            {selectedCat === null && (
              <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm">
                <Check size={12} aria-hidden />
              </span>
            )}
          </button>
        )}

        {filtered.map(c => {
          const selected = selectedCat === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c.id)}
              className={clsx(
                cardBase,
                // Fondo pastel del color de la categoría: identifica de un vistazo.
                categoryStyle(c.id),
                selected
                  ? 'ring-2 ring-primary-600 shadow-sm'
                  : 'hover:-translate-y-0.5 hover:shadow-md',
              )}
              title={c.name}
            >
              <span className="line-clamp-2 text-sm font-bold leading-snug">{c.name}</span>
              {selected && (
                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm">
                  <Check size={12} aria-hidden />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-400">
            <Search size={20} aria-hidden />
          </span>
          <p className="text-sm font-medium text-stone-600">Sin coincidencias</p>
          <p className="text-xs text-stone-400">
            No hay categorías que coincidan con “{query.trim()}”.
          </p>
        </div>
      )}
    </Modal>
  )
}
