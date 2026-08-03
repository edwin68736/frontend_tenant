import { useAuth } from '@/contexts/AuthContext'

/** Franja horaria del saludo. */
function greetingForHour(hour: number): string {
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Primer nombre: el nombre completo desborda en teléfono. */
function firstName(fullName?: string | null): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0]
  return first || 'Bienvenido'
}

/**
 * Saludo del home. Se muestra en todos los tamaños: da contexto (quién, cuándo)
 * ocupando poca altura, a diferencia de los KPIs, que en teléfono se ocultan.
 */
export function HomeGreeting() {
  const { user } = useAuth()

  const now = new Date()
  const dateLabel = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)

  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-bold text-gray-900 md:text-2xl">
          {greetingForHour(now.getHours())}, {firstName(user?.name)}
        </h1>
        <p className="mt-0.5 truncate text-xs text-gray-500 md:text-sm">
          Este es el resumen de tu negocio
        </p>
      </div>
      <p className="hidden shrink-0 text-xs font-medium capitalize text-gray-400 sm:block md:text-sm">
        {dateLabel}
      </p>
    </div>
  )
}
