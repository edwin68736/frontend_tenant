import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Categorías por sucursal (V192) en la pantalla de Categorías: columna «Sucursal», selector «Disponible en» y qué puede
// gestionar cada usuario (administrador del catálogo vs. usuario de una sucursal).

let manageGlobal = true
vi.mock('@/hooks/useCatalogAccess', () => ({
  useCatalogAccess: () => ({
    canManageGlobal: manageGlobal,
    canCreateGlobal: manageGlobal,
    canEditGlobal: manageGlobal,
    canDeleteGlobal: manageGlobal,
    canEditBranchData: true,
    canCreateBranchData: true,
    canDeleteBranchData: true,
  }),
}))
vi.mock('@/contexts/BranchContext', () => ({ useBranch: () => ({ activeBranchId: 1 }) }))
vi.mock('@/components/ui/RequireModule', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

const createCategory = vi.fn(async (input: unknown) => ({ id: 99, ...(input as object) }))
const updateCategory = vi.fn(async () => ({ id: 1 }))
const listBranches = vi.fn()
const listCategories = vi.fn()
vi.mock('@/services/products.service', () => ({
  getProductImageUrl: (u?: string) => u ?? '',
  productsService: {
    listCategories: (...a: unknown[]) => listCategories(...a),
    createCategory: (...a: unknown[]) => createCategory(...(a as [unknown])),
    updateCategory: (...a: unknown[]) => updateCategory(...(a as [])),
    deleteCategory: vi.fn(),
    uploadCategoryImage: vi.fn(),
    deleteCategoryImage: vi.fn(),
  },
}))
vi.mock('@/services/company.service', () => ({ companyService: { listBranches: () => listBranches() } }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import CategoriesPage from './CategoriesPage'

const BRANCHES = [
  { id: 1, name: 'Principal' },
  { id: 2, name: 'Surco' },
]
const CATS = [
  { id: 1, name: 'Postres', sort_order: 1, branch_id: null, product_count: 0 },
  { id: 2, name: 'Bebidas', sort_order: 2, branch_id: 1, product_count: 0 },
  { id: 3, name: 'Parrillas', sort_order: 3, branch_id: 2, product_count: 0 },
]

beforeEach(() => {
  manageGlobal = true
  listBranches.mockResolvedValue(BRANCHES)
  listCategories.mockResolvedValue(CATS)
  createCategory.mockClear()
  updateCategory.mockClear()
})
afterEach(cleanup)

describe('CategoriesPage con varias sucursales', () => {
  it('muestra la columna Sucursal: «Todas» para las de todas y el nombre para las de una sucursal', async () => {
    render(<CategoriesPage />)
    await waitFor(() => expect(screen.getByText('Sucursal')).toBeTruthy())
    expect(screen.getByText('Todas')).toBeTruthy()
    expect(screen.getAllByText('Principal').length).toBeGreaterThan(0)
    expect(screen.getByText('Surco')).toBeTruthy()
  })

  it('administrador del catálogo: elige entre todas las sucursales y cada una; por defecto «Todas»', async () => {
    render(<CategoriesPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Nueva categoría/ }))
    const select = (await screen.findByDisplayValue('Todas las sucursales')) as HTMLSelectElement
    expect(select.disabled).toBe(false)
    expect(Array.from(select.options).map((o) => o.text)).toEqual(['Todas las sucursales', 'Solo Principal', 'Solo Surco'])

    fireEvent.change(screen.getByPlaceholderText(/Bebidas, Electrónica/), { target: { value: 'Lácteos' } })
    fireEvent.change(select, { target: { value: '2' } })
    fireEvent.click(screen.getByText('Crear categoría'))
    await waitFor(() => expect(createCategory).toHaveBeenCalled())
    expect(createCategory.mock.calls[0][0]).toMatchObject({ name: 'Lácteos', branch_id: 2 })
  })

  it('sin sucursal elegida se crea para todas (branch_id null)', async () => {
    render(<CategoriesPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Nueva categoría/ }))
    fireEvent.change(await screen.findByPlaceholderText(/Bebidas, Electrónica/), { target: { value: 'Snacks' } })
    fireEvent.click(screen.getByText('Crear categoría'))
    await waitFor(() => expect(createCategory).toHaveBeenCalled())
    expect((createCategory.mock.calls[0][0] as { branch_id?: number | null }).branch_id).toBeNull()
  })

  it('usuario de una sucursal: solo ve su sucursal, ya elegida y bloqueada; no puede «Todas»', async () => {
    manageGlobal = false
    render(<CategoriesPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Nueva categoría/ }))
    const select = (await screen.findByDisplayValue('Solo Principal')) as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(Array.from(select.options).map((o) => o.text)).toEqual(['Solo Principal'])
  })

  it('usuario de una sucursal: solo edita/elimina las de su sucursal', async () => {
    manageGlobal = false
    render(<CategoriesPage />)
    await screen.findByText('Bebidas')
    expect(screen.queryByLabelText('Editar Bebidas')).toBeTruthy() // de su sucursal (1)
    expect(screen.queryByLabelText('Editar Postres')).toBeNull() // de todas
    expect(screen.queryByLabelText('Editar Parrillas')).toBeNull() // de otra sucursal
  })

  it('administrador del catálogo: edita todas', async () => {
    render(<CategoriesPage />)
    await screen.findByText('Bebidas')
    for (const n of ['Postres', 'Bebidas', 'Parrillas']) expect(screen.queryByLabelText(`Editar ${n}`)).toBeTruthy()
  })

  it('con una sola sucursal no aparece ni la columna ni el selector (todo sigue como antes)', async () => {
    listBranches.mockResolvedValue([BRANCHES[0]])
    render(<CategoriesPage />)
    await screen.findByText('Bebidas')
    expect(screen.queryByText('Sucursal')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Nueva categoría/ }))
    expect(screen.queryByText('Disponible en')).toBeNull()
    fireEvent.change(await screen.findByPlaceholderText(/Bebidas, Electrónica/), { target: { value: 'Snacks' } })
    fireEvent.click(screen.getByText('Crear categoría'))
    await waitFor(() => expect(createCategory).toHaveBeenCalled())
    expect('branch_id' in (createCategory.mock.calls[0][0] as object)).toBe(false)
  })
})
