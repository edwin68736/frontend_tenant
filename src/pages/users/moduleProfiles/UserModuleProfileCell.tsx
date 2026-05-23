import { Settings2 } from 'lucide-react'
import type { ModuleProfileSummary } from './types'

type Props = {
  summary: ModuleProfileSummary
  onConfigure: () => void
  configureLabel?: string
}

/** Celda reutilizable: resumen + botón para abrir modal de perfil del módulo. */
export function UserModuleProfileCell({ summary, onConfigure, configureLabel = 'Configurar' }: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 min-w-[100px]">
      <div className="min-w-0">
        <span
          className={`text-xs font-medium block truncate ${
            summary.configured ? 'text-gray-800' : 'text-gray-400'
          }`}
        >
          {summary.primary}
        </span>
        {summary.secondary && (
          <span className="text-[10px] text-gray-500 block truncate">{summary.secondary}</span>
        )}
      </div>
      <button
        type="button"
        onClick={onConfigure}
        className="inline-flex items-center gap-1 text-xs text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] px-2 py-1 rounded-lg whitespace-nowrap shrink-0"
        title={configureLabel}
      >
        <Settings2 size={12} />
        {configureLabel}
      </button>
    </div>
  )
}
