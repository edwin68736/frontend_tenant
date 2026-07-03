import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { receivablesService, type ReceivableRow } from '@/services/receivables.service'
import type { PaymentMethodRecord } from '@/services/cashbank.service'
import { formatPaymentMethodLabel } from '@/utils/paymentMethodLabel'
import { defaultOperationalPaymentCode, filterOperationalPaymentMethods } from '@/utils/operationalPaymentMethods'
import { formatDisplayDatePeru } from '@/utils/datesPeru'

type Props = {
  row: ReceivableRow
  paymentMethods: PaymentMethodRecord[]
  onClose: () => void
  onSuccess: () => void
}

function installmentStatusLabel(status: string): string {
  switch (status) {
    case 'paid':
      return 'Pagada'
    case 'partial':
      return 'Parcial'
    default:
      return 'Pendiente'
  }
}

export function CollectPaymentModal({ row, paymentMethods, onClose, onSuccess }: Props) {
  const directMethods = filterOperationalPaymentMethods(paymentMethods).filter((pm) => pm.active)
  const openInstallments = useMemo(
    () => (row.installments ?? []).filter((i) => i.due_amount > 0.009),
    [row.installments],
  )
  const firstOpenId = openInstallments[0]?.id ?? 0
  const [method, setMethod] = useState(defaultOperationalPaymentCode(directMethods))
  const [preferInstallmentId, setPreferInstallmentId] = useState<number>(firstOpenId)
  const [amount, setAmount] = useState(() => {
    const first = openInstallments[0]
    if (first && first.due_amount > 0) return first.due_amount
    return row.direct_due
  })
  const [loading, setLoading] = useState(false)

  const selectedInstallment = openInstallments.find((i) => i.id === preferInstallmentId)

  const onPreferChange = (id: number) => {
    setPreferInstallmentId(id)
    const inst = openInstallments.find((i) => i.id === id)
    if (inst) setAmount(inst.due_amount)
  }

  const submit = async () => {
    if (amount <= 0) {
      toast.error('Indique un monto válido')
      return
    }
    if (amount > row.direct_due + 0.01) {
      toast.error(`El monto no puede superar el saldo S/ ${row.direct_due.toFixed(2)}`)
      return
    }
    setLoading(true)
    try {
      await receivablesService.collect(row.sale_id, [{ method, amount }], {
        preferInstallmentId: preferInstallmentId || undefined,
      })
      const fullyPaid = amount >= row.direct_due - 0.01
      toast.success(fullyPaid ? 'Cobro registrado. Venta marcada como pagada.' : 'Cobro registrado')
      onSuccess()
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      toast.error(msg || 'Error al registrar cobro')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open onClose={onClose} contentClassName="max-w-lg">
      <h3 className="font-bold text-gray-800 mb-1">Registrar cobro</h3>
      <p className="text-sm text-gray-500 mb-1 font-mono">{row.sale_number}</p>
      <p className="text-xs text-amber-700 mb-3">
        Condición de pago: {row.payment_condition_code === 'credit' || row.status === 'credit' ? 'Crédito' : 'Contado'}
        {row.status === 'credit' ? ' · Estado: a crédito' : ''}
      </p>
      <p className="text-sm mb-3">
        Saldo pendiente: <strong>S/ {row.direct_due.toFixed(2)}</strong>
        <span className="text-gray-400 text-xs ml-2">(cobrado S/ {row.direct_paid.toFixed(2)})</span>
      </p>

      {openInstallments.length > 0 ? (
        <div className="mb-4 rounded-xl border border-gray-100 overflow-hidden">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide px-3 py-2 bg-gray-50">
            Cuotas
          </p>
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="text-left px-3 py-1.5">#</th>
                <th className="text-left px-3 py-1.5">Vence</th>
                <th className="text-right px-3 py-1.5">Saldo</th>
                <th className="text-left px-3 py-1.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(row.installments ?? []).map((inst) => (
                <tr
                  key={inst.id}
                  className={`border-t border-gray-50 ${inst.due_amount > 0.009 && preferInstallmentId === inst.id ? 'bg-emerald-50' : ''}`}
                >
                  <td className="px-3 py-1.5">{inst.installment_no}</td>
                  <td className="px-3 py-1.5 text-xs">
                    {formatDisplayDatePeru(inst.due_date)}
                    {inst.is_overdue ? <span className="text-red-600 ml-1">Vencida</span> : null}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">S/ {inst.due_amount.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-xs">{installmentStatusLabel(inst.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="space-y-3">
        {openInstallments.length > 1 ? (
          <div>
            <label className="text-xs text-gray-500">Aplicar preferentemente a cuota</label>
            <select
              value={preferInstallmentId || ''}
              onChange={(e) => onPreferChange(Number(e.target.value))}
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
            >
              {openInstallments.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  Cuota {inst.installment_no} — S/ {inst.due_amount.toFixed(2)} (vence{' '}
                  {formatDisplayDatePeru(inst.due_date)})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              El excedente se aplica a las siguientes cuotas en orden. Al liquidar el saldo, la venta pasa a pagada.
            </p>
          </div>
        ) : selectedInstallment ? (
          <p className="text-xs text-gray-500">
            Se aplicará a la cuota {selectedInstallment.installment_no} (S/{' '}
            {selectedInstallment.due_amount.toFixed(2)}).
          </p>
        ) : null}
        <div>
          <label className="text-xs text-gray-500">Método de pago</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
          >
            {directMethods.map((pm) => (
              <option key={pm.id} value={pm.code}>
                {formatPaymentMethodLabel(pm.code)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Monto</label>
          <input
            type="number"
            step="0.01"
            min={0}
            max={row.direct_due}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
          />
          {selectedInstallment && amount >= selectedInstallment.due_amount - 0.01 && amount < row.direct_due - 0.01 ? (
            <button
              type="button"
              className="text-xs text-emerald-700 mt-1 hover:underline"
              onClick={() => setAmount(row.direct_due)}
            >
              Cobrar saldo total (S/ {row.direct_due.toFixed(2)})
            </button>
          ) : null}
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 border rounded-lg text-sm">
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={submit}
            className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-50"
          >
            {loading ? 'Guardando…' : 'Registrar cobro'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
