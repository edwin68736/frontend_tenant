import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Check, LayoutGrid, Package, Search, X } from 'lucide-react'
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

/** Paleta suave para el avatar de cada categoría (ciclada por id, look consistente). */
const AVATAR_STYLES = [
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
  'bg-fuchsia-100 text-fuchsia-700',
]

function avatarStyle(id: number): string {
  return AVATAR_STYLES[Math.abs(id) % AVATAR_STYLES.length]
}

/** Normaliza para búsqueda: minúsculas y sin tildes. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
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

  const cardBase =
    'group relative flex flex-col gap-2 rounded-2xl border p-3.5 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'

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
              selectedCat === null
                ? 'border-primary-600 bg-primary-50/70 ring-1 ring-primary-600 shadow-sm'
                : 'border-stone-200 bg-white hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                <LayoutGrid size={18} aria-hidden />
              </span>
              {selectedCat === null && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm">
                  <Check size={14} aria-hidden />
                </span>
              )}
            </div>
            <span className="text-sm font-semibold text-stone-800">Todas</span>
            <span className="text-xs text-stone-400">Ver todos los productos</span>
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
                selected
                  ? 'border-primary-600 bg-primary-50/70 ring-1 ring-primary-600 shadow-sm'
                  : 'border-stone-200 bg-white hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md',
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={clsx(
                    'flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold',
                    avatarStyle(c.id),
                  )}
                >
                  {initials(c.name)}
                </span>
                {selected && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm">
                    <Check size={14} aria-hidden />
                  </span>
                )}
              </div>
              <span className="line-clamp-2 text-sm font-semibold leading-snug text-stone-800">
                {c.name}
              </span>
              {c.description ? (
                <span className="line-clamp-2 text-xs text-stone-400">{c.description}</span>
              ) : null}
              {typeof c.product_count === 'number' && (
                <span className="mt-auto inline-flex w-fit items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500">
                  <Package size={11} aria-hidden />
                  {c.product_count} {c.product_count === 1 ? 'producto' : 'productos'}
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
