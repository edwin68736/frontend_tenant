import { useEffect, useState } from 'react'
import { FileDown, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import {
  cashbankService,
  type MovementReportRow,
  type MovementReportSummary,
  type MovementsReportParams,
} from '@/services/cashbank.service'
import { companyService } from '@/services/company.service'
import { usersService } from '@/services/users.service'
import type { TenantUser } from '@/services/users.service'
import { exportTableToPdf } from '@/utils/exportPdf'
import { exportTableToExcel } from '@/utils/exportExcel'
import type { ExportColumn } from '@/utils/exportPdf'
import { getTodayPeru } from '@/utils/datesPeru'

type Branch = { id: number; name: string }

const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  card: 'Tarjeta',
  tarjeta: 'Tarjeta',
  transfer: 'Transferencia',
  transferencia: 'Transferencia',
  credito: 'Crédito',
  credit: 'Crédito',
}

function normalizePaymentMethod(code?: string) {
  return String(code || '').trim().toLowerCase()
}

function formatPaymentMethod(code?: string) {
  const normalized = normalizePaymentMethod(code)
  return PAYMENT_LABELS[normalized] || (code ? String(code) : '—')
}

const TYPE_LABELS: Record<string, string> = {
  venta: 'Venta',
  compra: 'Compra',
  ingreso: 'Ingreso',
  egreso: 'Egreso',
}

function formatMovementType(t?: string) {
  const k = String(t || '').trim().toLowerCase()
  return TYPE_LABELS[k] || (t ? String(t) : '—')
}

const getCurrentMonthRange = () => {
  const today = getTodayPeru()
  const [year, month] = today.split('-')
  return { from: `${year}-${month}-01`, to: today }
}

const emptySummary = (): MovementReportSummary => ({
  total_rows: 0,
  sum_income: 0,
  sum_expense: 0,
  net_movement: 0,
})

function buildExportCols(): ExportColumn<MovementReportRow>[] {
  return [
    { key: 'date', label: 'Fecha', format: (v: unknown) => (v ? new Date(String(v)).toLocaleString() : '') },
    { key: 'type', label: 'Tipo', format: (v: unknown) => formatMovementType(String(v || '')) },
    { key: 'category', label: 'Categoría' },
    { key: 'doc_number', label: 'Nº documento / ref.' },
    { key: 'contact_name', label: 'Cliente / proveedor / detalle' },
    { key: 'user_name', label: 'Usuario' },
    { key: 'branch_name', label: 'Sucursal' },
    { key: 'payment_method', label: 'Método de pago', format: (v: unknown) => formatPaymentMethod(String(v || '')) },
    { key: 'amount', label: 'Monto', format: (v: unknown) => `S/ ${Number(v).toFixed(2)}` },
    { key: 'notes_detail', label: 'Notas' },
  ]
}

