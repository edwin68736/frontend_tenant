import { describe, expect, it } from 'vitest'
import { purchaseDocNumber, purchasePdfFileName } from '@/utils/purchasePdf'
import type { Purchase } from '@/services/purchases.service'

const base = { series: 'F777', number: '9001' } as Purchase

describe('purchasePdf', () => {
  it('rellena el número a 8 dígitos como el listado de compras', () => {
    expect(purchaseDocNumber(base)).toBe('F777-00009001')
  })

  it('respeta números alfanuméricos y compras sin serie', () => {
    expect(purchaseDocNumber({ series: 'F003', number: '0VIS-001' } as Purchase)).toBe('F003-0VIS-001')
    expect(purchaseDocNumber({ series: '', number: '123' } as Purchase)).toBe('00000123')
  })

  it('nombra el archivo según el formato', () => {
    expect(purchasePdfFileName(base, 'a4')).toBe('compra-F777-00009001.pdf')
    expect(purchasePdfFileName(base, 'ticket')).toBe('compra-F777-00009001-ticket.pdf')
  })
})
