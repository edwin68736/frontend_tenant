import { FileText, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'

const REQUIRED_DOCS = ['Nota de venta', 'Boleta', 'Factura'] as const

type Props = {
  compact?: boolean
  className?: string
}

export function BranchSeriesEmptyState({ compact = false, className }: Props) {
  const navigate = useNavigate()

  return (
    <div
      className={clsx(
        'rounded-2xl border border-amber-200 bg-amber-50/90 text-gray-800',
        compact ? 'p-4' : 'p-6 sm:p-8',
        className,
      )}
      role="status"
    >
      <div className={clsx('flex gap-3', compact ? 'flex-col items-center text-center' : 'items-start')}>
        <div
          className={clsx(
            'flex shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800',
            compact ? 'h-11 w-11' : 'h-12 w-12',
          )}
        >
          <FileText size={compact ? 22 : 24} aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className={clsx('font-bold text-gray-900', compact ? 'text-sm' : 'text-base')}>
            Esta sucursal aún no tiene series configuradas
          </h3>
          <p className={clsx('text-gray-600', compact ? 'text-xs' : 'text-sm')}>
            Antes de emitir comprobantes debes configurar las series de esta sucursal.
          </p>
          <div className={clsx('text-gray-700', compact ? 'text-xs' : 'text-sm')}>
            <p className="font-medium text-gray-800 mb-1">Requisitos mínimos:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {REQUIRED_DOCS.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={() => navigate('/company/series')}
            className={clsx(
              'inline-flex items-center justify-center gap-2 rounded-xl bg-[rgb(var(--p600))] font-semibold text-white hover:opacity-90 transition-opacity',
              compact ? 'mt-2 w-full px-4 py-2.5 text-sm' : 'mt-3 px-5 py-2.5 text-sm',
            )}
          >
            <Settings size={16} aria-hidden />
            Configurar series
          </button>
        </div>
      </div>
    </div>
  )
}
