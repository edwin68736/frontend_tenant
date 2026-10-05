import { Ban } from 'lucide-react'

/**
 * Interruptor "Solo anuladas" para las listas de ventas. Apagado = comportamiento de siempre
 * (anuladas y no anuladas mezcladas); encendido = el listado muestra únicamente las anuladas
 * (sale_status=cancelled en GET /api/sales).
 */
export function OnlyCancelledSwitch({
  checked,
  onChange,
  className = '',
}: {
  checked: boolean
  onChange: (next: boolean) => void
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      title="Muestra solo los comprobantes anulados"
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
        checked
          ? 'border-red-300 bg-red-50 text-red-700'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
      } ${className}`}
    >
      <span
        aria-hidden
        className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-red-500' : 'bg-gray-300'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[1.1rem]' : 'left-0.5'}`}
        />
      </span>
      <Ban size={14} aria-hidden />
      Solo anuladas
    </button>
  )
}
