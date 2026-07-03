import { addMonths, format, parseISO } from 'date-fns'

export type CreditInstallmentDraft = { due_date: string; amount: string }

export type PaymentConditionCode = 'cash' | 'credit'
export type CreditInstallmentMode = 'single' | 'monthly'

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function splitIntoInstallments(
  total: number,
  count: number,
  firstDueDate: string,
): CreditInstallmentDraft[] {
  const n = Math.max(1, Math.floor(count))
  if (!firstDueDate?.trim()) return []
  const base = roundMoney(total / n)
  const rows: CreditInstallmentDraft[] = []
  let remaining = roundMoney(total)
  let due = parseISO(firstDueDate)
  for (let i = 0; i < n; i++) {
    const amt = i === n - 1 ? remaining : base
    remaining = roundMoney(remaining - amt)
    rows.push({
      due_date: format(due, 'yyyy-MM-dd'),
      amount: amt.toFixed(2),
    })
    due = addMonths(due, 1)
  }
  return rows
}

export function sumInstallmentAmounts(rows: CreditInstallmentDraft[]): number {
  return roundMoney(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0))
}

export function paymentConditionLabel(code: PaymentConditionCode): string {
  return code === 'credit' ? 'Crédito' : 'Contado'
}
