import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasTenantPermission } from '@/lib/permissions'
import { computeCatalogAccess } from '@/lib/catalogAccess'

let perms: string[] = []
let canWrite = true
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: (p: string) => hasTenantPermission(perms, p) }),
}))
vi.mock('@/hooks/useBranchWriteGuard', () => ({ useBranchWriteGuard: () => ({ canWrite }) }))

import { useCatalogAccess } from '@/hooks/useCatalogAccess'

function Probe() {
  const a = useCatalogAccess()
  return (
    <div>
      {a.canCreateGlobal && <button>Nuevo producto</button>}
      {a.canEditGlobal && <button>Editar datos globales</button>}
      {a.canDeleteGlobal && <button>Eliminar</button>}
      {a.canEditBranchData && <button>Precio por sucursal</button>}
    </div>
  )
}

afterEach(() => {
  cleanup()
  perms = []
  canWrite = true
})

const has = (p: string[]) => (x: string) => hasTenantPermission(p, x)

describe('acceso al catálogo (products.manage_global)', () => {
  it('products.edit/create/delete SIN manage_global: nada del catálogo global; lo comercial por sucursal sí', () => {
    const a = computeCatalogAccess(has(['products.view', 'products.create', 'products.edit', 'products.delete']), true)
    expect(a.canManageGlobal).toBe(false)
    expect(a.canCreateGlobal || a.canEditGlobal || a.canDeleteGlobal).toBe(false)
    expect(a.canEditBranchData).toBe(true)
    expect(a.canCreateBranchData).toBe(true)
    expect(a.canDeleteBranchData).toBe(true)
  })

  it('con manage_global + create/edit/delete se habilita el catálogo global', () => {
    const a = computeCatalogAccess(has(['products.manage_global', 'products.create', 'products.edit', 'products.delete']), true)
    expect(a).toMatchObject({ canCreateGlobal: true, canEditGlobal: true, canDeleteGlobal: true, canEditBranchData: true })
  })

  it('products.manage implica manage_global (hasPermission respeta .manage)', () => {
    const a = computeCatalogAccess(has(['products.manage']), true)
    expect(a.canManageGlobal).toBe(true)
    expect(a.canCreateGlobal && a.canEditGlobal && a.canDeleteGlobal).toBe(true)
  })

  it('manage_global solo (sin create/edit/delete) no habilita acciones concretas', () => {
    const a = computeCatalogAccess(has(['products.manage_global']), true)
    expect(a.canManageGlobal).toBe(true)
    expect(a.canCreateGlobal || a.canEditGlobal || a.canDeleteGlobal || a.canEditBranchData).toBe(false)
  })

  it('en modo consulta (solo lectura) no se puede escribir nada, ni global ni por sucursal', () => {
    const a = computeCatalogAccess(has(['products.manage']), false)
    expect(Object.values(a).every((v) => v === false)).toBe(true)
  })

  it('los botones se renderizan solo si corresponde (hook + permisos reales)', () => {
    perms = ['products.view', 'products.create', 'products.edit', 'products.delete']
    const { unmount } = render(<Probe />)
    expect(screen.queryByText('Nuevo producto')).toBeNull()
    expect(screen.queryByText('Editar datos globales')).toBeNull()
    expect(screen.queryByText('Eliminar')).toBeNull()
    expect(screen.getByText('Precio por sucursal')).toBeTruthy()
    unmount()

    perms = ['products.create', 'products.edit', 'products.delete', 'products.manage_global']
    render(<Probe />)
    expect(screen.getByText('Nuevo producto')).toBeTruthy()
    expect(screen.getByText('Editar datos globales')).toBeTruthy()
    expect(screen.getByText('Eliminar')).toBeTruthy()
  })
})
