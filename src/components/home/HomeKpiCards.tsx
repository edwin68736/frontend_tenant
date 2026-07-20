import { useEffect, useState } from 'react'
import { CalendarDays, Package, Truck, TrendingUp } from 'lucide-react'
import { dashboardService } from '@/services/dashboard.service'
import { formatMoney } from '@/utils/format'
import { HOME_KPI_THEMES } from '@/pages/home/homeTheme'

type Kpi = {
  key: keyof typeof HOME_KPI_THEMES
  label: string
  icon: typeof TrendingUp
  value: number
}

/**
 * Totales de ventas y compras del home. Solo en escritorio y web: en Android ocupaban
 * demasiada pantalla por encima de los accesos rápidos.
 */
export function HomeKpiCards() {
  const [totals, setTotals] = useState<{
    sales_today: number
    sales_month: number
    purchases_today: number
    purchases_month: number
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    dashboardService
      .getStats()
      .then((stats) => {
        if (!cancelled) setTotals(stats.home ?? null)
      })
      .catch(() => {
        // El home no debe romperse si el resumen falla: se quedan las tarjetas en cero.
        if (!cancelled) setTotals(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const kpis: Kpi[] = [
    { key: 'sales_today', label: 'Ventas hoy', icon: TrendingUp, value: totals?.sales_today ?? 0 },
    { key: 'sales_month', label: 'Ventas mes', icon: CalendarDays, value: totals?.sales_month ?? 0 },
    { key: 'purchases_today', label: 'Compras hoy', icon: Truck, value: totals?.purchases_today ?? 0 },
    { key: 'purchases_month', label: 'Compras mes', icon: Package, value: totals?.purchases_month ?? 0 },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 md:gap-4">
      {kpis.map((kpi) => {
        const theme = HOME_KPI_THEMES[kpi.key]
        const Icon = kpi.icon
        return (
          <div
            key={kpi.key}
            className={`flex items-center justify-between gap-3 rounded-2xl border p-4 md:p-5 ${theme.card} ${theme.border} ${theme.shadow}`}
          >
            <div className="min-w-0">
              <p className={`text-xs font-semibold md:text-sm ${theme.label}`}>{kpi.label}</p>
              <p className={`mt-1 truncate text-xl font-bold tabular-nums md:text-2xl ${theme.value}`}>
                {formatMoney(kpi.value)}
              </p>
            </div>
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${theme.iconWrap}`}
              aria-hidden
            >
              <Icon className="h-5 w-5" />
            </span>
          </div>
        )
      })}
    </div>
  )
}
