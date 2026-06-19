import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Search, Wallet, AlertCircle, Building2, FileText } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import {
  receivablesService,
  type AccountStatement,
  type ReceivableRow,
  type ReceivablesSummary,
} from '@/services/receivables.service'
import { cashbankService, type PaymentMethodRecord } from '@/services/cashbank.service'
import { formatDisplayDatePeru } from '@/utils/datesPeru'
import { CollectPaymentModal } from '@/components/receivables/CollectPaymentModal'

export default function ReceivablesPage() {
  return (
    <RequireModule moduleKey="cashbank">
      <ReceivablesContent />
    </RequireModule>
  )
}

function ReceivablesContent() {
  const [rows, setRows] = useState<ReceivableRow[]>([])
  const [summary, setSummary] = useState<ReceivablesSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('open')
  const [search, setSearch] = useState('')
  const [collectRow, setCollectRow] = useState<ReceivableRow | null>(null)
  const [statement, setStatement] = useState<AccountStatement | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRecord[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const [listRes, sum] = await Promise.all([
        receivablesService.list({ status: statusFilter, search: search || undefined, page_size: 100 }),
        receivablesService.summary(),
      ])
      setRows(listRes.data)
      setSummary(sum)
    } catch {
      toast.error('Error al cargar cuentas por cobrar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [statusFilter])

  useEffect(() => {
    cashbankService.listPaymentMethods().then(setPaymentMethods).catch(() => {})
  }, [])

  const openStatement = async (contactId: number) => {
    try {
      const stmt = await receivablesService.statement(contactId)
      setStatement(stmt)
    } catch {
      toast.error('No se pudo cargar el estado de cuenta')
    }
  }

  const handleBnConfirm = async (row: ReceivableRow, status: 'confirmed' | 'rejected') => {
    const reference =
      status === 'confirmed'
        ? window.prompt('Referencia / N° operación BN (opcional)') ?? ''
        : ''
    try {
      await receivablesService.confirmBn(row.sale_id, status, reference || undefined)
      toast.success(status === 'confirmed' ? 'Detracción BN confirmada' : 'Detracción marcada como rechazada')
      load()
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      toast.error(msg || 'Error al confirmar BN')
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Wallet size={22} className="text-emerald-600" />
            Cuentas por cobrar
          </h1>
          <p className="text-sm text-gray-500">Saldo directo y detracción SPOT pendiente de confirmación BN</p>
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="open">Abiertas</option>
            <option value="overdue">Vencidas</option>
            <option value="bn_pending">BN pendiente</option>
            <option value="all">Todas</option>
          </select>
          <form
            className="flex gap-2"
            onSubmit={e => {
              e.preventDefault()
              load()
            }}
          >
            <input
              type="search"
              placeholder="Buscar cliente o comprobante"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-48"
            />
            <button type="submit" className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">
              <Search size={16} />
            </button>
          </form>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Saldo directo" value={`S/ ${summary.total_direct_due.toFixed(2)}`} />
          <KpiCard label="SPOT pendiente BN" value={`S/ ${summary.total_spot_pending.toFixed(2)}`} />
          <KpiCard label="Documentos abiertos" value={String(summary.count_open)} />
          <KpiCard label="Vencidos" value={String(summary.count_overdue)} accent="red" />
          <KpiCard label="BN por confirmar" value={String(summary.count_bn_pending)} accent="amber" />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No hay cuentas por cobrar con los filtros actuales</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Comprobante</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Vencimiento</th>
                  <th className="px-4 py-3 text-right">Neto / Total</th>
                  <th className="px-4 py-3 text-right">Cobrado</th>
                  <th className="px-4 py-3 text-right">Saldo directo</th>
                  <th className="px-4 py-3 text-right">SPOT BN</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(row => (
                  <tr key={row.sale_id} className={row.is_overdue ? 'bg-red-50/40' : ''}>
                    <td className="px-4 py-3 font-mono text-xs">{row.sale_number}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{row.contact_name || '—'}</div>
                      <div className="text-xs text-gray-400">{row.contact_doc_number}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {row.due_date ? formatDisplayDatePeru(row.due_date) : '—'}
                      {row.is_overdue && (
                        <span className="ml-1 text-red-600 inline-flex items-center gap-0.5">
                          <AlertCircle size={12} /> Vencido
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.has_detraccion ? (
                        <span title="Neto cobrable">S/ {row.direct_target.toFixed(2)}</span>
                      ) : (
                        <span>S/ {row.total.toFixed(2)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">S/ {row.direct_paid.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                      {row.direct_due > 0 ? `S/ ${row.direct_due.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {row.spot_pending > 0 ? (
                        <span className="text-amber-700">
                          S/ {row.spot_pending.toFixed(2)}
                          <br />
                          <span className="text-gray-400">{row.bn_confirmation_status}</span>
                        </span>
                      ) : row.has_detraccion ? (
                        <span className="text-green-600">{row.bn_confirmation_status || '—'}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.direct_due > 0 && (
                          <button
                            type="button"
                            onClick={() => setCollectRow(row)}
                            className="text-xs px-2 py-1 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                          >
                            Cobrar
                          </button>
                        )}
                        {row.spot_pending > 0 && row.bn_confirmation_status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleBnConfirm(row, 'confirmed')}
                              className="text-xs px-2 py-1 bg-blue-600 text-white rounded-md"
                            >
                              Confirmar BN
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBnConfirm(row, 'rejected')}
                              className="text-xs px-2 py-1 bg-gray-200 rounded-md"
                            >
                              Rechazar
                            </button>
                          </>
                        )}
                        {row.contact_id > 0 && (
                          <button
                            type="button"
                            onClick={() => openStatement(row.contact_id)}
                            className="text-xs px-2 py-1 border rounded-md flex items-center gap-1"
                          >
                            <FileText size={12} /> Estado cuenta
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {collectRow && (
        <CollectPaymentModal
          row={collectRow}
          paymentMethods={paymentMethods}
          onClose={() => setCollectRow(null)}
          onSuccess={() => {
            setCollectRow(null)
            load()
          }}
        />
      )}

      <Modal open={!!statement} onClose={() => setStatement(null)} contentClassName="max-w-3xl">
        {statement && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b pb-3">
              <Building2 size={18} className="text-gray-500" />
              <div>
                <h3 className="font-bold">{statement.contact_name}</h3>
                <p className="text-xs text-gray-500">Estado de cuenta — saldo directo S/ {statement.total_due.toFixed(2)}</p>
                {statement.spot_pending > 0 && (
                  <p className="text-xs text-amber-700">SPOT BN pendiente: S/ {statement.spot_pending.toFixed(2)}</p>
                )}
              </div>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="text-left py-2">Fecha</th>
                    <th className="text-left py-2">Descripción</th>
                    <th className="text-right py-2">Cargo</th>
                    <th className="text-right py-2">Abono</th>
                    <th className="text-right py-2">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.lines.map((line, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="py-2 text-xs">{formatDisplayDatePeru(line.date)}</td>
                      <td className="py-2">{line.description}</td>
                      <td className="py-2 text-right">{line.debit > 0 ? line.debit.toFixed(2) : ''}</td>
                      <td className="py-2 text-right">{line.credit > 0 ? line.credit.toFixed(2) : ''}</td>
                      <td className="py-2 text-right font-medium">{line.balance.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: 'red' | 'amber' }) {
  const color =
    accent === 'red' ? 'text-red-700' : accent === 'amber' ? 'text-amber-700' : 'text-gray-800'
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}
