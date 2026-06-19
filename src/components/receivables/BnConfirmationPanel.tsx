import { useState } from 'react'
import { toast } from 'sonner'
import { receivablesService } from '@/services/receivables.service'

type DetraccionBlock = {
  detraction_amount_pen?: number
  net_payable_pen?: number
  bn_confirmation_status?: string
  bn_confirmation_reference?: string
  bn_confirmed_at?: string | null
}

type Props = {
  saleId: number
  detraccion?: DetraccionBlock | null
  onUpdated?: () => void
}

export function BnConfirmationPanel({ saleId, detraccion, onUpdated }: Props) {
  const [loading, setLoading] = useState(false)
  if (!detraccion?.detraction_amount_pen || detraccion.detraction_amount_pen <= 0) {
    return null
  }
  const status = detraccion.bn_confirmation_status || 'pending'
  if (status !== 'pending') {
    return (
      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Confirmación BN (SPOT)</p>
        <p>
          Estado:{' '}
          <span className={status === 'confirmed' ? 'text-green-700 font-medium' : 'text-red-700'}>
            {status === 'confirmed' ? 'Confirmada' : 'Rechazada'}
          </span>
        </p>
        {detraccion.bn_confirmation_reference && (
          <p className="text-xs text-gray-500 mt-1">Ref: {detraccion.bn_confirmation_reference}</p>
        )}
      </div>
    )
  }

  const confirm = async (next: 'confirmed' | 'rejected') => {
    const reference =
      next === 'confirmed'
        ? window.prompt('Referencia / N° operación BN (opcional)') ?? ''
        : ''
    setLoading(true)
    try {
      await receivablesService.confirmBn(saleId, next, reference || undefined)
      toast.success(next === 'confirmed' ? 'Detracción BN confirmada' : 'Detracción marcada como rechazada')
      onUpdated?.()
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      toast.error(msg || 'Error al confirmar BN')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
      <p className="text-xs font-semibold text-amber-800 uppercase mb-1">Detracción SPOT — pendiente BN</p>
      <p className="text-amber-900 mb-2">
        Monto SPOT: S/ {Number(detraccion.detraction_amount_pen).toFixed(2)}. Confirme cuando el banco acredite la detracción.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => confirm('confirmed')}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md disabled:opacity-50"
        >
          Confirmar acreditación BN
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => confirm('rejected')}
          className="text-xs px-3 py-1.5 bg-white border rounded-md disabled:opacity-50"
        >
          Marcar rechazada
        </button>
      </div>
    </div>
  )
}
