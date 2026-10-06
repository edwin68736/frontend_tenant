import { useEffect, useState } from 'react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { X } from 'lucide-react'
import { dashboardService, type DashboardProfit } from '@/services/dashboard.service'
import { productsService } from '@/services/products.service'

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(n || 0)

// Colores del gráfico y de la lista: el mismo para que se lea sin leyenda.
const INCOME_COLOR = '#2563eb'
const EXPENSE_COLOR = '#dc2626'

type ProductOption = { id: number; name: string; code?: string }

type Props = {
  dateFrom: string
  dateTo: string
  branchId: number | ''
  userId: number | ''
}

/**
 * "Utilidades / Ganancias" del dashboard: Ingreso (ventas del período, la misma cifra de la tarjeta
 * "Ventas del período"), Egreso (costo de compra de lo vendido, misma base que Reportes → Utilidades)
 * y Utilidad. "Considerar gastos" suma los gastos manuales de caja al egreso; "Filtrar por producto"
 * calcula solo lo vendido de un producto. Respeta sucursal, usuario y rango del dashboard.
 */
export default function ProfitDonutCard({ dateFrom, dateTo, branchId, userId }: Props) {
  const [data, setData] = useState<DashboardProfit | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [considerExpenses, setConsiderExpenses] = useState(false)
  const [filterProduct, setFilterProduct] = useState(false)
  const [product, setProduct] = useState<ProductOption | null>(null)
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<ProductOption[]>([])
  const [open, setOpen] = useState(false)

  // Búsqueda de producto con espera: una consulta por pausa, no por tecla.
  useEffect(() => {
    if (!filterProduct || product || search.trim().length < 2) {
      setOptions([])
      return
    }
    const id = setTimeout(() => {
      productsService
        .list(search.trim(), undefined, undefined, true, 1, 8)
        .then((r) => setOptions((r.data ?? []).map((p) => ({ id: p.id, name: p.name, code: p.code }))))
        .catch(() => setOptions([]))
    }, 300)
    return () => clearTimeout(id)
  }, [search, filterProduct, product])

  const productId = filterProduct && product ? product.id : undefined

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    dashboardService
      .getProfit({
        date_from: dateFrom,
        date_to: dateTo,
        branch_id: branchId ? Number(branchId) : undefined,
        user_id: userId ? Number(userId) : undefined,
        product_id: productId,
        include_expenses: considerExpenses && !productId ? true : undefined,
      })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        if (!cancelled) {
          setData(null)
          setError(true)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [dateFrom, dateTo, branchId, userId, productId, considerExpenses])

  const income = data?.income ?? 0
  const expense = data?.expense ?? 0
  const profit = data?.profit ?? 0
  const hasData = !!data && (income > 0 || expense > 0)
  // Un egreso mayor al ingreso (pérdida) no cabe como "porción": el gráfico muestra ambos tal cual.
  const slices = [
    { name: 'Ingreso', value: Math.max(income, 0), fill: INCOME_COLOR },
    { name: 'Egreso', value: Math.max(expense, 0), fill: EXPENSE_COLOR },
  ].filter((x) => x.value > 0)

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-800">Utilidades / Ganancias</h2>
      <p className="text-xs text-slate-500">Ingreso, egreso y utilidad del período</p>

      <div className="relative mt-3 h-[200px]">
        {loading ? (
          <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">No se pudo calcular</div>
        ) : !hasData ? (
          <div className="flex h-full items-center justify-center text-slate-400">Sin datos</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={84} paddingAngle={slices.length > 1 ? 2 : 0} stroke="#fff" strokeWidth={2}>
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-lg font-bold tabular-nums ${profit < 0 ? 'text-red-600' : 'text-slate-900'}`}>{fmtMoney(profit)}</span>
              <span className="text-[11px] text-slate-400">Utilidad</span>
            </div>
          </>
        )}
      </div>

      <div className="mt-3 space-y-1.5 text-sm">
        <label className="flex items-center gap-2 text-slate-600">
          <input
            type="checkbox"
            checked={considerExpenses && !productId}
            disabled={!!productId}
            onChange={(e) => setConsiderExpenses(e.target.checked)}
          />
          <span title={productId ? 'Los gastos no se asignan a un producto' : 'Suma los gastos de caja (categoría "gasto") al egreso'}>
            Considerar gastos
            {data && data.expenses > 0 && !productId ? <span className="ml-1 text-xs text-slate-400">({fmtMoney(data.expenses)})</span> : null}
          </span>
        </label>
        <label className="flex items-center gap-2 text-slate-600">
          <input
            type="checkbox"
            checked={filterProduct}
            onChange={(e) => {
              setFilterProduct(e.target.checked)
              if (!e.target.checked) {
                setProduct(null)
                setSearch('')
              }
            }}
          />
          Filtrar por producto
        </label>

        {filterProduct && (
          <div className="relative pl-6">
            {product ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                {product.name}
                <button type="button" aria-label="Quitar producto" onClick={() => setProduct(null)} className="text-slate-400 hover:text-slate-700">
                  <X size={12} />
                </button>
              </span>
            ) : (
              <>
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setOpen(true)
                  }}
                  onFocus={() => setOpen(true)}
                  placeholder="Buscar producto por nombre o código"
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                />
                {open && options.length > 0 && (
                  <div className="absolute left-6 right-0 z-20 mt-1 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {options.map((o) => (
                      <button
                        type="button"
                        key={o.id}
                        onClick={() => {
                          setProduct(o)
                          setOpen(false)
                          setSearch('')
                        }}
                        className="block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50"
                      >
                        <span className="font-medium text-slate-800">{o.name}</span>
                        {o.code ? <span className="ml-1 text-slate-400">{o.code}</span> : null}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
        <div className="flex items-center justify-between">
          <dt className="font-medium" style={{ color: INCOME_COLOR }}>
            Ingreso
          </dt>
          <dd className="font-semibold tabular-nums text-slate-800">{fmtMoney(income)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="font-medium" style={{ color: EXPENSE_COLOR }}>
            Egreso
          </dt>
          <dd className="font-semibold tabular-nums text-slate-800">{fmtMoney(expense)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="font-medium text-slate-700">Utilidad</dt>
          <dd className={`font-bold tabular-nums ${profit < 0 ? 'text-red-600' : 'text-slate-900'}`}>{fmtMoney(profit)}</dd>
        </div>
      </dl>
    </div>
  )
}
