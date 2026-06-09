import { Link } from 'react-router-dom'
import { useEffect, useState, type ElementType } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { dashboardService } from '@/services/dashboard.service'
import {
  ShoppingCart,
  Receipt,
  Tag,
  Wallet,
  LayoutDashboard,
  Grid3x3,
  TrendingUp,
  CalendarDays,
  Truck,
  Package,
  ArrowRight,
} from 'lucide-react'
import { HOME_KPI_THEMES, getQuickLinkTheme } from './homeTheme'
import { HomeTutorialsPromoSection } from '@/components/home/HomeTutorialsPromoSection'

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

type QuickLink = {
  to: string
  icon: ElementType
  label: string
  description: string
}

export default function HomePage() {
  const { modules } = useAuth()
  const [homeStats, setHomeStats] = useState<{
    sales_today: number
    sales_month: number
    purchases_today: number
    purchases_month: number
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    dashboardService.getStats().then((data) => {
      if (!cancelled && data.home) setHomeStats(data.home)
    })
    return () => { cancelled = true }
  }, [])

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

  const kpis = [
    {
      key: 'sales_today',
      label: 'Ventas hoy',
      value: homeStats ? formatMoney(homeStats.sales_today) : '—',
      icon: TrendingUp,
    },
    {
      key: 'sales_month',
      label: 'Ventas mes',
      value: homeStats ? formatMoney(homeStats.sales_month) : '—',
      icon: CalendarDays,
    },
    {
      key: 'purchases_today',
      label: 'Compras hoy',
      value: homeStats ? formatMoney(homeStats.purchases_today) : '—',
      icon: Truck,
    },
    {
      key: 'purchases_month',
      label: 'Compras mes',
      value: homeStats ? formatMoney(homeStats.purchases_month) : '—',
      icon: Package,
    },
  ] as const

  return (
    <div className="space-y-6 md:space-y-8 -m-1 md:-m-2">
      {/* Tutoriales YouTube + promociones */}
      <section aria-label="Tutoriales y promociones">
        <HomeTutorialsPromoSection />
      </section>

      {/* KPIs */}
      <section>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon
            const theme = HOME_KPI_THEMES[kpi.key]
            return (
              <div
                key={kpi.key}
                className={`group relative overflow-hidden rounded-2xl border p-4 md:p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${theme.card} ${theme.border} ${theme.shadow}`}
              >
                <div
                  className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10 blur-xl"
                  aria-hidden
                />
                <div className="relative flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs sm:text-sm font-medium ${theme.label}`}>{kpi.label}</p>
                    <p className={`mt-2 text-lg sm:text-xl md:text-2xl font-bold truncate ${theme.value}`}>
                      {kpi.value}
                    </p>
                  </div>
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${theme.iconWrap}`}
                  >
                    <Icon size={20} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Accesos rápidos */}
      {quickLinks.length > 0 && (
        <section className="space-y-3 pb-1">
          <div>
            <h2 className="text-base font-bold text-gray-900">Accesos rápidos</h2>
            <p className="text-xs text-gray-500 mt-0.5">Atajos a las secciones más usadas</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
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
