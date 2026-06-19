import { useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { receivablesService, type ReceivableRow } from '@/services/receivables.service'
import type { PaymentMethodRecord } from '@/services/cashbank.service'
import { formatPaymentMethodLabel, isDetractionPaymentMethod } from '@/utils/paymentMethodLabel'

type Props = {
  row: ReceivableRow
  paymentMethods: PaymentMethodRecord[]
  onClose: () => void
  onSuccess: () => void
}

export function CollectPaymentModal({ row, paymentMethods, onClose, onSuccess }: Props) {
  const directMethods = paymentMethods.filter(
    pm =>
      pm.active &&
      !isDetractionPaymentMethod(pm.code) &&
      pm.code !== 'credito' &&
      pm.code !== 'credit',
  )
  const [method, setMethod] = useState(directMethods[0]?.code ?? 'cash')
  const [amount, setAmount] = useState(row.direct_due)
  const [loading, setLoading] = useState(false)

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
      await receivablesService.collect(row.sale_id, [{ method, amount }])
      toast.success('Cobro registrado')
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
    <Modal open onClose={onClose} contentClassName="max-w-md">
      <h3 className="font-bold text-gray-800 mb-1">Registrar cobro</h3>
      <p className="text-sm text-gray-500 mb-4 font-mono">{row.sale_number}</p>
      <p className="text-sm mb-4">
        Saldo directo: <strong>S/ {row.direct_due.toFixed(2)}</strong>
      </p>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500">Método de pago</label>
          <select
            value={method}
            onChange={e => setMethod(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
          >
            {directMethods.map(pm => (
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
            onChange={e => setAmount(Number(e.target.value))}
            className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 border rounded-lg text-sm"
          >
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
