import type { CreditInstallmentDraft, CreditInstallmentMode, PaymentConditionCode } from '@/utils/saleCreditPayment'
import { paymentConditionLabel, sumInstallmentAmounts } from '@/utils/saleCreditPayment'

type Props = {
  conditionCode: PaymentConditionCode
  onConditionChange: (code: PaymentConditionCode) => void
  creditMode: CreditInstallmentMode
  onCreditModeChange: (mode: CreditInstallmentMode) => void
  installmentCount: number
  onInstallmentCountChange: (n: number) => void
  installments: CreditInstallmentDraft[]
  onInstallmentsChange: (rows: CreditInstallmentDraft[]) => void
  creditAmount: number
  firstDueDate: string
  onFirstDueDateChange: (ymd: string) => void
  moneySym: string
  fmt: (n: number) => string
  disabled?: boolean
}

export function SalePaymentConditionSection({
  conditionCode,
  onConditionChange,
  creditMode,
  onCreditModeChange,
  installmentCount,
  onInstallmentCountChange,
  installments,
  onInstallmentsChange,
  creditAmount,
  firstDueDate,
  onFirstDueDateChange,
  moneySym,
  fmt,
  disabled,
}: Props) {
  const instSum = sumInstallmentAmounts(installments)
  const creditDiff = round2(creditAmount - instSum)

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Condición de pago</p>
      <div className="flex flex-wrap gap-3">
        {(['cash', 'credit'] as PaymentConditionCode[]).map(code => (
          <label
            key={code}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer ${
              conditionCode === code
                ? 'border-[rgb(var(--p500))] bg-[rgb(var(--p50))] text-[rgb(var(--p800))]'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <input
              type="radio"
              name="payment_condition"
              className="sr-only"
              checked={conditionCode === code}
              onChange={() => onConditionChange(code)}
              disabled={disabled}
            />
            {paymentConditionLabel(code)}
          </label>
        ))}
      </div>

      {conditionCode === 'credit' ? (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-gray-500">
            Saldo a crédito: <span className="font-semibold text-gray-800">{fmt(creditAmount)}</span>
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de crédito</label>
              <select
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm min-w-[10rem]"
                value={creditMode}
                onChange={e => onCreditModeChange(e.target.value as CreditInstallmentMode)}
                disabled={disabled}
              >
                <option value="single">Una sola cuota</option>
                <option value="monthly">Varias cuotas mensuales</option>
              </select>
            </div>
            {creditMode === 'monthly' ? (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">N.º cuotas</label>
                <input
                  type="number"
                  min={2}
                  max={36}
                  className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={installmentCount}
                  onChange={e => onInstallmentCountChange(Math.max(2, Math.min(36, Number(e.target.value) || 2)))}
                  disabled={disabled}
                />
              </div>
            ) : null}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {creditMode === 'single' ? 'Vencimiento cuota' : '1.ª cuota vence'}
              </label>
              <input
                type="date"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={firstDueDate}
                onChange={e => onFirstDueDateChange(e.target.value)}
                disabled={disabled}
              />
            </div>
          </div>

          {installments.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">Cuota</th>
                    <th className="text-left px-3 py-2">Vencimiento</th>
                    <th className="text-right px-3 py-2">Monto ({moneySym})</th>
                  </tr>
                </thead>
                <tbody>
                  {installments.map((row, idx) => (
                    <tr key={idx} className="border-t border-gray-50">
                      <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          className="border border-gray-200 rounded-lg px-2 py-1 text-sm"
                          value={row.due_date}
                          onChange={e =>
                            onInstallmentsChange(
                              installments.map((r, i) => (i === idx ? { ...r, due_date: e.target.value } : r)),
                            )
                          }
                          disabled={disabled || creditMode === 'monthly'}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right tabular-nums ml-auto"
                          value={row.amount}
                          onChange={e =>
                            onInstallmentsChange(
                              installments.map((r, i) => (i === idx ? { ...r, amount: e.target.value } : r)),
                            )
                          }
                          disabled={disabled || creditMode === 'monthly'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {Math.abs(creditDiff) > 0.02 ? (
            <p className="text-xs text-amber-700">
              Las cuotas ({fmt(instSum)}) deben igualar el saldo a crédito ({fmt(creditAmount)}).
            </p>
          ) : (
            <p className="text-xs text-green-700">Cuotas cuadran con el saldo a crédito.</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-500">Pago al contado: los métodos de pago deben cubrir el total.</p>
      )}
    </div>
  )
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