export default function CashReportPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [users, setUsers] = useState<TenantUser[]>([])
  const [data, setData] = useState<MovementReportRow[]>([])
  const [summary, setSummary] = useState<MovementReportSummary>(emptySummary)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [total, setTotal] = useState(0)
  const currentMonthRange = getCurrentMonthRange()
  const [filters, setFilters] = useState({
    branch_id: '' as number | '',
    user_id: '' as number | '',
    date_from: currentMonthRange.from,
    date_to: currentMonthRange.to,
    type: '',
  })

  const patchFilters = (patch: Partial<typeof filters>) => {
    setFilters(f => ({ ...f, ...patch }))
    setPage(1)
  }

  useEffect(() => {
    companyService.listBranches().then((b: Branch[]) => setBranches(b ?? []))
    usersService.listUsers('').then((u: TenantUser[]) => setUsers(u ?? []))
  }, [])

  const buildParams = (opts?: { page?: number; perPage?: number }): MovementsReportParams => {
    const params: MovementsReportParams = {
      page: opts?.page ?? page,
      per_page: opts?.perPage ?? perPage,
    }
    if (filters.branch_id) params.branch_id = Number(filters.branch_id)
    if (filters.user_id) params.user_id = Number(filters.user_id)
    if (filters.date_from) params.date_from = filters.date_from
    if (filters.date_to) params.date_to = filters.date_to
    if (filters.type) params.type = filters.type
    return params
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await cashbankService.listMovementsReport(buildParams())
      setData(res.data ?? [])
      setTotal(res.total ?? 0)
      setSummary(res.summary ?? emptySummary())
    } catch {
      toast.error('Error al cargar movimientos de caja')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [filters.branch_id, filters.user_id, filters.date_from, filters.date_to, filters.type, page, perPage])

  const exportParamsAllRows = (): MovementsReportParams => {
    const p = buildParams({ page: 1, perPage: 0 })
    return p
  }

  const exportPdf = async () => {
    setLoading(true)
    try {
      const { data: rows } = await cashbankService.listMovementsReport(exportParamsAllRows())
      exportTableToPdf<MovementReportRow>(
        'Reporte de caja',
        buildExportCols(),
        rows,
        `reporte-caja-${filters.date_from || 'todo'}-${filters.date_to || 'todo'}.pdf`,
      )
      toast.success('PDF descargado')
    } catch {
      toast.error('Error al exportar')
    } finally {
      setLoading(false)
    }
  }

  const exportExcel = async () => {
    setLoading(true)
    try {
      const { data: rows } = await cashbankService.listMovementsReport(exportParamsAllRows())
      exportTableToExcel<MovementReportRow>('Caja', buildExportCols(), rows, `reporte-caja-${filters.date_from || 'todo'}-${filters.date_to || 'todo'}.xlsx`)
      toast.success('Excel descargado')
    } catch {
      toast.error('Error al exportar')
    } finally {
      setLoading(false)
    }
  }

  const COLS: ExportColumn<MovementReportRow>[] = [
    { key: 'date', label: 'Fecha', format: (v: unknown) => (v ? new Date(String(v)).toLocaleString() : '') },
    { key: 'type', label: 'Tipo', format: (v: unknown) => formatMovementType(String(v || '')) },
    { key: 'category', label: 'Categoría' },
    { key: 'doc_number', label: 'Documento' },
    { key: 'contact_name', label: 'Cliente / detalle' },
    { key: 'user_name', label: 'Usuario' },
    { key: 'branch_name', label: 'Sucursal' },
    {
      key: 'payment_method',
      label: 'Método de pago',
      format: (v: unknown) => formatPaymentMethod(String(v || '')),
    },
    {
      key: 'amount',
      label: 'Monto',
      format: (v: unknown) => `S/ ${Number(v).toFixed(2)}`,
    },
  ]

  const totalPages = Math.max(1, Math.ceil(total / perPage))

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Sucursal</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.branch_id}
              onChange={e => patchFilters({ branch_id: e.target.value ? Number(e.target.value) : '' })}
            >
              <option value="">Todas</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Usuario</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.user_id}
              onChange={e => patchFilters({ user_id: e.target.value ? Number(e.target.value) : '' })}
            >
              <option value="">Todos</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.date_from}
              onChange={e => patchFilters({ date_from: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              onChange={e => patchFilters({ date_to: e.target.value })}
              value={filters.date_to}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo movimiento</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={filters.type}
              onChange={e => patchFilters({ type: e.target.value })}
            >
              <option value="">Todos</option>
              <option value="income">Ingreso</option>
              <option value="expense">Egreso</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={() => void exportPdf()}
            disabled={total === 0 || loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <FileDown size={14} /> Exportar PDF
          </button>
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={total === 0 || loading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <FileSpreadsheet size={14} /> Exportar Excel
          </button>
        </div>
      </div>

      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Total ingresos</p>
            <p className="text-xl font-bold text-emerald-900">S/ {summary.sum_income.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-red-100 bg-red-50/80 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-800">Total egresos</p>
            <p className="text-xl font-bold text-red-900">S/ {summary.sum_expense.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Neto en caja</p>
            <p className="text-xl font-bold text-sky-900">S/ {summary.net_movement.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Registros (filtro)</p>
            <p className="text-xl font-bold text-gray-900">{summary.total_rows}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
        </div>
      )}

      {!loading && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {COLS.map(c => (
                    <th key={String(c.key)} className="text-left px-4 py-2 text-xs font-semibold text-gray-500">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length ? (
                  data.map((row, i) => (
                    <tr key={`${row.movement_id}-${row.date}-${i}`} className="border-b border-gray-50">
                      {COLS.map(col => {
                        const val = row[col.key as keyof MovementReportRow]
                        if (col.key === 'amount') {
                          const n = Number(val)
                          const cls = n >= 0 ? 'text-emerald-700' : 'text-red-600'
                          return (
                            <td key={String(col.key)} className={`px-4 py-2 align-top font-medium ${cls}`}>
                              S/ {n.toFixed(2)}
                            </td>
                          )
                        }
                        const text = col.format ? col.format(val, row) : String(val ?? '')
                        return (
                          <td key={String(col.key)} className="px-4 py-2 align-top">
                            {text}
                          </td>
                        )
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={COLS.length} className="px-4 py-8 text-center text-gray-400">
                      No hay registros para los filtros seleccionados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 py-2 px-1">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-gray-600">
              Mostrando {(page - 1) * perPage + 1}-{Math.min(page * perPage, total)} de {total}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 whitespace-nowrap">Mostrar</span>
              <select
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={perPage}
                onChange={e => {
                  setPerPage(Number(e.target.value))
                  setPage(1)
                }}
              >
                {PER_PAGE_OPTIONS.map(n => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-sm text-gray-600 whitespace-nowrap">por página</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-600">
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
