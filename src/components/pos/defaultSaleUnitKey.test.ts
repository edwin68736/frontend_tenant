import { describe, expect, it } from 'vitest'
import type { ProductSaleUnit } from '@/services/products.service'
import { defaultSaleUnitKey } from '@/components/pos/ProductConfigureModal'

const unit = (id: number, extra: Partial<ProductSaleUnit> = {}) => ({ id, name: `u${id}`, is_base: false, ...extra }) as unknown as ProductSaleUnit

describe('defaultSaleUnitKey (unidad preseleccionada al vender)', () => {
  it('producto por kilo con unidad de venta «gramo»: abre en kilos (unidad base), no en gramos', () => {
    expect(defaultSaleUnitKey([unit(4)], 'KGM')).toBe('base')
  })
  it('producto por litro con «mililitro»: abre en litros', () => {
    expect(defaultSaleUnitKey([unit(5)], 'LTR')).toBe('base')
  })
  it('si la unidad base ya es una unidad de venta real, esa', () => {
    expect(defaultSaleUnitKey([unit(7, { is_base: true }), unit(8)], 'KGM')).toBe('su-7')
  })
  it('producto que no es de peso/volumen con varias opciones: no preselecciona nada', () => {
    expect(defaultSaleUnitKey([unit(9)], 'NIU')).toBeNull()
  })
  it('una sola opción posible: esa', () => {
    expect(defaultSaleUnitKey([unit(10, { is_base: true })], 'NIU')).toBe('su-10')
  })
  it('sin unidades de venta: nada', () => {
    expect(defaultSaleUnitKey([], 'KGM')).toBeNull()
  })
})
