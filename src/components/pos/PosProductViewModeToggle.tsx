import { clsx } from 'clsx'
import { LayoutGrid, List } from 'lucide-react'
import type { PosProductViewMode } from '@/utils/posProductViewMode'

type Props = {
  mode: PosProductViewMode
  onChange: (mode: PosProductViewMode) => void
}

/** Alterna tarjetas / lista en el catálogo del POS. */
export function PosProductViewModeToggle({ mode, onChange }: Props) {
  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-xl border border-stone-200 bg-stone-50 p-0.5">
      {(
        [
          { value: 'grid' as const, icon: LayoutGrid, label: 'Ver en tarjetas' },
          { value: 'list' as const, icon: List, label: 'Ver en lista' },
        ]
      ).map(({ value, icon: Icon, label }) => {
        const active = mode === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={clsx(
              'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50',
              active
                ? 'bg-primary-600 text-white'
                : 'text-stone-500 hover:bg-stone-200/70 hover:text-stone-700',
            )}
          >
            <Icon size={16} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
