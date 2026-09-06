import { useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { payablesService, type PayableRow } from '@/services/payables.service'
import type { PaymentMethodRecord } from '@/services/cashbank.service'
import { formatPaymentMethodLabel } from '@/utils/paymentMethodLabel'
import { defaultOperationalPaymentCode, filterOperationalPaymentMethods } from '@/utils/operationalPaymentMethods'

type Props = {
  row: PayableRow
  paymentMethods: PaymentMethodRecord[]
  onClose: () => void
  onSuccess: () => void
}

// PayPayableModal — registra un pago a proveedor contra el saldo de una compra a crédito (CxP).
// Mismo patrón que CollectPaymentModal.tsx (CxC), sin cuotas: una compra solo tiene un saldo
// corriente (original/pagado/saldo) — ver PayableService.Pay en el backend.
export function PayPayableModal({ row, paymentMethods, onClose, onSuccess }: Props) {
  const directMethods = filterOperationalPaymentMethods(paymentMethods).filter((pm) => pm.active)
  const [method, setMethod] = useState(defaultOperationalPaymentCode(directMethods))
  const [amount, setAmount] = useState(row.due)
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (amount <= 0) {
      toast.error('Indique un monto válido')
      return
    }
    if (amount > row.due + 0.01) {
      toast.error(`El monto no puede superar el saldo S/ ${row.due.toFixed(2)}`)
      return
    }
    setLoading(true)
    try {
      await payablesService.pay(row.purchase_id, {
        amount,
        method,
        reference: reference || undefined,
      })
      const fullyPaid = amount >= row.due - 0.01
      toast.success(fullyPaid ? 'Pago registrado. Compra marcada como pagada.' : 'Pago registrado')
      onSuccess()
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      toast.error(msg || 'Error al registrar el pago')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open onClose={onClose} contentClassName="max-w-lg">
      <h3 className="font-bold text-gray-800 mb-1">Registrar pago a proveedor</h3>
      <p className="text-sm text-gray-500 mb-1 font-mono">{row.purchase_number}</p>
      <p className="text-xs text-gray-500 mb-3">{row.contact_name}</p>
      <p className="text-sm mb-4">
        Saldo pendiente: <strong>S/ {row.due.toFixed(2)}</strong>
        <span className="text-gray-400 text-xs ml-2">(pagado S/ {row.paid_amount.toFixed(2)})</span>
      </p>

      <div className="space-y-3">
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
            max={row.due}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
          />
          {amount < row.due - 0.01 ? (
            <button
              type="button"
              className="text-xs text-emerald-700 mt-1 hover:underline"
              onClick={() => setAmount(row.due)}
            >
              Pagar saldo total (S/ {row.due.toFixed(2)})
            </button>
          ) : null}
        </div>
        <div>
          <label className="text-xs text-gray-500">Referencia (opcional)</label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
            placeholder="N° de operación, voucher, etc."
          />
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
            {loading ? 'Guardando…' : 'Registrar pago'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
