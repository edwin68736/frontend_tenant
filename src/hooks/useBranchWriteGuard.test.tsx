import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }))

let allBranches = false
vi.mock('@/contexts/BranchContext', () => ({ useBranch: () => ({ isAllBranches: allBranches }) }))

import { useBranchWriteGuard } from '@/hooks/useBranchWriteGuard'
import { BRANCH_READ_ONLY_MESSAGE } from '@/lib/branchScope/viewMode'

beforeEach(() => {
  allBranches = false
  toastError.mockReset()
})

describe('useBranchWriteGuard', () => {
  it('en modo sucursal permite escribir y ejecuta la acción', () => {
    const { result } = renderHook(() => useBranchWriteGuard())
    const fn = vi.fn(() => 42)
    expect(result.current.isReadOnlyMode).toBe(false)
    expect(result.current.canWrite).toBe(true)
    expect(result.current.guard(fn)).toBe(42)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(toastError).not.toHaveBeenCalled()
  })

  it('en modo "todas las sucursales" es de solo lectura: no ejecuta la acción y avisa', () => {
    allBranches = true
    const { result } = renderHook(() => useBranchWriteGuard())
    const fn = vi.fn()
    expect(result.current.isReadOnlyMode).toBe(true)
    expect(result.current.canWrite).toBe(false)
    expect(result.current.guard(fn)).toBeUndefined()
    expect(fn).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith(BRANCH_READ_ONLY_MESSAGE, expect.anything())
  })
})
