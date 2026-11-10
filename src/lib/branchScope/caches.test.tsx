import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => ({ activeBranchId: 1, activeBranch: { id: 1, name: 'A' }, resetEpoch: 0 }),
}))
vi.mock('@/services/company.service', () => ({
  companyService: { listBranches: vi.fn() },
}))
vi.mock('@/services/products.service', () => ({
  productsService: { getSaleUnit: vi.fn() },
}))

import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { companyService } from '@/services/company.service'
import { productsService } from '@/services/products.service'
import {
  __registeredCacheNames,
  clearAllCaches,
  registerBranchCache,
  registerSessionCache,
  resetBranchCaches,
} from '@/lib/branchScope/caches'
import { loadBranches } from '@/lib/branchIdentity/store'
import { resolveSaleUnitNames } from '@/utils/saleUnitNames'
import { idempotencyKeyFor } from '@/utils/idempotencyKey'
import { getLocalExchangeRate, setLocalExchangeRate } from '@/utils/exchangeRateCache'
import { getCompanyConfigCache, setCompanyConfigCache } from '@/lib/companyConfig/store'
import { getTodayPeru } from '@/utils/datesPeru'
import type { CompanyConfig } from '@/services/company.service'

const listBranches = vi.mocked(companyService.listBranches)
const getSaleUnit = vi.mocked(productsService.getSaleUnit)

beforeEach(() => {
  localStorage.clear()
  listBranches.mockReset()
  getSaleUnit.mockReset()
  clearAllCaches()
})
afterEach(() => cleanup())

describe('registro único de cachés', () => {
  it('resetBranchCaches vacía solo las cachés de sucursal; clearAllCaches vacía todas', () => {
    const b = vi.fn()
    const s = vi.fn()
    registerBranchCache('t-branch', b)
    registerSessionCache('t-session', s)

    resetBranchCaches()
    expect(b).toHaveBeenCalledTimes(1)
    expect(s).not.toHaveBeenCalled()

    clearAllCaches()
    expect(b).toHaveBeenCalledTimes(2)
    expect(s).toHaveBeenCalledTimes(1)
  })

  it('una caché que falla al limpiarse no impide limpiar las demás', () => {
    const ok = vi.fn()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    registerBranchCache('t-boom', () => {
      throw new Error('boom')
    })
    registerBranchCache('t-ok', ok)
    clearAllCaches()
    expect(ok).toHaveBeenCalled()
    registerBranchCache('t-boom', () => {}) // neutraliza la caché defectuosa para el resto del archivo
  })

  it('los módulos con estado de sucursal/sesión están registrados', () => {
    const names = __registeredCacheNames()
    expect(names.branch).toEqual(expect.arrayContaining(['branchIdentity', 'saleUnitNames', 'idempotencyKeys']))
    expect(names.session).toEqual(expect.arrayContaining(['companyConfig', 'exchangeRates']))
  })
})

describe('las cachés reales se vacían', () => {
  it('branchIdentity: la lista de sucursales se vuelve a pedir tras cambiar de sucursal y tras logout', async () => {
    listBranches.mockResolvedValue([{ id: 1, name: 'A' }] as never)
    await loadBranches()
    await loadBranches()
    expect(listBranches).toHaveBeenCalledTimes(1) // caché

    resetBranchCaches() // cambio de sucursal
    await loadBranches()
    expect(listBranches).toHaveBeenCalledTimes(2)

    clearAllCaches() // logout (Tauri/Android sin recarga)
    await loadBranches()
    expect(listBranches).toHaveBeenCalledTimes(3)
  })

  it('saleUnitNames: se vuelve a resolver tras cambiar de sucursal / logout', async () => {
    getSaleUnit.mockResolvedValue({ name: 'Caja', allow_fraction: false } as never)
    const lines = [{ product_id: 10, sale_unit_id: 5 }]
    await resolveSaleUnitNames(lines)
    await resolveSaleUnitNames(lines)
    expect(getSaleUnit).toHaveBeenCalledTimes(1)
    clearAllCaches()
    await resolveSaleUnitNames(lines)
    expect(getSaleUnit).toHaveBeenCalledTimes(2)
  })

  it('claves de idempotencia: no sobrevive la clave de un cobro de otra sucursal/sesión', () => {
    const k1 = idempotencyKeyFor('pos-checkout', { total: 10 })
    expect(idempotencyKeyFor('pos-checkout', { total: 10 })).toBe(k1)
    resetBranchCaches()
    expect(idempotencyKeyFor('pos-checkout', { total: 10 })).not.toBe(k1)
  })

  it('tipo de cambio y config de empresa (localStorage) se limpian en logout', () => {
    const fecha = getTodayPeru()
    setLocalExchangeRate(fecha, {
      success: true,
      venta: 3.75,
      compra: 3.7,
      fecha,
      status: 'confirmed',
    } as never)
    expect(getLocalExchangeRate(fecha)).not.toBeNull()
    setCompanyConfigCache({ business_name: 'ACME' } as unknown as CompanyConfig)
    expect(getCompanyConfigCache()).not.toBeNull()

    clearAllCaches()

    expect(getLocalExchangeRate(fecha)).toBeNull()
    expect(getCompanyConfigCache()).toBeNull()
  })
})

describe('logout de AuthContext', () => {
  it('limpia todas las cachés registradas, la sesión y los datos de sucursal', async () => {
    // Sin esto jsdom escribe "Not implemented: navigation" al asignar window.location.href.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const cleared = vi.fn()
    registerBranchCache('t-logout-branch', cleared)
    const sessionCleared = vi.fn()
    registerSessionCache('t-logout-session', sessionCleared)

    localStorage.setItem('token', 'x.y.z')
    localStorage.setItem('refresh_token', 'r')
    localStorage.setItem('user', JSON.stringify({ id: 1, name: 'U', email: 'u@x', role: 'Administrador' }))
    localStorage.setItem('active_branch', JSON.stringify({ id: 1, name: 'A' }))
    localStorage.setItem('can_switch_branch', 'true')
    localStorage.setItem('allowed_branches', JSON.stringify([{ id: 1, name: 'A' }]))

    let auth!: ReturnType<typeof useAuth>
    function Probe() {
      auth = useAuth()
      return null
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    expect(auth.isAuthenticated).toBe(true)
    cleared.mockClear()
    sessionCleared.mockClear()

    await act(async () => {
      auth.logout()
    })

    expect(cleared).toHaveBeenCalled()
    expect(sessionCleared).toHaveBeenCalled()
    for (const k of ['token', 'refresh_token', 'user', 'active_branch', 'can_switch_branch', 'allowed_branches']) {
      expect(localStorage.getItem(k)).toBeNull()
    }
  })
})
