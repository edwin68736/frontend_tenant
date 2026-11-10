import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true }) }))
vi.mock('@/services/session.service', () => ({
  sessionService: { getContext: vi.fn(), switchBranch: vi.fn() },
}))

import { BranchProvider, useBranch } from '@/contexts/BranchContext'
import BranchKeyedOutlet from '@/layouts/BranchKeyedOutlet'
import { sessionService } from '@/services/session.service'
import { BRANCH_INVALID_EVENT, SESSION_REFRESHED_EVENT } from '@/services/api'
import { registerBranchCache } from '@/lib/branchScope/caches'
import { clearPendingWork, usePendingWork } from '@/lib/branchScope/pendingWork'
import { __resetEpochState, currentEpoch } from '@/lib/branchScope/requestEpoch'

const A = { id: 1, name: 'Sucursal A', is_main: true }
const B = { id: 2, name: 'Sucursal B' }

const getContext = vi.mocked(sessionService.getContext)
const switchBranchApi = vi.mocked(sessionService.switchBranch)

let branch!: ReturnType<typeof useBranch>
function Capture() {
  branch = useBranch()
  return null
}

let cartMounts = 0
/** Réplica mínima del POS: el carrito vive en useState y declara trabajo pendiente igual que POSPage. */
function PosLikePage() {
  const [cart, setCart] = useState<string[]>([])
  usePendingWork('carrito del POS', cart.length > 0)
  cartMounts += 1
  return (
    <div>
      <span data-testid="branch-id">{branch.activeBranchId}</span>
      <span data-testid="cart-count">{cart.length}</span>
      <button onClick={() => setCart((c) => [...c, 'producto de la sucursal A'])}>agregar</button>
    </div>
  )
}

