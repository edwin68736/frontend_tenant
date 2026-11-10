import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

let all = false
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => ({
    isAllBranches: all,
    activeBranch: { id: 1, name: 'A' },
    allowedBranches: [{ id: 1, name: 'A' }],
    switchBranch: vi.fn(),
    setAllBranchesMode: vi.fn(),
  }),
}))

import RequireSingleBranch from '@/components/branch/RequireSingleBranch'

afterEach(() => {
  cleanup()
  all = false
})

describe('RequireSingleBranch (páginas de registro y POS)', () => {
  it('modo sucursal: muestra el formulario', () => {
    render(<RequireSingleBranch><form>formulario</form></RequireSingleBranch>)
    expect(screen.getByText('formulario')).toBeTruthy()
  })
  it('modo "todas": muestra el aviso y NO el formulario', () => {
    all = true
    render(<RequireSingleBranch><form>formulario</form></RequireSingleBranch>)
    expect(screen.getByText('Seleccione una sucursal para operar')).toBeTruthy()
    expect(screen.queryByText('formulario')).toBeNull()
  })
})
