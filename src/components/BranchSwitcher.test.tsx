import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/company.service', () => ({ companyService: { listBranches: vi.fn().mockResolvedValue([]) } }))

const A = { id: 1, name: 'Sucursal A' }
const B = { id: 2, name: 'Sucursal B' }
const setAllBranchesMode = vi.fn(() => ({ status: 'ok' }))
const switchBranch = vi.fn(async () => ({ status: 'ok' }))
let ctx: Record<string, unknown>

vi.mock('@/contexts/BranchContext', () => ({ useBranch: () => ctx }))

import { BranchSwitcherUserMenu } from '@/components/BranchSwitcher'

beforeEach(() => {
  setAllBranchesMode.mockClear()
  switchBranch.mockClear()
  ctx = {
    activeBranch: A,
    allowedBranches: [A, B],
    canSwitchBranch: true,
    canViewAll: false,
    isAllBranches: false,
    setAllBranchesMode,
    switchBranch,
    switching: false,
  }
})
afterEach(() => cleanup())

describe('selector de sucursal', () => {
  it('NO ofrece "Todas las sucursales" si el backend no dio can_view_all', () => {
    render(<BranchSwitcherUserMenu />)
    expect(screen.queryByRole('option', { name: 'Todas las sucursales' })).toBeNull()
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('ofrece "Todas las sucursales" solo con can_view_all y entra al modo sin cambiar de sucursal ni reemitir token', () => {
    ctx.canViewAll = true
    render(<BranchSwitcherUserMenu />)
    expect(screen.getByRole('option', { name: 'Todas las sucursales' })).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'all' } })
    expect(setAllBranchesMode).toHaveBeenCalledWith(true)
    expect(switchBranch).not.toHaveBeenCalled()
  })

  it('en modo "todas" el selector lo muestra seleccionado y elegir una sucursal sale del modo vía switchBranch', () => {
    ctx.canViewAll = true
    ctx.isAllBranches = true
    render(<BranchSwitcherUserMenu />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('all')
    fireEvent.change(select, { target: { value: '1' } })
    expect(switchBranch).toHaveBeenCalledWith(1)
  })
})