function renderApp() {
  return render(
    <BranchProvider>
      <Capture />
      <MemoryRouter>
        <Routes>
          <Route element={<BranchKeyedOutlet />}>
            <Route path="/" element={<PosLikePage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </BranchProvider>,
  )
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const switchOk = (b = B) => ({
  token: 'tok-nuevo',
  refresh_token: 'ref-nuevo',
  active_branch: b,
  can_switch_branch: true,
  allowed_branches: [A, B],
})

beforeEach(() => {
  __resetEpochState()
  clearPendingWork()
  cartMounts = 0
  localStorage.clear()
  localStorage.setItem('token', 'tok-viejo')
  localStorage.setItem('refresh_token', 'ref-viejo')
  localStorage.setItem('active_branch', JSON.stringify(A))
  localStorage.setItem('can_switch_branch', 'true')
  localStorage.setItem('allowed_branches', JSON.stringify([A, B]))
  getContext.mockReset()
  switchBranchApi.mockReset()
})

afterEach(() => cleanup())

describe('switchBranch', () => {
  it('está serializado: un segundo cambio mientras hay uno en curso se ignora (una sola llamada al servidor)', async () => {
    const d = deferred<ReturnType<typeof switchOk>>()
    switchBranchApi.mockReturnValue(d.promise)
    renderApp()

    let r1!: Promise<unknown>
    let r2!: Promise<unknown>
    await act(async () => {
      r1 = branch.switchBranch(2)
      r2 = branch.switchBranch(3)
      await Promise.resolve()
    })
    expect(await r2).toEqual({ status: 'busy' })
    expect(branch.switching).toBe(true)
    expect(switchBranchApi).toHaveBeenCalledTimes(1)
    expect(switchBranchApi).toHaveBeenCalledWith(2)

    await act(async () => {
      d.resolve(switchOk())
      await r1
    })
    expect(branch.switching).toBe(false)
    expect(branch.activeBranchId).toBe(2)
    expect(switchBranchApi).toHaveBeenCalledTimes(1)
  })

  it('actualiza token Y refresh_token, avisa a AuthContext para re-leer claims/permisos y sube la época', async () => {
    switchBranchApi.mockResolvedValue(switchOk())
    const onRefreshed = vi.fn()
    window.addEventListener(SESSION_REFRESHED_EVENT, onRefreshed)
    renderApp()
    const epochBefore = currentEpoch()

    await act(async () => {
      expect(await branch.switchBranch(2)).toEqual({ status: 'ok' })
    })

    expect(localStorage.getItem('token')).toBe('tok-nuevo')
    expect(localStorage.getItem('refresh_token')).toBe('ref-nuevo')
    expect((onRefreshed.mock.calls[0][0] as CustomEvent).detail.token).toBe('tok-nuevo')
    expect(JSON.parse(localStorage.getItem('active_branch')!)).toEqual(B)
    expect(branch.resetEpoch).toBe(1)
    expect(currentEpoch()).toBe(epochBefore + 1)
    window.removeEventListener(SESSION_REFRESHED_EVENT, onRefreshed)
  })

  it('vacía las cachés ligadas a la sucursal solo cuando el cambio tuvo éxito', async () => {
    const clear = vi.fn()
    registerBranchCache('test-branch-cache', clear)
    renderApp()

    switchBranchApi.mockRejectedValueOnce({ response: { data: { error: 'No tiene acceso a esta sucursal' } } })
    await act(async () => {
      const res = await branch.switchBranch(2)
      expect(res.status).toBe('error')
    })
    expect(clear).not.toHaveBeenCalled()
    expect(localStorage.getItem('token')).toBe('tok-viejo')
    expect(branch.activeBranchId).toBe(1)
    expect(branch.switching).toBe(false)

    // El cerrojo se liberó: un nuevo intento funciona.
    switchBranchApi.mockResolvedValueOnce(switchOk())
    await act(async () => {
      expect(await branch.switchBranch(2)).toEqual({ status: 'ok' })
    })
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('cambiar a la sucursal ya activa no hace nada', async () => {
    renderApp()
    await act(async () => {
      expect(await branch.switchBranch(1)).toEqual({ status: 'same' })
    })
    expect(switchBranchApi).not.toHaveBeenCalled()
  })
})

describe('remontaje por sucursal y POS sin carrito de otra sucursal', () => {
  it('la pantalla se remonta al cambiar de sucursal: el carrito de la sucursal anterior NO sobrevive', async () => {
    switchBranchApi.mockResolvedValue(switchOk())
    renderApp()
    fireEvent.click(screen.getByText('agregar'))
    fireEvent.click(screen.getByText('agregar'))
    expect(screen.getByTestId('cart-count').textContent).toBe('2')
    const mountsBefore = cartMounts

    await act(async () => {
      await branch.switchBranch(2, { confirmed: true })
    })

    expect(screen.getByTestId('branch-id').textContent).toBe('2')
    expect(screen.getByTestId('cart-count').textContent).toBe('0')
    expect(cartMounts).toBeGreaterThan(mountsBefore)
  })

  it('con carrito con ítems pide confirmación y NO cambia ni llama al servidor hasta confirmar', async () => {
    switchBranchApi.mockResolvedValue(switchOk())
    renderApp()
    fireEvent.click(screen.getByText('agregar'))

    let res: unknown
    await act(async () => {
      res = await branch.switchBranch(2)
    })
    expect(res).toEqual({ status: 'pending', labels: ['carrito del POS'] })
    expect(switchBranchApi).not.toHaveBeenCalled()
    expect(branch.activeBranchId).toBe(1)
    expect(screen.getByTestId('cart-count').textContent).toBe('1') // sigue en la sucursal A, intacto

    await act(async () => {
      await branch.switchBranch(2, { confirmed: true })
    })
    expect(branch.activeBranchId).toBe(2)
    expect(screen.getByTestId('cart-count').textContent).toBe('0')
  })

  it('un carrito vacío no pide confirmación', async () => {
    switchBranchApi.mockResolvedValue(switchOk())
    renderApp()
    await act(async () => {
      expect(await branch.switchBranch(2)).toEqual({ status: 'ok' })
    })
  })

  it('sin cambio de sucursal, un re-render no remonta la pantalla (el carrito se conserva)', async () => {
    renderApp()
    fireEvent.click(screen.getByText('agregar'))
    const mounts = cartMounts
    fireEvent.click(screen.getByText('agregar'))
    expect(screen.getByTestId('cart-count').textContent).toBe('2')
    // Solo re-renders por el cambio de estado local, ningún remontaje: el estado se mantiene.
    expect(cartMounts).toBeGreaterThanOrEqual(mounts)
  })
})

describe('BRANCH_REQUIRED / BRANCH_FORBIDDEN', () => {
  it('refresca el contexto y, si la sucursal activa cambió, remonta las pantallas', async () => {
    getContext.mockResolvedValue({
      active_branch: B,
      can_switch_branch: true,
      allowed_branches: [B],
      branch_session_version: 3,
    })
    renderApp()
    expect(branch.activeBranchId).toBe(1)

    await act(async () => {
      window.dispatchEvent(new CustomEvent(BRANCH_INVALID_EVENT, { detail: { code: 'BRANCH_FORBIDDEN' } }))
    })
    await waitFor(() => expect(branch.activeBranchId).toBe(2))
    expect(getContext).toHaveBeenCalledTimes(1)
    expect(branch.resetEpoch).toBe(1)
  })

  it('no entra en bucle: varios errores seguidos provocan un solo refresco', async () => {
    getContext.mockResolvedValue({
      active_branch: A,
      can_switch_branch: true,
      allowed_branches: [A, B],
      branch_session_version: 1,
    })
    renderApp()
    await act(async () => {
      for (let i = 0; i < 4; i++) {
        window.dispatchEvent(new CustomEvent(BRANCH_INVALID_EVENT, { detail: { code: 'BRANCH_REQUIRED' } }))
      }
    })
    expect(getContext).toHaveBeenCalledTimes(1)
    expect(branch.resetEpoch).toBe(0) // la sucursal no cambió: no se remonta
  })
})
