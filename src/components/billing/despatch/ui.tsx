import { useEffect, useState, type ReactNode } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import { ubigeoService, ubigeoToIds } from '@/services/ubigeo.service'

export const inputCls =
  'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[rgb(var(--p400))] bg-white disabled:bg-gray-50 disabled:text-gray-500'

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
    </label>
  )
}

/** Sección numerada del formulario guiado, con el estado (lista / falta algo) a la vista. */
export function SectionCard({
  n,
  title,
  subtitle,
  errors,
  showErrors,
  children,
  right,
}: {
  n: number
  title: string
  subtitle?: string
  errors?: string[]
  showErrors?: boolean
  children: ReactNode
  right?: ReactNode
}) {
  const hasErr = !!errors?.length
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5" data-section={n}>
      <header className="flex items-start gap-3 mb-4">
        <span
          className={`shrink-0 w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${
            hasErr ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {hasErr ? n : <Check size={14} />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </header>
      <div className="space-y-4">{children}</div>
      {showErrors && hasErr && (
        <ul className="mt-4 space-y-1" role="alert">
          {errors!.map((e, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>{e}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function ChoiceCard({
  selected,
  onClick,
  title,
  hint,
  icon,
  disabled,
}: {
  selected: boolean
  onClick: () => void
  title: string
  hint?: string
  icon?: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={`text-left rounded-xl border px-3.5 py-3 transition-colors disabled:opacity-50 ${
        selected ? 'border-[rgb(var(--p500))] bg-[rgb(var(--p50))] ring-1 ring-[rgb(var(--p400))]' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
        {icon}
        {title}
      </span>
      {hint && <span className="block text-[11px] text-gray-500 mt-0.5">{hint}</span>}
    </button>
  )
}

const ubigeoLabelCache = new Map<string, string>()

/** Nombre legible (distrito, provincia) de un código de ubigeo; vacío mientras carga. */
export function useUbigeoLabel(code: string): string {
  const [label, setLabel] = useState(() => ubigeoLabelCache.get(code) ?? '')
  useEffect(() => {
    if (!code || code.length < 6) {
      setLabel('')
      return
    }
    const cached = ubigeoLabelCache.get(code)
    if (cached) {
      setLabel(cached)
      return
    }
    let alive = true
    const ids = ubigeoToIds(code)
    ubigeoService
      .getDistritos(ids.provinciaId)
      .then((list) => {
        const d = list.find((x) => x.id === code)
        if (!d) return
        const text = d.info_busqueda?.trim() || d.nombre
        ubigeoLabelCache.set(code, text)
        if (alive) setLabel(text)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [code])
  return label
}
