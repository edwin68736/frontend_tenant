import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Wallet, AlertCircle } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { useAuth } from '@/contexts/AuthContext'
import { payablesService, type PayableRow, type PayablesSummary } from '@/services/payables.service'
import { cashbankService, type PaymentMethodRecord } from '@/services/cashbank.service'
import { formatDisplayDatePeru } from '@/utils/datesPeru'
import { PayPayableModal } from '@/components/payables/PayPayableModal'

export default function PayablesPage() {
  return (
    <RequireModule moduleKey="purchases">
      <PayablesContent />
    </RequireModule>
  )
}

function PayablesContent() {
  const { hasPermission } = useAuth()
  const canPay = hasPermission('payables.pay')
  const [rows, setRows] = useState<PayableRow[]>([])
  const [summary, setSummary] = useState<PayablesSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('open')
  const [payRow, setPayRow] = useState<PayableRow | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRecord[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const [listRes, sum] = await Promise.all([
        payablesService.list({ status: statusFilter, page_size: 100 }),
        payablesService.summary(),
      ])
      setRows(listRes.data)
      setSummary(sum)
    } catch {
      toast.error('Error al cargar cuentas por pagar')
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

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Wallet size={22} className="text-emerald-600" />
            Cuentas por pagar
          </h1>
          <p className="text-sm text-gray-500">
            Compras a crédito con proveedor: saldo pendiente y pagos registrados
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="open">Abiertas</option>
          <option value="overdue">Vencidas</option>
          <option value="all">Todas</option>
        </select>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiCard label="Saldo pendiente" value={`S/ ${summary.total_due.toFixed(2)}`} />
          <KpiCard label="Documentos abiertos" value={String(summary.count_open)} />
          <KpiCard label="Vencidos" value={String(summary.count_overdue)} accent="red" />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No hay cuentas por pagar con los filtros actuales</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Comprobante</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Vencimiento</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Pagado</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(row => (
                  <tr key={row.purchase_id} className={row.is_overdue ? 'bg-red-50/40' : ''}>
                    <td className="px-4 py-3 font-mono text-xs">{row.purchase_number}</td>
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
                    <td className="px-4 py-3 text-right">S/ {row.original_amount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">S/ {row.paid_amount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                      {row.due > 0 ? `S/ ${row.due.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {row.due > 0 && canPay && (
                        <button
                          type="button"
                          onClick={() => setPayRow(row)}
                          className="text-xs px-2 py-1 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                        >
                          Pagar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {payRow && (
        <PayPayableModal
          row={payRow}
          paymentMethods={paymentMethods}
          onClose={() => setPayRow(null)}
          onSuccess={() => {
            setPayRow(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: 'red' }) {
  const color = accent === 'red' ? 'text-red-700' : 'text-gray-800'
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}
