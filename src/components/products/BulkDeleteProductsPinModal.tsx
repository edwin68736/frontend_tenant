import { useState } from 'react'
import { CheckCircle2, X, XCircle } from 'lucide-react'
import { PortalModal } from '@/components/ui/PortalModal'
import type { BulkDeleteProductsResult } from '@/services/products.service'

type Props = {
  open: boolean
  selectedCount: number
  onClose: () => void
  onConfirm: (reason: string, pin: string) => Promise<BulkDeleteProductsResult>
  onDone: (result: BulkDeleteProductsResult) => void
}

export function BulkDeleteProductsPinModal({
  open,
  selectedCount,
  onClose,
  onConfirm,
  onDone,
}: Props) {
  const [reason, setReason] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BulkDeleteProductsResult | null>(null)

  if (!open) return null

  const handleClose = () => {
    if (loading) return
    setReason('')
    setPin('')
    setResult(null)
    onClose()
  }

  const handleConfirm = async () => {
    setLoading(true)
    try {
      const res = await onConfirm(reason, pin)
      setResult(res)
      onDone(res)
    } finally {
      setLoading(false)
    }
  }

  const handleFinish = () => {
    setReason('')
    setPin('')
    setResult(null)
    onClose()
  }

  return (
    <PortalModal open={open} onClose={handleClose} className="max-w-md">
      <div className="bg-white rounded-2xl p-5 w-full space-y-3 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-gray-800">
              {result ? 'Resultado de eliminación' : 'Eliminar productos seleccionados'}
            </h3>
            {!result && (
              <p className="text-sm text-[rgb(var(--p700))] font-medium mt-0.5">
                Productos seleccionados: {selectedCount}
              </p>
            )}
            {!result && (
              <p className="text-xs text-gray-500 mt-1">
                Solo se eliminarán productos sin historial (ventas, compras, inventario, etc.).
              </p>
            )}
          </div>
          <button type="button" onClick={handleClose} className="p-1 rounded-lg hover:bg-gray-100 shrink-0">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            {result.deleted.length > 0 && (
              <section>
                <h4 className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5 mb-2">
                  <CheckCircle2 size={16} />
                  Eliminados ({result.deleted.length})
                </h4>
                <ul className="space-y-1 text-sm text-gray-700">
                  {result.deleted.map((p) => (
                    <li key={p.id} className="px-2 py-1 rounded-lg bg-emerald-50">
                      {p.name || `Producto #${p.id}`}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {result.blocked.length > 0 && (
              <section>
                <h4 className="text-sm font-semibold text-red-800 flex items-center gap-1.5 mb-2">
                  <XCircle size={16} />
                  Bloqueados ({result.blocked.length})
                </h4>
                <ul className="space-y-2 text-sm">
                  {result.blocked.map((p) => (
                    <li key={p.id} className="px-2 py-2 rounded-lg bg-red-50 border border-red-100">
                      <p className="font-medium text-gray-800">{p.name || `Producto #${p.id}`}</p>
                      <ul className="mt-1 space-y-0.5 text-xs text-red-900">
                        {p.reasons.map((r) => (
                          <li key={r}>• {r}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <button
              type="button"
              onClick={handleFinish}
              className="w-full py-2.5 bg-gray-800 text-white rounded-xl text-sm font-medium hover:bg-gray-900"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo de eliminación *"
              className="w-full border border-gray-200 rounded-xl p-2 text-sm resize-none"
              rows={2}
            />
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              maxLength={6}
              inputMode="numeric"
              placeholder="PIN de operaciones *"
              className="w-full border border-gray-200 rounded-xl p-2 text-sm"
              autoComplete="off"
            />
            <p className="text-xs text-gray-500">
              Mismo PIN configurado en Ajustes del restaurante (anulación de pedidos y comandas).
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={loading || !reason.trim() || !pin.trim()}
                onClick={() => void handleConfirm()}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Eliminando...' : 'Eliminar seleccionados'}
              </button>
            </div>
          </>
        )}
      </div>
    </PortalModal>
  )
}
