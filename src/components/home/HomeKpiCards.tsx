import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Package, Truck, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { dashboardService } from '@/services/dashboard.service'
import { formatMoney } from '@/utils/format'
import { HOME_KPI_THEMES } from '@/pages/home/homeTheme'

type MonthlySale = { month: number; year: number; amount: number }

type Kpi = {
  key: keyof typeof HOME_KPI_THEMES
  label: string
  icon: typeof TrendingUp
  value: number
  hint: string
  /** Solo la serie mensual de ventas tiene histórico en el endpoint: el resto no lleva gráfico. */
  series?: number[]
  deltaPct?: number | null
}

/**
 * Sparkline de una sola serie: sin ejes ni etiquetas por punto, solo la forma de la
 * tendencia. El número grande de la tarjeta es la lectura exacta; esto es el contexto.
 */
function Sparkline({ values, label }: { values: number[]; label: string }) {
  const width = 96
  const height = 28
  const pad = 2

  const path = useMemo(() => {
    if (values.length < 2) return null
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    const stepX = (width - pad * 2) / (values.length - 1)

    const points = values.map((v, i) => {
      const x = pad + i * stepX
      const y = height - pad - ((v - min) / span) * (height - pad * 2)
      return [x, y] as const
    })

    const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    const area = `${line} L${points[points.length - 1][0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`
    return { line, area, last: points[points.length - 1] }
  }, [values])

  if (!path) return null

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-7 w-24 overflow-visible"
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <path d={path.area} className="fill-white/20" />
      <path
        d={path.line}
        className="stroke-white/90"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={path.last[0]} cy={path.last[1]} r={2.5} className="fill-white" />
    </svg>
  )
}

/** Chip de variación. Lleva icono y signo: nunca depende solo del color. */
function DeltaChip({ pct }: { pct: number }) {
  const rounded = Math.round(pct)
  const Icon = rounded > 0 ? TrendingUp : rounded < 0 ? TrendingDown : Minus
  const sign = rounded > 0 ? '+' : ''
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm">
      <Icon className="h-3 w-3" aria-hidden />
      {sign}
      {rounded}%
    </span>
  )
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
  const [monthlySales, setMonthlySales] = useState<MonthlySale[]>([])

  useEffect(() => {
    let cancelled = false
    dashboardService
      .getStats()
      .then((stats) => {
        if (cancelled) return
        setTotals(stats.home ?? null)
        setMonthlySales(stats.monthly_sales ?? [])
      })
      .catch(() => {
        // El home no debe romperse si el resumen falla: se quedan las tarjetas en cero.
        if (!cancelled) setTotals(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // La tendencia sale de `monthly_sales` (ventas por mes). Es la única serie histórica
  // que devuelve el endpoint, así que solo la tarjeta de ventas del mes la muestra.
  const salesSeries = useMemo(() => monthlySales.slice(-6).map((m) => m.amount ?? 0), [monthlySales])

  const salesDeltaPct = useMemo(() => {
    if (salesSeries.length < 2) return null
    const current = salesSeries[salesSeries.length - 1]
    const previous = salesSeries[salesSeries.length - 2]
    if (!previous) return null
    return ((current - previous) / previous) * 100
  }, [salesSeries])

  const kpis: Kpi[] = [
    {
      key: 'sales_today',
      label: 'Ventas hoy',
      icon: TrendingUp,
      value: totals?.sales_today ?? 0,
      hint: 'Acumulado del día',
    },
    {
      key: 'sales_month',
      label: 'Ventas mes',
      icon: CalendarDays,
      value: totals?.sales_month ?? 0,
      hint: 'vs. mes anterior',
      series: salesSeries,
      deltaPct: salesDeltaPct,
    },
    {
      key: 'purchases_today',
      label: 'Compras hoy',
      icon: Truck,
      value: totals?.purchases_today ?? 0,
      hint: 'Acumulado del día',
    },
    {
      key: 'purchases_month',
      label: 'Compras mes',
      icon: Package,
      value: totals?.purchases_month ?? 0,
      hint: 'Acumulado del mes',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
      {kpis.map((kpi) => {
        const theme = HOME_KPI_THEMES[kpi.key]
        const Icon = kpi.icon
        const hasChart = !!kpi.series && kpi.series.length >= 2
        return (
          <div
            key={kpi.key}
            className={`flex flex-col justify-between gap-3 rounded-2xl border p-4 md:p-5 ${theme.card} ${theme.border} ${theme.shadow}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`truncate text-xs font-semibold md:text-sm ${theme.label}`}>{kpi.label}</p>
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

            {/* Fila de contexto con altura fija: sin ella las tarjetas quedan desparejas. */}
            <div className="flex min-h-[28px] items-end justify-between gap-2">
              {kpi.deltaPct != null ? (
                <DeltaChip pct={kpi.deltaPct} />
              ) : (
                <p className={`truncate text-[11px] ${theme.label}`}>{kpi.hint}</p>
              )}
              {hasChart ? (
                <Sparkline values={kpi.series!} label={`Tendencia de ${kpi.label.toLowerCase()}`} />
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
