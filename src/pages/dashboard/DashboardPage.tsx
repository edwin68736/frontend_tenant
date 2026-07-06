import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  Users,
  Package,
  AlertTriangle,
  CalendarClock,
  Building2,
  UserCircle,
  FileCheck,
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  CalendarRange,
  ArrowRight,
  PiggyBank,
  ShoppingCart,
  Percent,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
} from 'date-fns'
import { dashboardService, type DashboardAnalytics } from '@/services/dashboard.service'
import { companyService } from '@/services/company.service'
import { formatDisplayDatePeru, getTodayPeru } from '@/utils/datesPeru'
import {
  formatExpiryDisplay,
  getProductExpiryStatus,
  PRODUCT_EXPIRY_BADGE_CLASS,
} from '@/utils/productExpiry'

const ZONE = 'America/Lima'

const CHART_COLORS = [
  'rgb(var(--p600, 37 99 235))',
  '#7c3aed',
  '#059669',
  '#d97706',
  '#dc2626',
  '#0891b2',
  '#db2777',
  '#4f46e5',
]

function formatDayPeru(d: Date): string {
  return formatInTimeZone(d, ZONE, 'yyyy-MM-dd')
}

function getRangePreset(key: string): { from: string; to: string } {
  const zNow = toZonedTime(new Date(), ZONE)
  const today = formatDayPeru(zNow)
  switch (key) {
    case 'today':
      return { from: today, to: today }
    case 'week': {
      const ws = startOfWeek(zNow, { weekStartsOn: 1 })
      const we = endOfWeek(zNow, { weekStartsOn: 1 })
      return { from: formatDayPeru(ws), to: formatDayPeru(we) }
    }
    case 'month': {
      const ms = startOfMonth(zNow)
      const me = endOfMonth(zNow)
      return { from: formatDayPeru(ms), to: formatDayPeru(me) }
    }
    case 'last_month': {
      const lm = subMonths(zNow, 1)
      const ms = startOfMonth(lm)
      const me = endOfMonth(lm)
      return { from: formatDayPeru(ms), to: formatDayPeru(me) }
    }
    default:
      return { from: today, to: today }
  }
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(n || 0)

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  card: 'Tarjeta',
  tarjeta: 'Tarjeta',
  transfer: 'Transferencia',
  transferencia: 'Transferencia',
  sin_definir: 'Sin definir',
  credito: 'Crédito',
  credit: 'Crédito',
}

function paymentLabel(k: string) {
  return PAYMENT_LABELS[String(k || '').toLowerCase()] || k || '—'
}

function docTypeLabel(k: string) {
  const m: Record<string, string> = {
    FACTURA: 'Factura',
    BOLETA: 'Boleta',
    'NOTA DE VENTA': 'Nota de venta',
    NOTA_CREDITO: 'Nota de crédito',
    NOTA_DEBITO: 'Nota de débito',
  }
  return m[k] || k
}

function billingLabel(k: string) {
  const m: Record<string, string> = {
    pending: 'Pendiente',
    sent: 'Enviado',
    accepted: 'Aceptado SUNAT',
    rejected: 'Rechazado',
    error: 'Error envío',
  }
  return m[k] || k
}

function saleStatusLabel(k: string) {
  const m: Record<string, string> = {
    paid: 'Pagada',
    draft: 'Borrador',
    credit: 'Crédito',
    cancelled: 'Anulada',
  }
  return m[k] || k
}

type BranchOpt = { id: number; name: string }

type KpiTone = 'brand' | 'blue' | 'emerald' | 'violet' | 'rose' | 'amber' | 'teal' | 'cyan' | 'indigo'

const KPI_TONE_STYLES: Record<
  KpiTone,
  { card: string; icon: string; title: string; value: string; glow: string }
