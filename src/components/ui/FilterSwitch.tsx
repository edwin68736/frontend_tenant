/** Switch con label arriba (misma altura/alineación que los demás filtros, en vez de un checkbox suelto). */
export function FilterSwitch({
  label,
  checked,
  onChange,
  className = 'w-full sm:w-auto',
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
          checked ? 'bg-[rgb(var(--p600))]' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  )
}
