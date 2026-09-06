import type { MethodBalance } from '@/services/cashbank.service'

/** Saldos por método de pago — Efectivo, Yape, Plin, Transferencia, Tarjeta, otros. Efectivo
 *  se distingue con un badge "arqueo" (es el único que lo requiere), pero es una tarjeta más:
 *  no hay jerarquía visual de "la caja de verdad es efectivo, el resto es secundario".
 *
 *  Cada tarjeta muestra ingreso/egreso además del neto: un neto solo puede ocultar que, por
 *  ejemplo, Yape tuvo S/500 de ingresos y S/200 de egresos (reversiones) — mostrar ambos evita
 *  esa ambigüedad sin cambiar el dato (MethodBalance ya trae income/expense). Compartido entre
 *  CashPage.tsx (ya no la usa desde que /cashbank/cash quedó como solo lista, pero se mantiene
 *  aquí porque CashSessionDetailPage.tsx sí la necesita) para no duplicar el marcado. */
export function MethodBalanceGrid({ byMethod }: { byMethod: MethodBalance[] }) {
  if (byMethod.length === 0) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {byMethod.map(m => (
        <div key={m.method} className={`rounded-2xl shadow-sm p-3 sm:p-4 ${m.is_cash ? 'bg-[rgb(var(--p50))]' : 'bg-white border border-gray-100'}`}>
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            {m.label}
            {m.is_cash && <span className="text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-[rgb(var(--p100))] text-[rgb(var(--p700))]">arqueo</span>}
          </p>
          <p className={`text-lg sm:text-xl font-bold mt-1 truncate ${m.net < 0 ? 'text-red-600' : 'text-gray-800'}`}>S/ {m.net.toFixed(2)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 flex gap-2">
            <span className="text-emerald-600">+S/ {m.income.toFixed(2)}</span>
            <span className="text-red-500">-S/ {m.expense.toFixed(2)}</span>
          </p>
        </div>
      ))}
    </div>
  )
}
