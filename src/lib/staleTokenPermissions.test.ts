import { describe, expect, it } from 'vitest'
import { hasStaleProductPermissions } from '@/lib/staleTokenPermissions'

describe('hasStaleProductPermissions', () => {
  it('escribe productos pero el token no trae manage_global ni manage: token anterior a V177', () => {
    expect(hasStaleProductPermissions(['products.view', 'products.edit'])).toBe(true)
    expect(hasStaleProductPermissions(['products.create'])).toBe(true)
    expect(hasStaleProductPermissions(['products.delete'])).toBe(true)
  })
  it('con manage_global o manage no hace falta renovar', () => {
    expect(hasStaleProductPermissions(['products.edit', 'products.manage_global'])).toBe(false)
    expect(hasStaleProductPermissions(['products.edit', 'products.manage'])).toBe(false)
  })
  it('quien solo consulta productos o no tiene permisos de productos no renueva', () => {
    expect(hasStaleProductPermissions(['products.view'])).toBe(false)
    expect(hasStaleProductPermissions(['sales.view'])).toBe(false)
    expect(hasStaleProductPermissions([])).toBe(false)
  })
})
