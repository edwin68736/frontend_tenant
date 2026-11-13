import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '@/services/products.service'

vi.mock('@/services/inventory.service', () => ({ inventoryService: { getStock: vi.fn().mockResolvedValue([]) } }))

import { WeightQuantityModal } from '@/components/pos/WeightQuantityModal'

afterEach(cleanup)

const product = (unit: string) => ({ id: 1, name: 'Producto granel', unit, sale_price: 4.5, manage_stock: false } as unknown as Product)

describe('WeightQuantityModal (venta por peso/volumen)', () => {
  it('un producto en KGM abre escribiendo en kilos, no en gramos', () => {
    render(<WeightQuantityModal product={product('KGM')} onClose={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('Cantidad (kg)')).toBeTruthy()
    expect(screen.getByPlaceholderText('Ej: 1.5')).toBeTruthy()
  })

  it('un producto en LTR abre escribiendo en litros, no en mililitros', () => {
    render(<WeightQuantityModal product={product('LTR')} onClose={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('Cantidad (L)')).toBeTruthy()
  })

  it('la cantidad escrita por defecto se toma como kilos', () => {
    const onConfirm = vi.fn()
    render(<WeightQuantityModal product={product('KGM')} onClose={vi.fn()} onConfirm={onConfirm} />)
    fireEvent.change(screen.getByPlaceholderText('Ej: 1.5'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm.mock.calls[0][0].quantity).toBe(2)
  })

  it('el atajo de gramos sigue disponible y convierte a kilos', () => {
    const onConfirm = vi.fn()
    render(<WeightQuantityModal product={product('KGM')} onClose={vi.fn()} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: '250g' }))
    expect(screen.getByText('Cantidad (g)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }))
    expect(onConfirm.mock.calls[0][0].quantity).toBe(0.25)
  })
})
