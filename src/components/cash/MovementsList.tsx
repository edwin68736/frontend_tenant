import { TrendingUp, TrendingDown, RotateCcw } from 'lucide-react'
import type { CashMovement } from '@/services/cashbank.service'
import { categoryLabel } from '@/utils/cashMovementCategories'

/** Lista de movimientos de una sesión — usada en CashSessionDetailPage.tsx. `onReverse` solo se
 *  pasa cuando la sesión está abierta (una cerrada no admite revertir movimientos manuales, el
 *  backend lo rechaza igual, pero no tiene sentido ni mostrar el botón). */
export function MovementsList({
  movements,
  methodLabelFor,
  onReverse,
  reversingId,
}: {
  movements: CashMovement[]
  methodLabelFor: (method?: string) => string
  onReverse?: (m: CashMovement) => void
  reversingId?: string | null
}) {
  // Clave compuesta "kind-id": tenant_cash_movements y tenant_bank_movements (manual no
  // efectivo) tienen cada una su propia secuencia de IDs — un mismo número puede existir en las
  // dos, así que comparar solo por id confundiría el estado "revertido"/"revirtiendo" de una fila
  // con el de otra.
  const rowKey = (m: CashMovement) => `${m.kind}-${m.id}`
  const reversedKeys = new Set(
    movements.filter(m => m.reversal_of_id != null).map(m => `${m.kind}-${m.reversal_of_id}`),
  )
  return (
    <div className="max-h-80 overflow-y-auto">
      {movements.map(m => {
        const isReversal = m.reversal_of_id != null
        const isReversed = reversedKeys.has(rowKey(m))
        const canReverse = !!onReverse && !isReversal && !isReversed && !m.sale_id && !m.purchase_id
        return (
          <div key={rowKey(m)} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-3 sm:px-4 py-3 border-b border-gray-50 hover:bg-gray-50">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {m.type === 'income' ? <TrendingUp size={14} className="text-green-500 flex-shrink-0" /> : <TrendingDown size={14} className="text-red-400 flex-shrink-0" />}
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate flex items-center gap-1.5">
                  {categoryLabel(m.category) || m.type}
                  {isReversal && <span className="text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Reversión</span>}
                  {isReversed && <span className="text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Revertido</span>}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {methodLabelFor(m.payment_method)} · {m.sale_id || m.purchase_id ? 'Doc.' : 'Ref.'} {m.reference || 'sin referencia'} · {new Date(m.created_at).toLocaleTimeString()}
                  {m.user_id ? ` · Usuario #${m.user_id}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 self-end sm:self-auto">
              <p className={`font-bold text-sm ${m.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                {m.type === 'income' ? '+' : '-'} S/ {Number(m.amount).toFixed(2)}
              </p>
              {canReverse && (
                <button
                  type="button"
                  title="Revertir movimiento"
                  onClick={() => onReverse?.(m)}
                  disabled={reversingId === rowKey(m)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
          </div>
        )
      })}
      {movements.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">Sin movimientos en esta sesión</div>}
    </div>
  )
}
