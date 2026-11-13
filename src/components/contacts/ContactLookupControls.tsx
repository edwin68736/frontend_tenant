import { SearchCheck } from 'lucide-react'

/**
 * Botón «Consultar» del N° de documento (RUC/DNI). Va en color primario para que se note que es la acción que trae los datos;
 * en pantallas chicas muestra solo el icono (el texto queda para lectores de pantalla y tooltip).
 */
export function ConsultaButton({
  onClick,
  disabled,
  loading,
  title = 'Consultar DNI o RUC en SUNAT',
}: {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap bg-[rgb(var(--p600))] text-white hover:opacity-90 disabled:opacity-50"
      title={title}
      aria-label="Consultar"
    >
      <SearchCheck size={15} className={loading ? 'animate-pulse' : ''} />
      <span className="hidden sm:inline">{loading ? '...' : 'Consultar'}</span>
    </button>
  )
}

/**
 * Interruptor «Escribir manualmente» de la razón social. Con RUC/DNI el nombre viene de la consulta (bloqueado) para evitar
 * errores de tipeo; activarlo permite escribirlo a mano.
 */
export function ManualNameToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-gray-500 select-none">
      <input type="checkbox" className="h-3.5 w-3.5 accent-[rgb(var(--p600))]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Escribir manualmente
    </label>
  )
}

/** Clases del campo de razón social según esté bloqueado (viene de la consulta) o editable. */
export function nameInputClass(locked: boolean, base = 'w-full border rounded-xl px-3 py-2 text-sm'): string {
  return locked
    ? `${base} border-gray-200 bg-gray-50 text-gray-700 cursor-not-allowed focus:outline-none`
    : `${base} border-gray-200 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--p600))] focus:border-[rgb(var(--p600))]`
}
