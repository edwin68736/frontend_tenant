import { describe, expect, it } from 'vitest'
import type { PrintData } from '@/types/printData'
import { buildReceiptTotalLines } from './receiptTotals'

function base(extra: Partial<PrintData> = {}): PrintData {
  return {
    currency: 'PEN',
    sunat_code: '03',
    items: [],
    company: {},
    subtotal: 100,
    tax_amount: 18,
    total: 128,
    totals_by_affectation: { '10': { subtotal: 100, tax_amount: 18, total: 118 } },
    ...extra,
  } as unknown as PrintData
}

describe('buildReceiptTotalLines con recargo al consumo', () => {
  it('agrega la fila entre el IGV y el total cuando hay recargo', () => {
    const lines = buildReceiptTotalLines(base({ service_charge_amount: 10, service_charge_rate: 10 }))
    const labels = lines.map((l) => l.label)
    const iIgv = labels.indexOf('IGV:')
    expect(iIgv).toBeGreaterThanOrEqual(0)
    expect(lines[iIgv + 1]).toEqual({ label: 'Recargo al consumo (10 %):', amount: 10 })
    expect(lines[iIgv + 2]).toMatchObject({ label: 'TOTAL A PAGAR:', amount: 128, bold: true })
  })

  it('no agrega la fila sin recargo', () => {
    const lines = buildReceiptTotalLines(base({ total: 118 }))
    expect(lines.some((l) => l.label.startsWith('Recargo'))).toBe(false)
    const zero = buildReceiptTotalLines(base({ total: 118, service_charge_amount: 0 }))
    expect(zero.some((l) => l.label.startsWith('Recargo'))).toBe(false)
  })
})
