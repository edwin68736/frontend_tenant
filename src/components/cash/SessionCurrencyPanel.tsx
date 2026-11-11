import { formatSaleMoney } from '@/utils/formatMoney'
import type { SessionCurrencySummary } from '@/services/cashbank.service'

/**
 * Sesión de caja con documentos en dólares: valor original por moneda y, al final, todo convertido a soles (cada USD al TC de su
 * documento). El saldo, el efectivo esperado y los totales de la sesión están en soles. No se muestra si todo fue en soles.
 */
export function SessionCurrencyPanel({ currency }: { currency?: SessionCurrencySummary | null }) {
  if (!currency?.has_foreign) return null
  const rows = currency.by_currency ?? []
  return (
    <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-3 sm:p-4 space-y-2">
      <p className="text-sm font-semibold text-indigo-900">Esta sesión tiene documentos en dólares</p>
      <p className="text-xs text-indigo-800/80">
        Los saldos, el efectivo esperado y los totales de la sesión están en <strong>soles</strong>: cada documento en dólares entra con su
        equivalente al tipo de cambio con el que se registró.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-indigo-900/70">
              <th className="py-1 pr-3 font-semibold">Moneda</th>
              <th className="py-1 pr-3 font-semibold text-right">Ingresos</th>
              <th className="py-1 pr-3 font-semibold text-right">Egresos</th>
              <th className="py-1 pr-3 font-semibold text-right">Neto (original)</th>
              <th className="py-1 font-semibold text-right">Equivalente S/</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.currency} className="border-t border-indigo-100">
                <td className="py-1 pr-3 font-medium">{r.currency}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{formatSaleMoney(r.sum_income, r.currency)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{formatSaleMoney(r.sum_expense, r.currency)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{formatSaleMoney(r.net_movement, r.currency)}</td>
                <td className="py-1 text-right tabular-nums font-semibold">{formatSaleMoney(r.net_pen, 'PEN')}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-indigo-200 font-bold text-indigo-950">
              <td className="py-1 pr-3" colSpan={4}>TOTAL NETO EN SOLES (todos los métodos)</td>
              <td className="py-1 text-right tabular-nums">{formatSaleMoney(currency.total_income_pen - currency.total_expense_pen, 'PEN')}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-indigo-900">
        Efectivo esperado para el arqueo (en soles): <strong>{formatSaleMoney(currency.physical_balance_pen, 'PEN')}</strong>
      </p>
      {(currency.rate_estimated_count > 0 || currency.rate_missing_count > 0) && (
        <p className="text-[11px] text-amber-800">
          {currency.rate_estimated_count > 0 ? `${currency.rate_estimated_count} movimiento(s) con TC del día de emisión (el documento no guardó TC). ` : ''}
          {currency.rate_missing_count > 0 ? `${currency.rate_missing_count} sin ningún TC: no están incluidos en los totales en soles.` : ''}
        </p>
      )}
    </div>
  )
}
