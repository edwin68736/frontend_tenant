import { Link } from 'react-router-dom'
import { type ElementType } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import { getQuickLinkTheme } from '@/pages/home/homeTheme'

export type QuickLink = {
  to: string
  icon: ElementType
  label: string
  description: string
  /** Ruta de creación directa; pinta la pastilla "Nuevo" dentro de la tarjeta. */
  newTo?: string
  newLabel?: string
}

/**
 * Accesos rápidos del home. Cada tarjeta tiene dos destinos: la superficie completa
 * lleva al listado y la pastilla "Nuevo" va directo a crear. Para no anidar <a>
 * dentro de <a>, el enlace principal es una capa absoluta y la pastilla se dibuja
 * por encima.
 */
export function HomeQuickAccessGrid({ links }: { links: QuickLink[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {links.map((link) => {
        const Icon = link.icon
        const theme = getQuickLinkTheme(link.to)
        return (
          <div
            key={link.to}
            className={`group relative flex flex-col overflow-hidden rounded-2xl border p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg md:p-6 ${theme.cardBg} ${theme.borderHover} ${theme.shadowHover}`}
          >
            <div
              className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.topBar}`}
              aria-hidden
            />

            {/* Capa de navegación principal: cubre la tarjeta salvo la pastilla "Nuevo". */}
            <Link to={link.to} className="absolute inset-0" aria-label={link.label}>
              <span className="sr-only">{link.label}</span>
            </Link>

            <div
              className={`pointer-events-none mb-3 flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm transition-all duration-300 group-hover:shadow-md md:mb-4 md:h-12 md:w-12 ${theme.iconBg} ${theme.iconText} ${theme.iconHoverBg}`}
            >
              <Icon className="h-5 w-5 md:h-6 md:w-6" />
            </div>

            {link.newTo ? (
              <Link
                to={link.newTo}
                className={`absolute right-3 top-3 z-10 inline-flex min-h-[32px] items-center gap-1 rounded-full border border-gray-200 bg-white/95 px-2.5 text-[11px] font-bold shadow-sm backdrop-blur-sm transition-colors hover:bg-gray-50 md:right-4 md:top-4 ${theme.accent}`}
              >
                <Plus size={13} strokeWidth={3} />
                {link.newLabel ?? 'Nuevo'}
              </Link>
            ) : null}

            <p
              className={`pointer-events-none text-sm font-semibold text-gray-900 transition-colors md:text-base ${theme.linkHover}`}
            >
              {link.label}
            </p>

            {/* La descripción solo desde tablet: en teléfono alarga la tarjeta y empuja
                el resto de accesos fuera de pantalla. */}
            {/* gray-600, no gray-500: sobre el fondo pastel el 500 se queda por debajo
                del contraste mínimo para texto pequeño. */}
            <p className="pointer-events-none mt-1.5 hidden flex-1 text-sm leading-relaxed text-gray-600 line-clamp-2 md:block">
              {link.description}
            </p>

            <span
              className={`pointer-events-none mt-4 hidden items-center gap-1 text-xs font-semibold opacity-0 transition-all duration-300 md:inline-flex md:translate-y-1 md:group-hover:translate-y-0 md:group-hover:opacity-100 ${theme.accent}`}
            >
              Ir ahora
              <ArrowRight size={14} />
            </span>
          </div>
        )
      })}
    </div>
  )
}
