import { Link } from 'react-router-dom'
import { type ElementType } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  ShoppingCart,
  Receipt,
  FileText,
  Tag,
  Wallet,
  LayoutDashboard,
  Grid3x3,
  ArrowRight,
} from 'lucide-react'
import { getQuickLinkTheme } from './homeTheme'
import { HomeTutorialsPromoSection } from '@/components/home/HomeTutorialsPromoSection'
import { HomeKpiCards } from '@/components/home/HomeKpiCards'
import { isCapacitorAndroid } from '@/lib/platform/detect'
import { useDesktopViewport } from '@/hooks/useMediaQuery'

type QuickLink = {
  to: string
  icon: ElementType
  label: string
  description: string
}


export default function HomePage() {
  const { modules } = useAuth()

  // El hook va primero y sin condiciones: dentro de un `||` el short-circuit podría saltárselo.
  const isDesktop = useDesktopViewport()
  // El home compacto (solo promociones + accesos rápidos) aplica en Android y también en
  // web con pantalla angosta: en móvil los totales empujan los accesos rápidos fuera de vista.
  const compactHome = isCapacitorAndroid() || !isDesktop

  const hasModule = (key: string) => modules.includes(key)

  const quickLinks: QuickLink[] = [
    hasModule('sales') && {
      to: '/sales/pos',
      icon: ShoppingCart,
      label: 'Punto de venta',
      description: 'Crear ventas rápidas desde POS',
    },
    hasModule('sales') && {
      to: '/sales',
      icon: Receipt,
      label: 'Notas de venta',
      description: 'Notas de venta internas (SUNAT 00), sin envío obligatorio',
    },
    hasModule('sales') && {
      to: '/quotations/new',
      icon: FileText,
      label: 'Nueva cotización',
      description: 'Cotiza precios antes de emitir el comprobante',
    },
    hasModule('products') && {
      to: '/products',
      icon: Tag,
      label: 'Productos',
      description: 'Gestiona tu catálogo y precios',
    },
    hasModule('cashbank') && {
      to: '/cashbank/cash',
      icon: Wallet,
      label: 'Caja',
      description: 'Abrir o revisar sesiones de caja',
    },
    {
      to: '/modules',
      icon: Grid3x3,
      label: 'Módulos',
      description: 'Explora módulos adicionales como Restaurante',
    },
    {
      to: '/dashboard',
      icon: LayoutDashboard,
      label: 'Dashboard',
      description: 'Ver resumen general del negocio',
    },
  ].filter(Boolean) as QuickLink[]

  return (
    <div className="space-y-6 md:space-y-8 -m-1 md:-m-2">
      {/* Bienvenida + promociones */}
      <section aria-label="Promociones">
        <HomeTutorialsPromoSection withWelcomeCard={!compactHome} />
      </section>

      {!compactHome && (
        <section aria-label="Resumen de ventas y compras">
          <HomeKpiCards />
        </section>
      )}

      {/* Accesos rápidos */}
      {quickLinks.length > 0 && (
        <section className="space-y-3 pb-1">
          <div>
            <h2 className="text-base font-bold text-gray-900">Accesos rápidos</h2>
            <p className="text-xs text-gray-500 mt-0.5">Atajos a las secciones más usadas</p>
          </div>
          {/* Mínimo 2 columnas: en móvil una sola dejaba mucho aire a los lados. */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {quickLinks.map((link) => {
              const Icon = link.icon
              const theme = getQuickLinkTheme(link.to)
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white p-5 md:p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${theme.borderHover} ${theme.shadowHover}`}
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.topBar}`}
                    aria-hidden
                  />
                  <div
                    className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br shadow-sm transition-all duration-300 group-hover:text-white group-hover:shadow-md ${theme.iconBg} ${theme.iconText} ${theme.iconHoverBg}`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <p className={`text-sm md:text-base font-semibold text-gray-900 transition-colors ${theme.linkHover}`}>
                    {link.label}
                  </p>
                  <p className="mt-1.5 flex-1 text-xs md:text-sm text-gray-500 leading-relaxed line-clamp-2">
                    {link.description}
                  </p>
                  <span
                    className={`mt-4 inline-flex items-center gap-1 text-xs font-semibold opacity-0 translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 ${theme.accent}`}
                  >
                    Ir ahora
                    <ArrowRight size={14} />
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
