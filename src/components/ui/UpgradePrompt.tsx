import { useNavigate } from 'react-router-dom'
import { Lock, Sparkles } from 'lucide-react'
import { useModules } from '@/contexts/ModulesContext'

interface Props {
  /** Módulo bloqueado; se usa para mostrar su nombre/descripción desde el catálogo. */
  moduleKey?: string
  /** Título/desccripción explícitos (para cuotas u otros casos que no son un módulo). */
  title?: string
  description?: string
  /** Nota extra debajo (ej. "Mientras tanto solo puede emitir Notas de venta"). */
  note?: string
  /** Variante compacta para banners inline. */
  compact?: boolean
}

/**
 * Vista de "mejora tu plan": se muestra en lugar de ocultar una función que el plan del tenant
 * no incluye (módulo bloqueado o cuota superada). El CTA lleva a /subscription, donde el tenant
 * puede suscribirse a un plan superior.
 */
export default function UpgradePrompt({ moduleKey, title, description, note, compact }: Props) {
  const navigate = useNavigate()
  const { getModule } = useModules()
  const mod = moduleKey ? getModule(moduleKey) : undefined

  const heading = title ?? (mod ? mod.name : 'Función no incluida en tu plan')
  const body =
    description ??
    (mod?.description
      ? mod.description
      : 'Esta función no está incluida en tu plan actual. Mejora tu plan para activarla.')

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[rgb(var(--p200))] bg-[rgb(var(--p50))] px-4 py-3">
        <Lock size={16} className="text-[rgb(var(--p600))] shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800">{heading}</p>
          <p className="text-xs text-gray-600">{body}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/subscription')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--p600))] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[rgb(var(--p700))]"
        >
          <Sparkles size={14} /> Mejorar plan
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center max-w-md mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-[rgb(var(--p50))] flex items-center justify-center mb-4">
        <Lock size={30} className="text-[rgb(var(--p600))]" />
      </div>
      <h3 className="text-lg font-bold text-gray-800 mb-2">{heading}</h3>
      <p className="text-gray-600 text-sm">{body}</p>
      {note ? <p className="text-gray-500 text-xs mt-3">{note}</p> : null}
      <button
        type="button"
        onClick={() => navigate('/subscription')}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--p600))] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[rgb(var(--p700))]"
      >
        <Sparkles size={16} /> Mejorar mi plan
      </button>
      <p className="text-gray-400 text-xs mt-3">
        Podrás adquirir esta función suscribiéndote a un plan que la incluya.
      </p>
    </div>
  )
}
