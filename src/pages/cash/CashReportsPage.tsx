import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Filter } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import {
  cashbankService,
  type CashSession,
  type CashSessionReport,
  type MovementReportRow,
  type MovementsReportParams,
} from '@/services/cashbank.service'
import { companyService } from '@/services/company.service'
import { usersService } from '@/services/users.service'
import type { TenantUser } from '@/services/users.service'

type Branch = { id: number; name: string }

export default function CashReportsPage() {
  return (
    <RequireModule moduleKey="cashbank">
      <CashReportsContent />
    </RequireModule>
  )
}

function CashReportsContent() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [users, setUsers] = useState<TenantUser[]>([])
  const [sessions, setSessions] = useState<CashSession[]>([])
  const [report, setReport] = useState<CashSessionReport | null>(null)
  const [movements, setMovements] = useState<MovementReportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'resumen' | 'movimientos'>('resumen')

  const [filters, setFilters] = useState<MovementsReportParams & { sessionId: number | null }>({
    branch_id: undefined,
    user_id: undefined,
    date_from: undefined,
    date_to: undefined,
    session_id: undefined,
    type: '',
    sessionId: null,
  })

  useEffect(() => {
    Promise.all([
      companyService.listBranches().then((b: Branch[]) => b ?? []),
      usersService.listUsers('').then((u: TenantUser[]) => u ?? []),
    ]).then(([b, u]) => {
      setBranches(b)
      setUsers(u)
    })
  }, [])

  useEffect(() => {
    const branchId = filters.branch_id ?? 0
    cashbankService.listSessions(branchId || undefined).then(s => setSessions(s ?? []))
  }, [filters.branch_id])

  const loadReport = async () => {
    if (!filters.sessionId) {
      toast.error('Selecciona una sesión de caja')
      return
    }
    setLoading(true)
    try {
      const r = await cashbankService.getSessionReport(filters.sessionId)
      setReport(r)
    } catch {
      toast.error('Error al cargar el reporte')
    } finally {
      setLoading(false)
    }
  }

  const loadMovements = async () => {
    setLoading(true)
    try {
      const params: MovementsReportParams = {}
      if (filters.branch_id) params.branch_id = filters.branch_id
      if (filters.user_id) params.user_id = filters.user_id
      if (filters.date_from) params.date_from = filters.date_from
      if (filters.date_to) params.date_to = filters.date_to
      if (filters.session_id) params.session_id = filters.session_id
      if (filters.type) params.type = filters.type
      params.per_page = 0
      const { data: rows } = await cashbankService.listMovementsReport(params)
      setMovements(rows ?? [])
    } catch {
      toast.error('Error al cargar movimientos')
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    if (tab === 'resumen') loadReport()
    else loadMovements()
  }

  const formatMoney = (n: number) => `S/ ${Number(n).toFixed(2)}`
  const methodLabel = (m: string) =>
    ({ efectivo: 'Efectivo', yape: 'Yape', plin: 'Plin', tarjeta: 'Tarjeta', transferencia: 'Transferencia' }[m?.toLowerCase() ?? ''] ?? m ?? '')
  const isEfectivo = (m: string) => (m?.toLowerCase() ?? '') === 'efectivo'
  const movTotals = (() => {
    let ingEfe = 0, egreEfe = 0, ingBan = 0, egreBan = 0
    movements.forEach(row => {
      const ef = isEfectivo(row.payment_method)
      if (row.amount >= 0) {
        if (ef) ingEfe += row.amount
        else ingBan += row.amount
      } else {
        if (ef) egreEfe += Math.abs(row.amount)
        else egreBan += Math.abs(row.amount)
      }
    })
    return { efectivo: { ingresos: ingEfe, egresos: egreEfe, saldo: ingEfe - egreEfe }, bancos: { ingresos: ingBan, egresos: egreBan, saldo: ingBan - egreBan } }
  })()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Reportes de caja</h2>
          <p className="text-sm text-gray-500">Resumen de caja y movimientos por método de pago</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
          <Filter size={16} />
          Filtros
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Sucursal</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.branch_id ?? ''}
              onChange={e => setFilters(f => ({ ...f, branch_id: e.target.value ? Number(e.target.value) : undefined }))}
            >
              <option value="">Todas</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Usuario</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.user_id ?? ''}
              onChange={e => setFilters(f => ({ ...f, user_id: e.target.value ? Number(e.target.value) : undefined }))}
            >
              <option value="">Todos</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.date_from ?? ''}
              onChange={e => setFilters(f => ({ ...f, date_from: e.target.value || undefined }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.date_to ?? ''}
              onChange={e => setFilters(f => ({ ...f, date_to: e.target.value || undefined }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Sesión de caja</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.sessionId ?? filters.session_id ?? ''}
              onChange={e => {
                const v = e.target.value ? Number(e.target.value) : null
                setFilters(f => ({ ...f, sessionId: v, session_id: v ?? undefined }))
              }}
            >
              <option value="">Todas</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  #{s.id} {new Date(s.opened_at).toLocaleString()} {s.status === 'open' ? '(abierta)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo movimiento</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.type ?? ''}
              onChange={e => setFilters(f => ({ ...f, type: e.target.value || undefined }))}
            >
              <option value="">Todos</option>
              <option value="income">Ingreso</option>
              <option value="expense">Egreso</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <div className="flex rounded-xl overflow-hidden border border-gray-200">
            <button
              onClick={() => setTab('resumen')}
              className={`px-4 py-2 text-sm font-medium ${tab === 'resumen' ? 'bg-[rgb(var(--p600))] text-white' : 'bg-white text-gray-600'}`}
            >
              Resumen de caja
            </button>
            <button
              onClick={() => setTab('movimientos')}
              className={`px-4 py-2 text-sm font-medium ${tab === 'movimientos' ? 'bg-[rgb(var(--p600))] text-white' : 'bg-white text-gray-600'}`}
            >
              Movimientos
            </button>
          </div>
          <button
            onClick={applyFilters}
            disabled={loading}
            className="px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? '...' : 'Aplicar'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
        </div>
      )}

      {!loading && tab === 'resumen' && report && (
        <div className="space-y-4">
          {/* Encabezado sesión */}
          <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Sesión de caja</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><span className="text-gray-500">Sucursal</span><p className="font-medium">{report.session.branch_name}</p></div>
              <div><span className="text-gray-500">Abierta por</span><p className="font-medium">{report.session.opened_by_user_name}</p></div>
              <div><span className="text-gray-500">Apertura</span><p className="font-medium">{new Date(report.session.opened_at).toLocaleString()}</p></div>
              <div><span className="text-gray-500">Cierre</span><p className="font-medium">{report.session.closed_at ? new Date(report.session.closed_at).toLocaleString() : '-'}</p></div>
              <div><span className="text-gray-500">Monto inicial</span><p className="font-medium">{formatMoney(report.session.opening_balance)}</p></div>
            </div>
          </div>

          {/* Totales generales */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Total ingresos', val: report.totals.total_income, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Total egresos', val: report.totals.total_expense, color: 'text-red-600', bg: 'bg-red-50' },
              { label: 'Total ventas', val: report.totals.total_sales, color: 'text-gray-800', bg: 'bg-gray-50' },
              { label: 'Total compras', val: report.totals.total_purchases, color: 'text-gray-800', bg: 'bg-gray-50' },
              { label: 'Saldo final', val: report.totals.final_balance, color: 'text-[rgb(var(--p700))]', bg: 'bg-[rgb(var(--p50))]' },
            ].map(c => (
              <div key={c.label} className={`${c.bg} rounded-2xl shadow-sm p-4`}>
                <p className="text-xs text-gray-500">{c.label}</p>
                <p className={`text-lg font-bold mt-1 ${c.color}`}>{formatMoney(c.val)}</p>
              </div>
            ))}
          </div>

          {/* Efectivo (para arqueo de caja) */}
          {(() => {
            let ingEfe = 0, egreEfe = 0
            report.income_detail?.forEach(row => { if (isEfectivo(row.payment_method)) ingEfe += row.amount })
            report.expense_detail?.forEach(row => { if (isEfectivo(row.payment_method)) egreEfe += row.amount })
            const saldoEfe = ingEfe - egreEfe
            return (
              <div className="bg-amber-50 rounded-2xl shadow-sm p-4 border border-amber-100">
                <h3 className="text-sm font-semibold text-amber-800 mb-2">Efectivo en caja (para arqueo)</h3>
                <p className="text-xs text-amber-700 mb-3">Solo movimientos en efectivo; Yape, Plin y bancos no se arquean.</p>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><span className="text-gray-600">Ingresos efectivo</span><p className="font-semibold text-green-600">{formatMoney(ingEfe)}</p></div>
                  <div><span className="text-gray-600">Egresos efectivo</span><p className="font-semibold text-red-600">{formatMoney(egreEfe)}</p></div>
                  <div><span className="text-gray-600">Saldo efectivo</span><p className="font-bold text-gray-900">{formatMoney(saldoEfe)}</p></div>
                </div>
              </div>
            )
          })()}

          {/* Totales por método de pago */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <h3 className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">Totales por método de pago</h3>
            <div className="grid md:grid-cols-3 gap-4 p-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">Ventas</p>
                <table className="w-full text-sm">
                  <tbody>
                    {report.totals_by_method.sales?.length ? report.totals_by_method.sales.map((x, idx) => (
                      <tr key={`${x.method}-${idx}`} className="flex justify-between gap-2"><td>{methodLabel(x.method)}</td><td className="font-medium">{formatMoney(x.total)}</td></tr>
                    )) : <tr><td className="text-gray-400">Sin datos</td></tr>}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">Compras</p>
                <table className="w-full text-sm">
                  <tbody>
                    {report.totals_by_method.purchases?.length ? report.totals_by_method.purchases.map((x, idx) => (
                      <tr key={`${x.method}-${idx}`} className="flex justify-between gap-2"><td>{methodLabel(x.method)}</td><td className="font-medium">{formatMoney(x.total)}</td></tr>
                    )) : <tr><td className="text-gray-400">Sin datos</td></tr>}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">Movimientos de caja</p>
                <table className="w-full text-sm">
                  <tbody>
                    {report.totals_by_method.movements?.length ? report.totals_by_method.movements.map((x, idx) => (
                      <tr key={`${x.method}-${idx}`} className="flex justify-between gap-2"><td>{methodLabel(x.method)}</td><td className="font-medium">{formatMoney(x.total)}</td></tr>
                    )) : <tr><td className="text-gray-400">Sin datos</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Detalle ingresos */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <h3 className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">Detalle de ingresos</h3>
            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0"><tr>{['Fecha', 'Tipo', 'Documento', 'Referencia', 'Método', 'Monto'].map(h => <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500">{h}</th>)}</tr></thead>
                <tbody>
                  {report.income_detail?.length ? report.income_detail.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="px-4 py-2 text-xs">{new Date(row.date).toLocaleString()}</td>
                      <td className="px-4 py-2">{row.type === 'venta' ? 'Venta' : row.type === 'ingreso_manual' ? 'Ingreso manual' : 'Otro'}</td>
                      <td className="px-4 py-2">{row.doc_number || '-'}</td>
                      <td className="px-4 py-2">{row.reference || '-'}</td>
                      <td className="px-4 py-2">{methodLabel(row.payment_method)}</td>
                      <td className="px-4 py-2 font-medium text-green-600">{formatMoney(row.amount)}</td>
                    </tr>
                  )) : <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Sin ingresos</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detalle egresos */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <h3 className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">Detalle de egresos</h3>
            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0"><tr>{['Fecha', 'Tipo', 'Documento', 'Referencia', 'Método', 'Monto'].map(h => <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500">{h}</th>)}</tr></thead>
                <tbody>
                  {report.expense_detail?.length ? report.expense_detail.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="px-4 py-2 text-xs">{new Date(row.date).toLocaleString()}</td>
                      <td className="px-4 py-2">{row.type === 'compra' ? 'Compra' : row.type === 'gasto' ? 'Gasto' : 'Egreso manual'}</td>
                      <td className="px-4 py-2">{row.doc_number || '-'}</td>
                      <td className="px-4 py-2">{row.reference || '-'}</td>
                      <td className="px-4 py-2">{methodLabel(row.payment_method)}</td>
                      <td className="px-4 py-2 font-medium text-red-600">{formatMoney(row.amount)}</td>
                    </tr>
                  )) : <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Sin egresos</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!loading && tab === 'movimientos' && (
        <div className="space-y-4">
          {/* Totales por efectivo y bancos */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <h3 className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">Totales según fecha y filtros</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              <div className="bg-amber-50/60 rounded-xl p-4 border border-amber-100">
                <p className="text-xs font-semibold text-amber-800 uppercase mb-3">Efectivo (para arqueo de caja)</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-600">Ingresos</span><span className="font-medium text-green-600">{formatMoney(movTotals.efectivo.ingresos)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Egresos</span><span className="font-medium text-red-600">{formatMoney(movTotals.efectivo.egresos)}</span></div>
                  <div className="flex justify-between border-t border-amber-200 pt-2 mt-2"><span className="font-semibold text-gray-800">Saldo efectivo</span><span className="font-bold text-gray-900">{formatMoney(movTotals.efectivo.saldo)}</span></div>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="text-xs font-semibold text-slate-700 uppercase mb-3">Bancos / Yape / Plin / Otros</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-600">Ingresos</span><span className="font-medium text-green-600">{formatMoney(movTotals.bancos.ingresos)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Egresos</span><span className="font-medium text-red-600">{formatMoney(movTotals.bancos.egresos)}</span></div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 mt-2"><span className="font-semibold text-gray-800">Saldo otros</span><span className="font-bold text-gray-900">{formatMoney(movTotals.bancos.saldo)}</span></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <h3 className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">Reporte de movimientos</h3>
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['Fecha y hora', 'Tipo', 'Nº documento', 'Cliente/Proveedor', 'Usuario', 'Sucursal', 'Método de pago', 'Monto'].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movements.length ? movements.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-4 py-2 text-xs">{new Date(row.date).toLocaleString()}</td>
                    <td className="px-4 py-2 capitalize">{row.type}</td>
                    <td className="px-4 py-2">{row.doc_number || '-'}</td>
                    <td className="px-4 py-2">{row.contact_name || '-'}</td>
                    <td className="px-4 py-2">{row.user_name || '-'}</td>
                    <td className="px-4 py-2">{row.branch_name || '-'}</td>
                    <td className="px-4 py-2">{methodLabel(row.payment_method)}</td>
                    <td className={`px-4 py-2 font-medium ${row.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {row.amount >= 0 ? '+' : ''}{formatMoney(row.amount)}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Usa los filtros y pulsa Aplicar para cargar movimientos</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      )}

      {!loading && tab === 'resumen' && !report && filters.sessionId && (
        <p className="text-center text-gray-500 py-8">Selecciona una sesión y pulsa Aplicar para ver el resumen de caja.</p>
      )}
    </div>
  )
}
