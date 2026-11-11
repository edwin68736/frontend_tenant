import { describe, expect, it, vi } from 'vitest'
import type { CashSessionReport } from '@/services/cashbank.service'

const captured: { sheets?: { name: string; rows: unknown[][] }[] } = {}
vi.mock('hucre', () => ({
  writeXlsx: vi.fn(async (input: { sheets: { name: string; rows: unknown[][] }[] }) => {
    captured.sheets = input.sheets
    return new Uint8Array()
  }),
}))
vi.mock('@/utils/downloadXlsx', () => ({ downloadXlsxBytes: vi.fn() }))

import { downloadCashSessionReportExcel } from '@/utils/cashReportExcel'

function baseReport(over: Partial<CashSessionReport> = {}): CashSessionReport {
  return {
    session: { id: 7, opening_balance: 100, status: 'open', closing_balance: null },
    income_detail: [],
    expense_detail: [],
    cancelled_sales_detail: [],
    totals_by_method: { sales: [], purchases: [], movements: [] },
    totals: { total_income: 200, total_expense: 20, total_sales: 200, total_purchases: 20, final_balance: 280 },
    cash_physical: { opening_balance: 100, total_income: 200, total_expense: 20, physical_balance: 280 },
    ...over,
  } as unknown as CashSessionReport
}

const resumen = () => (captured.sheets ?? []).find((s) => s.name === 'Resumen')?.rows ?? []
const flat = () => resumen().map((r) => r.join(' | '))

describe('Excel del reporte de sesión de caja', () => {
  it('sin dólares queda como siempre', async () => {
    await downloadCashSessionReportExcel(baseReport(), (m) => m)
    const rows = flat()
    expect(rows.some((r) => r.includes('Saldo físico | 280'))).toBe(true)
    expect(rows.some((r) => r.includes('DÓLARES'))).toBe(false)
  })

  it('con dólares muestra el efectivo en soles, el detalle por moneda y los avisos de TC', async () => {
    await downloadCashSessionReportExcel(
      baseReport({
        currency: {
          has_foreign: true,
          by_currency: [
            { currency: 'PEN', rows: 3, sum_income: 150, sum_expense: 20, net_movement: 130, sum_income_pen: 150, sum_expense_pen: 20, net_pen: 130 },
            { currency: 'USD', rows: 2, sum_income: 27, sum_expense: 0, net_movement: 27, sum_income_pen: 108, sum_expense_pen: 0, net_pen: 108 },
          ],
          total_income_pen: 258,
          total_expense_pen: 20,
          cash_income_pen: 258,
          cash_expense_pen: 20,
          physical_balance_pen: 338,
          rate_estimated_count: 1,
          rate_missing_count: 0,
        },
      }),
      (m) => m,
    )
    const rows = flat()
    expect(rows.some((r) => r.includes('EFECTIVO EN CAJA (EN SOLES)'))).toBe(true)
    expect(rows.some((r) => r.includes('Saldo físico | 338'))).toBe(true) // 100 + 258 − 20, no 280
    expect(rows.some((r) => r.includes('USD | 27 | 0 | 27 | 108'))).toBe(true)
    expect(rows.some((r) => r.includes('TOTAL NETO EN SOLES') && r.includes('238'))).toBe(true)
    expect(rows.some((r) => r.includes('Efectivo esperado para el arqueo (S/)') && r.includes('338'))).toBe(true)
    expect(rows.some((r) => r.includes('1 movimiento(s) con TC del día de emisión'))).toBe(true)
  })
})
