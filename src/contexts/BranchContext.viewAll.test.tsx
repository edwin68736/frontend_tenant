import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true }) }))
vi.mock('@/services/session.service', () => ({
  sessionService: { getContext: vi.fn(), switchBranch: vi.fn() },
}))

import { BranchProvider, useBranch } from '@/contexts/BranchContext'
import { sessionService } from '@/services/session.service'
import { __resetEpochState, currentEpoch } from '@/lib/branchScope/requestEpoch'
import { getViewMode, setViewMode, viewModeStorageKey } from '@/lib/branchScope/viewMode'

const A = { id: 1, name: 'Sucursal A', is_main: true }
const B = { id: 2, name: 'Sucursal B' }
const getContext = vi.mocked(sessionService.getContext)
const switchBranchApi = vi.mocked(sessionService.switchBranch)

let branch!: ReturnType<typeof useBranch>
function Capture() {
  branch = useBranch()
  return null
}

function renderProvider() {
  return render(
    <BranchProvider>
      <Capture />
    </BranchProvider>,
  )
}

beforeEach(() => {
  __resetEpochState()
  setViewMode('single')
  localStorage.clear()
  localStorage.setItem('token', 'tok')
  localStorage.setItem('active_branch', JSON.stringify(A))
  localStorage.setItem('can_switch_branch', 'true')
  localStorage.setItem('allowed_branches', JSON.stringify([A, B]))
  getContext.mockReset()
  switchBranchApi.mockReset()
})
afterEach(() => cleanup())

describe('BranchContext: modo "Todas las sucursales"', () => {
  it('sin can_view_all no se puede entrar al modo', () => {
    renderProvider()
    expect(branch.canViewAll).toBe(false)
    let r!: { status: string }
    act(() => {
      r = branch.setAllBranchesMode(true)
    })
    expect(r.status).toBe('error')
    expect(branch.isAllBranches).toBe(false)
    expect(getViewMode()).toBe('single')
  })

  it('con can_view_all entra y sale del modo SIN reemitir token, remonta (época) y persiste por tenant', () => {
    localStorage.setItem('can_view_all', 'true')
    renderProvider()
    const epoch0 = currentEpoch()
    act(() => {
      expect(branch.setAllBranchesMode(true)).toEqual({ status: 'ok' })
    })
    expect(branch.isAllBranches).toBe(true)
    expect(getViewMode()).toBe('all')
    expect(localStorage.getItem(viewModeStorageKey())).toBe('all')
    expect(currentEpoch()).toBe(epoch0 + 1)
    expect(branch.activeBranchId).toBe(1) // el token conserva la última sucursal activa
    expect(switchBranchApi).not.toHaveBeenCalled()
    expect(localStorage.getItem('token')).toBe('tok')

    act(() => {
      expect(branch.setAllBranchesMode(false)).toEqual({ status: 'ok' })
    })
    expect(branch.isAllBranches).toBe(false)
    expect(localStorage.getItem(viewModeStorageKey())).toBeNull()
    expect(switchBranchApi).not.toHaveBeenCalled()
  })

  it('en modo "todas", elegir la sucursal activa solo sale del modo (sin llamada de cambio de sucursal)', async () => {
    localStorage.setItem('can_view_all', 'true')
    setViewMode('all')
    renderProvider()
    getContext.mockResolvedValue({
      active_branch: A,
      can_switch_branch: true,
      allowed_branches: [A, B],
      can_view_all: true,
      branch_session_version: 1,
    })
    expect(branch.isAllBranches).toBe(true)
    await act(async () => {
      expect(await branch.switchBranch(1)).toEqual({ status: 'ok' })
    })
    expect(branch.isAllBranches).toBe(false)
    expect(switchBranchApi).not.toHaveBeenCalled()
  })

  it('si el servidor deja de dar can_view_all, el modo persistido se apaga', async () => {
    localStorage.setItem('can_view_all', 'true')
    setViewMode('all')
    getContext.mockResolvedValue({
      active_branch: A,
      can_switch_branch: true,
      allowed_branches: [A, B],
      can_view_all: false,
      branch_session_version: 1,
    })
    await act(async () => {
      renderProvider()
    })
    expect(getContext).toHaveBeenCalled()
    expect(branch.canViewAll).toBe(false)
    expect(branch.isAllBranches).toBe(false)
    expect(getViewMode()).toBe('single')
  })
})
