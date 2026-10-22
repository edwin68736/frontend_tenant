import { useEffect, useState, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
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

/** Sección del formulario: mismo patrón que el de ventas (divisor superior y título corto). */
export function Section({
  title,
  errors,
  showErrors,
  children,
  right,
}: {
  title?: string
  errors?: string[]
  showErrors?: boolean
  children: ReactNode
  right?: ReactNode
}) {
  return (
    <section className="border-t border-gray-100 pt-5 space-y-3">
      {(title || right) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h2>}
          {right}
        </div>
      )}
      {children}
      {showErrors && !!errors?.length && (
        <ul className="space-y-1" role="alert">
          {errors.map((e, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-red-600">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>{e}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
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
