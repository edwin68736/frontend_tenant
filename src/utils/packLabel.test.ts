import { describe, expect, it } from 'vitest'
import { formatPackLabel } from '@/utils/packLabel'
import { receiptItemDisplayDescription } from '@/utils/receiptBonificacion'
import type { PrintItem } from '@/types/printData'

describe('contenido de la unidad de venta en el comprobante', () => {
  it('arma «12 UND» para una caja de 12 y nada para base o fraccionarias', () => {
    expect(formatPackLabel(12, 'NIU')).toBe('12 UND')
    expect(formatPackLabel(100, 'KGM')).toBe('100 KG')
    expect(formatPackLabel(2.5, 'LTR')).toBe('2.5 LT')
    expect(formatPackLabel(1, 'NIU')).toBe('')
    expect(formatPackLabel(0.001, 'KGM')).toBe('')
    expect(formatPackLabel(12, '')).toBe('')
    expect(formatPackLabel(undefined, 'NIU')).toBe('')
  })

  const item = (extra: Partial<PrintItem>) => ({ description: 'Galletas Soda', unit: 'BX', quantity: 2, unit_price: 10, total: 20, ...extra }) as PrintItem

  it('la descripción lleva el paréntesis pegado, y la nota de línea sigue debajo', () => {
    expect(receiptItemDisplayDescription(item({ pack_label: '12 UND' }))).toBe('Galletas Soda (12 UND)')
    expect(receiptItemDisplayDescription(item({ pack_label: '12 UND', item_note: 'sin caja' }))).toBe('Galletas Soda (12 UND)\n(sin caja)')
  })

  it('sin pack_label (venta por unidad o documento anterior) queda igual que siempre', () => {
    expect(receiptItemDisplayDescription(item({}))).toBe('Galletas Soda')
  })
})