> = {
  brand: {
    card: 'border-[rgb(var(--p600))]/15 bg-gradient-to-br from-[rgb(var(--p600))]/10 via-white to-white',
    icon: 'bg-[rgb(var(--p600))]/15 text-[rgb(var(--p600))] ring-[rgb(var(--p600))]/20',
    title: 'text-[rgb(var(--p700))]/70',
    value: 'text-gray-900',
    glow: 'to-[rgb(var(--p600))]/15',
  },
  blue: {
    card: 'border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white',
    icon: 'bg-blue-100 text-blue-600 ring-blue-200/70',
    title: 'text-blue-700/70',
    value: 'text-blue-950',
    glow: 'to-blue-100/50',
  },
  emerald: {
    card: 'border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white',
    icon: 'bg-emerald-100 text-emerald-600 ring-emerald-200/70',
    title: 'text-emerald-700/70',
    value: 'text-emerald-950',
    glow: 'to-emerald-100/50',
  },
  violet: {
    card: 'border-violet-100 bg-gradient-to-br from-violet-50 via-white to-white',
    icon: 'bg-violet-100 text-violet-600 ring-violet-200/70',
    title: 'text-violet-700/70',
    value: 'text-violet-950',
    glow: 'to-violet-100/50',
  },
  rose: {
    card: 'border-rose-100 bg-gradient-to-br from-rose-50 via-white to-white',
    icon: 'bg-rose-100 text-rose-600 ring-rose-200/70',
    title: 'text-rose-700/70',
    value: 'text-rose-950',
    glow: 'to-rose-100/50',
  },
  amber: {
    card: 'border-amber-100 bg-gradient-to-br from-amber-50 via-white to-white',
    icon: 'bg-amber-100 text-amber-600 ring-amber-200/70',
    title: 'text-amber-700/70',
    value: 'text-amber-950',
    glow: 'to-amber-100/50',
  },
  teal: {
    card: 'border-teal-100 bg-gradient-to-br from-teal-50 via-white to-white',
    icon: 'bg-teal-100 text-teal-600 ring-teal-200/70',
    title: 'text-teal-700/70',
    value: 'text-teal-950',
    glow: 'to-teal-100/50',
  },
  cyan: {
    card: 'border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-white',
    icon: 'bg-cyan-100 text-cyan-600 ring-cyan-200/70',
    title: 'text-cyan-700/70',
    value: 'text-cyan-950',
    glow: 'to-cyan-100/50',
  },
  indigo: {
    card: 'border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white',
    icon: 'bg-indigo-100 text-indigo-600 ring-indigo-200/70',
    title: 'text-indigo-700/70',
    value: 'text-indigo-950',
    glow: 'to-indigo-100/50',
  },
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  tone,
  trend,
  loading,
}: {
  title: string
  value: string
  subtitle?: string
  icon: React.ReactNode
  tone: KpiTone
  trend?: { pct: number; label?: string }
  loading?: boolean
}) {
  const styles = KPI_TONE_STYLES[tone]

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm transition-all duration-300 hover:shadow-md ${styles.card}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${styles.title}`}>{title}</p>
          {loading ? (
            <div className="mt-2 h-8 w-28 animate-pulse rounded-lg bg-white/60" />
          ) : (
            <p className={`mt-1 truncate text-xl font-bold tracking-tight sm:text-2xl ${styles.value}`}>{value}</p>
          )}
          {subtitle && !loading && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          {trend && !loading && (
            <div
              className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                trend.pct >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}
            >
              {trend.pct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {trend.pct >= 0 ? '+' : ''}
              {trend.pct.toFixed(1)}% {trend.label ?? ''}
            </div>
          )}
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ${styles.icon}`}>
          {icon}
        </div>
      </div>
      <div className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-white/0 ${styles.glow} opacity-90`} />
    </div>
  )
}

const PRESETS = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Esta semana' },
  { id: 'month', label: 'Este mes' },
  { id: 'last_month', label: 'Mes anterior' },
] as const

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState<BranchOpt[]>([])
  const [branchId, setBranchId] = useState<number | ''>('')
  const [preset, setPreset] = useState<string>('month')
  const [dateFrom, setDateFrom] = useState(() => getRangePreset('month').from)
  const [dateTo, setDateTo] = useState(() => getRangePreset('month').to)

  useEffect(() => {
    companyService.listBranches().then((b) => setBranches(b ?? []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await dashboardService.getAnalytics({
        date_from: dateFrom,
        date_to: dateTo,
        branch_id: branchId ? Number(branchId) : undefined,
      })
      setAnalytics(data)
    } catch {
      toast.error('No se pudieron cargar las métricas del dashboard')
      setAnalytics(null)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, branchId])

  useEffect(() => {
    void load()
  }, [load])

  const applyPreset = (id: string) => {
    setPreset(id)
    const r = getRangePreset(id)
    setDateFrom(r.from)
    setDateTo(r.to)
  }

  const onCustomDateChange = (part: 'from' | 'to', v: string) => {
    setPreset('custom')
    if (part === 'from') setDateFrom(v)
    else setDateTo(v)
  }

  const ts = useMemo(() => {
    const rows = analytics?.timeseries_daily ?? []
    return rows.map((r) => ({
      ...r,
      label: formatDisplayDatePeru(r.day),
      short: r.day.slice(5),
    }))
  }, [analytics])

  const pieSunat = useMemo(() => {
    const s = analytics?.summary
    if (!s) return []
    return [
      { name: 'Pendiente', value: s.pending_sunat, fill: '#f59e0b' },
      { name: 'Enviado', value: s.sent_sunat, fill: '#3b82f6' },
      { name: 'Aceptado', value: s.accepted_sunat, fill: '#10b981' },
      { name: 'Rechazado', value: s.rejected_sunat, fill: '#ef4444' },
      { name: 'Error', value: s.error_sunat, fill: '#64748b' },
    ].filter((x) => x.value > 0)
  }, [analytics])

  const piePayment = useMemo(() => {
    return (analytics?.by_payment_method ?? []).map((x, i) => ({
      name: paymentLabel(x.key),
      value: x.total,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }))
  }, [analytics])

  const pieDocType = useMemo(() => {
    return (analytics?.by_doc_type ?? []).map((x, i) => ({
      name: docTypeLabel(x.key),
      value: x.total,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }))
  }, [analytics])

  const pieCategory = useMemo(() => {
    return (analytics?.by_product_category ?? []).map((x, i) => ({
      name: x.name || '—',
      value: x.total,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }))
  }, [analytics])

  const pieSaleStatus = useMemo(() => {
    return (analytics?.by_sale_status ?? []).map((x, i) => ({
      name: saleStatusLabel(x.key),
      value: x.count,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }))
  }, [analytics])

  const s = analytics?.summary
  const p = analytics?.period

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Dashboard</h2>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 flex-shrink-0 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((pr) => (
              <button
                key={pr.id}
                type="button"
                onClick={() => applyPreset(pr.id)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  preset === pr.id
                    ? 'bg-[rgb(var(--p600))] text-white shadow-sm'
                    : 'border border-gray-200 bg-white text-gray-600 hover:border-[rgb(var(--p300))] hover:text-gray-900'
                }`}
              >
                {pr.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPreset('custom')}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                preset === 'custom'
                  ? 'bg-[rgb(var(--p600))] text-white shadow-sm'
                  : 'border border-gray-200 bg-white text-gray-600 hover:border-[rgb(var(--p300))] hover:text-gray-900'
              }`}
            >
              Personalizado
            </button>
            </div>

            <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end lg:justify-end xl:justify-between">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-medium text-gray-500 lg:min-w-[9rem]">
                Desde
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => onCustomDateChange('from', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-medium text-gray-500 lg:min-w-[9rem]">
                Hasta
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => onCustomDateChange('to', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-medium text-gray-500 lg:min-w-[10rem]">
                Sucursal
                <select
                  value={branchId === '' ? '' : String(branchId)}
                  onChange={(e) => {
                    setBranchId(e.target.value ? Number(e.target.value) : '')
                    setPreset('custom')
                  }}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
                >
                  <option value="">Todas</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="hidden min-w-0 flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 lg:flex lg:min-w-[12rem] xl:max-w-[16rem]">
                <CalendarRange size={14} className="shrink-0 text-gray-400" />
                <span className="truncate">
                  {p?.date_from && p?.date_to ? (
                    <>
                      {formatDisplayDatePeru(p.date_from)} — {formatDisplayDatePeru(p.date_to)}
                    </>
                  ) : (
                    '—'
                  )}
                </span>
              </div>
            </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-4">
        <KpiCard
          title="Ventas del período"
          value={fmtMoney(s?.sales_total ?? 0)}
          subtitle={`${s?.sales_count ?? 0} operaciones · Ticket ${fmtMoney(s?.avg_ticket ?? 0)}`}
          icon={<ShoppingCart size={20} />}
          tone="brand"
          trend={
            p && Math.abs(p.sales_change_pct) > 0.01
              ? { pct: p.sales_change_pct, label: 'vs período anterior' }
              : undefined
          }
          loading={loading}
        />
        <KpiCard
          title="Ventas hoy"
          value={fmtMoney(s?.sales_today ?? 0)}
          subtitle={`${s?.sales_today_count ?? 0} docs. · Mes calendario ${fmtMoney(s?.sales_month_calendar ?? 0)}`}
          icon={<TrendingUp size={20} />}
          tone="emerald"
          trend={
            s && Math.abs(s.month_over_month_pct) > 0.01
              ? { pct: s.month_over_month_pct, label: 'vs mes anterior' }
              : undefined
          }
          loading={loading}
        />
        <KpiCard
          title="Clientes nuevos"
          value={String(s?.new_contacts ?? 0)}
          subtitle="Registrados en el rango"
          icon={<Users size={20} />}
          tone="violet"
          loading={loading}
        />
        <KpiCard
          title="Anulaciones"
          value={String(s?.cancelled_sales ?? 0)}
          subtitle="Ventas canceladas en el período"
          icon={<XCircle size={20} />}
          tone="rose"
          loading={loading}
        />
      </div>

      {(s?.count_detraccion ?? 0) > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            title="Detracción SPOT (1001)"
            value={fmtMoney(s?.sum_detraccion ?? 0)}
            subtitle={`${s?.count_detraccion ?? 0} factura(s) · Sin impacto en caja`}
            icon={<PiggyBank size={20} />}
            tone="amber"
            loading={loading}
          />
          <KpiCard
            title="Neto cobrable directo"
            value={fmtMoney(s?.sum_net_payable ?? 0)}
            subtitle="Suma net_payable de facturas con detracción"
            icon={<Wallet size={20} />}
            tone="emerald"
            loading={loading}
          />
          <KpiCard
            title="Total facturado (1001)"
            value={fmtMoney((s?.sum_detraccion ?? 0) + (s?.sum_net_payable ?? 0))}
            subtitle="Neto directo + SPOT en el período"
            icon={<ShoppingCart size={20} />}
            tone="brand"
            loading={loading}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Pendientes SUNAT"
          value={String(s?.pending_sunat ?? 0)}
          subtitle="Facturas / boletas por enviar"
          icon={<Send size={20} />}
          tone="amber"
          loading={loading}
        />
        <KpiCard
          title="Aceptados SUNAT"
          value={String(s?.accepted_sunat ?? 0)}
          subtitle={`Enviados: ${s?.sent_sunat ?? 0} · Rechazados: ${s?.rejected_sunat ?? 0}`}
          icon={<CheckCircle2 size={20} />}
          tone="teal"
          loading={loading}
        />
        <KpiCard
          title="Caja (período)"
          value={fmtMoney(s?.cash_net ?? 0)}
          subtitle={`Ingresos ${fmtMoney(s?.cash_income ?? 0)} · Egresos ${fmtMoney(s?.cash_expense ?? 0)}`}
          icon={<Wallet size={20} />}
          tone="cyan"
          loading={loading}
        />
        <KpiCard
          title="Sesiones de caja abiertas"
          value={String(s?.open_cash_sessions ?? 0)}
          subtitle="Estado actual"
          icon={<PiggyBank size={20} />}
          tone="indigo"
          loading={loading}
        />
      </div>

      {/* Main charts */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Evolución diaria</h2>
              <p className="text-xs text-slate-500">Montos facturados y cantidad de documentos por día</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Líneas / barras
            </span>
          </div>
          <div className="h-[300px] w-full">
            {loading ? (
              <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>
            ) : ts.length === 0 ? (
              <div className="flex h-full items-center justify-center text-slate-400">Sin datos en el período</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={ts} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="areaSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(var(--p500,59 130 246))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="rgb(var(--p500,59 130 246))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip
                    formatter={(val: number, name: string) =>
                      name === 'Ventas' ? [fmtMoney(val), name] : [val, 'Documentos']
                    }
                    labelFormatter={(l) => String(l)}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                  />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="sales"
                    name="Ventas"
                    stroke="rgb(var(--p600, 37 99 235))"
                    fill="url(#areaSales)"
                    strokeWidth={2}
                  />
                  <Bar yAxisId="right" dataKey="documents" name="Documentos" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md">
          <h2 className="text-sm font-bold text-slate-800">SUNAT (Factura/Boleta)</h2>
          <p className="text-xs text-slate-500">Distribución por estado de facturación electrónica</p>
          <div className="mt-4 h-[260px]">
            {loading ? (
              <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>
            ) : pieSunat.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-sm text-slate-400">
                Sin comprobantes electrónicos en el rango
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieSunat} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={2}>
                    {pieSunat.map((_, i) => (
                      <Cell key={i} fill={pieSunat[i].fill} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Bar comparisons */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Building2 size={18} className="text-slate-500" />
            <h2 className="text-sm font-bold text-slate-800">Ventas por sucursal</h2>
          </div>
          <div className="h-[260px]">
            {loading ? (
              <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>
            ) : !(analytics?.sales_by_branch ?? []).length ? (
              <div className="flex h-full items-center justify-center text-slate-400">Sin datos</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics!.sales_by_branch} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]} fill="rgb(var(--p600, 37 99 235))" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <UserCircle size={18} className="text-slate-500" />
            <h2 className="text-sm font-bold text-slate-800">Top vendedores</h2>
          </div>
          <div className="h-[260px]">
            {loading ? (
              <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>
            ) : !(analytics?.sales_by_seller ?? []).length ? (
              <div className="flex h-full items-center justify-center text-slate-400">Sin datos</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(analytics?.sales_by_seller ?? []).slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="#7c3aed" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Donuts row */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[
          {
            title: 'Tipo de comprobante',
            subtitle: 'Montos por tipo de documento',
            data: pieDocType,
          },
          {
            title: 'Método de pago',
            subtitle: 'Distribución del monto facturado',
            data: piePayment,
          },
          {
            title: 'Estado de venta',
            subtitle: 'Documentos por estado operativo',
            data: pieSaleStatus,
          },
        ].map((block, idx) => (
          <div key={idx} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800">{block.title}</h2>
            <p className="text-xs text-slate-500">{block.subtitle}</p>
            <div className="mt-3 h-[220px]">
              {loading ? (
                <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>
              ) : block.data.length === 0 ? (
                <div className="flex h-full items-center justify-center text-slate-400">Sin datos</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={block.data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}>
                      {block.data.map((_, i) => (
                        <Cell key={i} fill={block.data[i].fill} stroke="#fff" strokeWidth={1} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => (idx === 2 ? v : fmtMoney(v))} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Categories donut full width */}
      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Ventas por categoría de producto</h2>
            <p className="text-xs text-slate-500">Suma de líneas de venta en el período</p>
          </div>
          <Percent size={16} className="text-slate-400" />
        </div>
        <div className="h-[280px]">
          {loading ? (
            <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>
          ) : pieCategory.length === 0 ? (
            <div className="flex h-full items-center justify-center text-slate-400">Sin líneas con producto categorizado</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={96} paddingAngle={1}>
                  {pieCategory.map((_, i) => (
                    <Cell key={i} fill={pieCategory[i].fill} stroke="#fff" strokeWidth={1} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Tables row */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-slate-500" />
              <h2 className="text-sm font-bold text-slate-800">Top clientes</h2>
            </div>
          </div>
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2">Cliente</th>
                  <th className="px-5 py-2 text-right">Ventas</th>
                  <th className="px-5 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(analytics?.top_clients ?? []).map((r) => (
                  <tr key={r.id} className="transition hover:bg-slate-50/80">
                    <td className="px-5 py-2.5 font-medium text-slate-800">{r.name}</td>
                    <td className="px-5 py-2.5 text-right text-slate-600">{r.sales_count}</td>
                    <td className="px-5 py-2.5 text-right font-semibold text-slate-900">{fmtMoney(r.total)}</td>
                  </tr>
                ))}
                {!loading && !(analytics?.top_clients ?? []).length && (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-slate-400">
                      Sin clientes en el período
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-3">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-slate-500" />
              <h2 className="text-sm font-bold text-slate-800">Productos más vendidos</h2>
            </div>
          </div>
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2">Producto</th>
                  <th className="px-5 py-2 text-right">Cantidad</th>
                  <th className="px-5 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(analytics?.top_products ?? []).map((r) => (
                  <tr key={r.product_id} className="transition hover:bg-slate-50/80">
                    <td className="px-5 py-2.5 font-medium text-slate-800">{r.name}</td>
                    <td className="px-5 py-2.5 text-right text-slate-600">{r.quantity.toFixed(2)}</td>
                    <td className="px-5 py-2.5 text-right font-semibold text-slate-900">{fmtMoney(r.total)}</td>
                  </tr>
                ))}
                {!loading && !(analytics?.top_products ?? []).length && (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-slate-400">
                      Sin ventas con productos en el período
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bottom widgets */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="rounded-3xl border border-amber-100 bg-gradient-to-b from-amber-50/80 to-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="text-amber-600" size={18} />
            <h2 className="text-sm font-bold text-amber-950">Stock bajo</h2>
          </div>
          <ul className="space-y-2 text-sm">
            {(analytics?.low_stock_products ?? []).map((p) => (
              <li key={p.product_id} className="flex justify-between gap-2 rounded-xl bg-white/80 px-3 py-2 ring-1 ring-amber-100">
                <span className="truncate font-medium text-slate-800">{p.product_name}</span>
                <span className="shrink-0 font-semibold text-amber-700">
                  {p.quantity} / min {p.min_stock}
                </span>
              </li>
            ))}
            {!loading && !(analytics?.low_stock_products ?? []).length && (
              <li className="text-center text-slate-500">Todo en orden</li>
            )}
          </ul>
        </div>

        <div className="rounded-3xl border border-orange-100 bg-gradient-to-b from-orange-50/80 to-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock className="text-orange-600" size={18} />
            <h2 className="text-sm font-bold text-orange-950">Próximos a vencer</h2>
          </div>
          <ul className="space-y-2 text-sm">
            {(analytics?.expiring_products ?? []).map((p) => {
              const dateStr = String(p.expiry_date).slice(0, 10)
              const status = getProductExpiryStatus(dateStr)
              return (
                <li
                  key={p.product_id}
                  className="flex justify-between gap-2 rounded-xl bg-white/80 px-3 py-2 ring-1 ring-orange-100"
                >
                  <span className="truncate font-medium text-slate-800">{p.product_name}</span>
                  <span className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold ${PRODUCT_EXPIRY_BADGE_CLASS[status]}`}>
                    {formatExpiryDisplay(dateStr)}
                  </span>
                </li>
              )
            })}
            {!loading && !(analytics?.expiring_products ?? []).length && (
              <li className="text-center text-slate-500">Sin vencimientos próximos</li>
            )}
          </ul>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Receipt size={18} className="text-slate-500" />
              <h2 className="text-sm font-bold text-slate-800">Últimos comprobantes</h2>
            </div>
            <span className="text-[11px] text-slate-400">Ordenados por fecha de emisión</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Documento</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Sucursal</th>
                  <th className="py-2 pr-3">SUNAT</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(analytics?.recent_sales ?? []).map((r) => (
                  <tr key={r.id} className="transition hover:bg-slate-50/80">
                    <td className="py-2 pr-3">
                      <span className="font-medium text-slate-800">{docTypeLabel(r.doc_type)}</span>
                      <span className="ml-1 text-slate-500">{r.number}</span>
                      <div className="text-[11px] text-slate-400">{formatDisplayDatePeru(r.issue_date)}</div>
                    </td>
                    <td className="max-w-[140px] truncate py-2 pr-3 text-slate-600">{r.contact_name}</td>
                    <td className="py-2 pr-3 text-slate-600">{r.branch_name || '—'}</td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        <FileCheck size={12} />
                        {billingLabel(r.billing_status)}
                      </span>
                    </td>
                    <td className="py-2 text-right font-semibold">{fmtMoney(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !(analytics?.recent_sales ?? []).length && (
              <p className="py-6 text-center text-slate-400">Sin comprobantes en el período seleccionado</p>
            )}
          </div>
        </div>
      </div>

      {/* Financial summary strip */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex items-center gap-4 rounded-3xl border border-emerald-100 bg-emerald-50/50 p-5 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <TrendingUp size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">vs período anterior</p>
            <p className="text-2xl font-bold text-emerald-950">
              {p ? `${p.sales_change_pct >= 0 ? '+' : ''}${p.sales_change_pct.toFixed(1)}%` : '—'}
            </p>
            <p className="text-xs text-emerald-800/80">Variación de ventas en el rango seleccionado</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-3xl border border-sky-100 bg-sky-50/50 p-5 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
            <Receipt size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Total período anterior</p>
            <p className="text-2xl font-bold text-sky-950">{fmtMoney(s?.sales_previous_total ?? 0)}</p>
            <p className="text-xs text-sky-800/80">
              {p ? `${formatDisplayDatePeru(p.previous_from)} — ${formatDisplayDatePeru(p.previous_to)}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-3xl border border-violet-100 bg-violet-50/50 p-5 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
            <AlertCircle size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">Errores de envío SUNAT</p>
            <p className="text-2xl font-bold text-violet-950">{s?.error_sunat ?? 0}</p>
            <p className="text-xs text-violet-800/80">Revisa facturación para reintentar</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
          Datos en zona horaria Perú · Actualizado <ArrowRight size={12} /> {getTodayPeru()}
        </span>
      </div>
    </div>
  )
}
