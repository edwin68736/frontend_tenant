import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Undo2, Loader2 } from 'lucide-react'
import { salesService, type PendingRefund } from '@/services/sales.service'

/** Carga las devoluciones que siguen esperando una caja abierta en la sucursal. */
function usePendingRefunds(branchId?: number | null) {
  const [rows, setRows] = useState<PendingRefund[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    salesService
      .pendingRefunds(branchId ?? undefined)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [branchId])

  useEffect(load, [load])

  const total = rows.reduce((acc, r) => acc + Number(r.amount || 0), 0)
  return { rows, loading, total, reload: load }
}

/**
 * Aviso de devoluciones pendientes para cuando la caja todavía está cerrada.
 *
 * El panel completo solo puede existir con una sesión abierta —la salida necesita una caja donde
 * registrarse—, así que sin este aviso el cajero abriría el turno sin saber que hay dinero por
 * devolver. Aquí solo se informa; el registro se hace en el panel, ya con la caja abierta.
 */
export function PendingRefundsNotice({ branchId }: { branchId?: number | null }) {
  const { rows, loading, total } = usePendingRefunds(branchId)

  if (loading || rows.length === 0) return null

  return (
    <div className="w-full max-w-md mx-auto mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left">
      <div className="flex items-center gap-2">
        <Undo2 size={16} className="text-amber-700 shrink-0" />
        <p className="text-sm font-semibold text-amber-900">
          {rows.length} devolución{rows.length === 1 ? '' : 'es'} pendiente{rows.length === 1 ? '' : 's'}
        </p>
        <span className="ml-auto text-sm font-bold text-amber-900">S/ {total.toFixed(2)}</span>
      </div>
      <p className="mt-1.5 text-xs text-amber-800">
        Ventas anuladas cuyo dinero aún no salió de ninguna caja. Al abrir la caja podrás
        registrar la salida.
      </p>
    </div>
  )
}

type Props = {
  /** Caja abierta donde se registrará la salida. */
  sessionId: number
  branchId?: number | null
  /** Se llama tras registrar una devolución, para refrescar movimientos y saldo. */
  onApplied: () => void
}

/**
 * Devoluciones pendientes de la sucursal.
 *
 * Al anular una venta el dinero debe salir de una caja, pero la anulación puede ocurrir sin
 * ninguna abierta —la nota de crédito la acepta SUNAT de madrugada, por ejemplo—. En ese caso
 * la devolución queda esperando y se muestra aquí para registrarla en la caja del turno.
 *
 * Si no hay nada pendiente el panel no se dibuja: no debe ocupar sitio en el día a día.
 */
/** Clave estable por fila: cash_movement_id (source="sale") o note_sale_id (source="credit_note") — nunca ambos a la vez. */
function rowKey(row: PendingRefund): string {
  return `${row.source}-${row.cash_movement_id ?? row.note_sale_id}`
}

export function PendingRefundsPanel({ sessionId, branchId, onApplied }: Props) {
  const { rows, loading, total, reload: load } = usePendingRefunds(branchId)
  const [applyingKey, setApplyingKey] = useState<string | null>(null)

  const apply = async (row: PendingRefund) => {
    setApplyingKey(rowKey(row))
    try {
      if (row.source === 'credit_note') {
        await salesService.applyPendingNoteRefund(
          row.note_sale_id ?? 0,
          sessionId,
          `Devolución por nota de crédito ${row.note_number ?? row.sale_number}`,
        )
      } else {
        await salesService.applyPendingRefund(
          row.cash_movement_id ?? 0,
          sessionId,
          `Devolución por anulación de ${row.sale_number}`,
        )
      }
      toast.success('Devolución registrada en caja')
      load()
      onApplied()
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'No se pudo registrar la devolución')
    } finally {
      setApplyingKey(null)
    }
  }

  if (loading || rows.length === 0) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
      <div className="px-3 sm:px-4 py-3 border-b border-amber-200/70 flex flex-wrap items-center gap-2">
        <Undo2 size={16} className="text-amber-700 shrink-0" />
        <p className="text-sm font-semibold text-amber-900">
          Devoluciones pendientes ({rows.length})
        </p>
        <span className="text-sm font-bold text-amber-900 sm:ml-auto">S/ {total.toFixed(2)}</span>
      </div>
      <p className="px-3 sm:px-4 pt-2.5 text-xs text-amber-800">
        Ventas anuladas cuyo dinero todavía no salió de ninguna caja. Regístralas aquí para que la
        salida quede en esta sesión.
      </p>
      <ul className="p-3 sm:p-4 space-y-2">
        {rows.map(row => (
          <li
            key={rowKey(row)}
            className="flex flex-wrap items-center gap-2 bg-white rounded-xl px-3 py-2.5 border border-amber-100"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-800 truncate">{row.sale_number}</p>
              <p className="text-xs text-gray-500">
                {row.source === 'credit_note'
                  ? `${row.payment_method || 'efectivo'} · nota de crédito parcial`
                  : `${row.payment_method || 'efectivo'} · caja #${row.original_session_id} (cerrada)`}
              </p>
            </div>
            <span className="font-bold text-gray-900 tabular-nums">
              S/ {Number(row.amount).toFixed(2)}
            </span>
            <button
              type="button"
              onClick={() => void apply(row)}
              disabled={applyingKey !== null}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50"
            >
              {applyingKey === rowKey(row) ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Undo2 size={14} />
              )}
              Registrar salida
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
